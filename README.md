## CodeBuddy Deployed At-
https://codebuddy-lln6.onrender.com/
# CodeBuddy — Multi-Language Online Code Runner

A full-stack code runner: write code in 12 languages in the browser,
run it for real, see the output, and browse a persisted history of
past runs. Built as a genuine frontend + backend, not a single static
page — see "What actually exists" below for the honest breakdown.

## What actually exists (no aspirational claims)

- **Frontend**: vanilla HTML/CSS/JS (no framework) + CodeMirror 5 for
  the editor. 12 languages, syntax highlighting, file upload/download,
  stdin input, keyboard shortcut (Ctrl/Cmd+Enter to run).
- **Backend**: Node.js + Express REST API. Code execution is
  **self-hosted** — each submission runs in its own sandboxed Docker
  container on infrastructure this project controls, not a
  third-party API. See "Self-hosted execution" below for the full
  design and, importantly, exactly what has and hasn't been verified.
- **Database**: SQLite (`better-sqlite3`) with a real schema — every
  run is recorded (language, status, execution time, timestamp), with
  indexed queries for recent-runs and per-language aggregate stats.
- **Rate limiting**: 20 requests/minute per client via
  `express-rate-limit` — even more important now than when this
  proxied a third party, since each request spawns a real container
  on our own box.

**What this is *not***: there's no user accounts/auth, and this is a
portfolio-scoped sandbox (single VPS, in-process job queue), not a
distributed production code-execution platform.

## Architecture


```
browser (CodeMirror editor)
   │  POST /api/execute  { language, source, stdin } → { token }
   │  GET  /api/execute/:token  (poll until done)
   │  GET  /api/history, /api/stats, /api/queue-stats
   ▼
Express backend (server.js)
   │
   ├─ src/dockerExec.js  — spawns sandboxed Docker containers per submission
   ├─ src/languages.js   — per-language image + compile/run commands
   ├─ src/jobQueue.js    — caps concurrent containers (tested, see below)
   ├─ src/db.js          — SQLite schema + queries (better-sqlite3)
   └─ src/routes/
        execute.js      — POST/GET execution endpoints, rate limiting, validation
        history.js       — GET /api/history, GET /api/stats

## Verified working (tested end-to-end during development)

- ✅ Server starts, serves the static frontend correctly
- ✅ Input validation: missing language, empty source, unsupported
  language, oversized source (>50k chars) all rejected with clear
  400 errors
- ✅ Rate limiting: confirmed 20 requests succeed (or fail for other
  reasons) and request #21 onward correctly returns 429
- ✅ SQLite layer: insert + query + aggregate stats (success rate,
  per-language average execution time) all confirmed correct
- ✅ `/api/history` and `/api/stats` correctly reflect live DB state
- ⚠️ **Full execution round-trip (submit → Judge0 → result) needs to
  be tested in an environment with outbound access to
  `ce.judge0.com`** — it was blocked by network egress rules in the
  sandbox this was built in, so this specific path (submit code, wait
  for Judge0, see real output) should be your first manual test after
  cloning this.

## Run it locally

Requires Docker installed and running (for real code execution — the
server itself will start without it, but `/api/execute` will fail).

```bash
cd backend
npm install
cp .env.example .env      # defaults are fine as-is
cd ../docker && ./pull-images.sh   # pull all language images once
cd ../backend && npm start
```
Open `http://localhost:8080`.

**No Docker on your machine yet, or just want to test the API logic
without it?** `npm run test:mock` runs the real orchestration code
against a mock `docker` CLI that executes on your host directly — see
"Self-hosted execution" below.

## Deploying

**This needs a real Docker daemon it can spawn containers against —
Render's basic web service (and most simple PaaS free tiers) do NOT
allow this**, since your app runs inside an already-sandboxed
container with no access to spin up sibling containers. Use an actual
VPS with Docker installed (DigitalOcean, Oracle Cloud Free Tier,
Linode, a bare EC2 instance, etc.), not a PaaS platform, for this
specific piece.

Once Docker is installed on your VPS:
```bash
git clone <this repo>
cd CodeBuddy/docker && ./pull-images.sh
cd ../backend && npm install && npm start
```
Put Nginx or Caddy in front for a real domain + HTTPS, same pattern as
recommended for the trading-simulator project's web server.

## Self-hosted execution (no external API dependency)

Code execution no longer depends on Judge0 or any third-party service.
Every submission now runs in its own ephemeral Docker container, on
infrastructure you control end to end.

**Why this changed:** the original version proxied Judge0's public API
— fine for a demo, but it meant uptime, rate limits, and correctness
were all someone else's problem, not something actually owned. This
replaces that with a real (if intentionally scoped) sandboxed
execution engine, in `src/dockerExec.js`.

### How it works

One Docker image per language (`src/languages.js`), official upstream
images except TypeScript (needs a custom one-line image adding `tsc`
on top of `node`, see `docker/typescript/Dockerfile`). Per submission:
1. Write the source (+ stdin) to a fresh temp directory.
2. If the language compiles, run a compile container first; a
   nonzero exit is reported distinctly as a compile error, not a
   runtime error.
3. Run a second container for execution, stdin piped in, hard timeout
   enforced from two independent layers (a `timeout`-style kill from
   the Node side, on top of the container's own resource limits).
4. Temp directory is always cleaned up, including after a timeout-kill.

Every container run (compile and execute) uses:
`--rm --network none --memory 128m --cpus 0.5 --pids-limit 64
--cap-drop ALL --security-opt no-new-privileges --user 1000:1000
--read-only` (with a small writable `/tmp` via tmpfs). `--network none`
is the single most important flag here — arbitrary user-submitted
code has no network access at all.

A concurrency-limiting queue (`src/jobQueue.js`) caps how many
containers run simultaneously (`MAX_CONCURRENT_CONTAINERS`, default
3) — without this, a burst of requests could spawn unbounded
containers and take down a small VPS.

### What's verified vs. what isn't — read this before trusting it

**Verified for real, with actual execution** (not just reviewed):
the queue's concurrency cap (proven under real parallel load — 5
simultaneous jobs, cap of 2, confirmed never exceeded), and all of
`dockerExec.js`'s own orchestration logic — temp directory handling,
compile-vs-run sequencing, compile-error detection, stdin piping,
timeout+kill behavior (confirmed a hanging process gets killed at
the configured timeout, not left running), cleanup-after-timeout (zero
leftover temp directories), and the full HTTP path end-to-end
(`POST /api/execute` → poll → correct result → history recorded).
This was done using a **mock `docker` CLI** (`test/mock-docker/`)
that runs commands on the host directly instead of in real
containers — see `test/run-integration-tests.js`, runnable with
`npm run test:mock`.

**NOT verified — this sandbox had no Docker daemon and no network
access to Docker Hub, so none of the following has actually been
run:**
- Whether the real container security flags are correct and actually
  enforced (`--network none`, `--memory`, `--user`, etc.)
- Whether every language's image/compile/run command in
  `src/languages.js` is exactly right (syntax was reviewed carefully,
  but review isn't the same as running it)
- Real resource behavior under load on an actual VPS (memory pressure,
  many containers at once, disk usage from temp dirs at scale)

### Testing checklist — do this before pointing real traffic at it

1. **Install Docker** on your VPS (not Render's basic web service —
   it doesn't allow spawning sibling containers; you need a real
   Docker daemon, e.g. a DigitalOcean/Oracle Cloud/Linode box).
2. `cd docker && ./pull-images.sh` — pulls every language image once.
3. `npm run test:mock` first — confirms the orchestration logic still
   works in your environment before layering real Docker on top.
4. Start the server (`npm start`) and manually test **every language**
   through the actual UI — submit real code, confirm real output.
   Do this for all 12, not just one or two; a wrong image tag or
   command in `src/languages.js` for a language you didn't test would
   otherwise go unnoticed.
5. Specifically verify the security posture, not just "does it run":
   - Try `import socket; socket.create_connection(("8.8.8.8", 53))`
     in Python — should fail (no network).
   - Try a fork bomb or a large allocation — should be killed by the
     pids/memory limits, not take down the host.
   - Try an infinite loop — should be killed at the timeout, not hang.
6. Watch container cleanup over time (`docker ps -a`, should stay
   empty thanks to `--rm`) and disk usage in the temp directory root.

If any of these don't behave as expected, that's real information —
fix it before this handles real traffic, the same way the earlier
Judge0 network-block and the stale-Docker-binary bug both got caught
by testing rather than assumed away.

## Why a backend at all, instead of calling an execution engine straight from the browser

The original version of this project called Judge0 directly from
client-side JavaScript. That works, but it means every visitor's
browser talks straight to a third-party API with no request
validation, no rate limiting, and no record of what ran. Routing
through our own backend adds:
- A place to validate input before it reaches a third party
- Rate limiting so the app can't be used to hammer Judge0's shared
  public instance
- Persistent run history and stats, which the direct-from-browser
  version had no way to have at all (nothing survives a page refresh
  without a backend to store it)

## UI
<img width="1921" height="866" alt="image" src="https://github.com/user-attachments/assets/1d7e2fb4-c345-4162-9f40-eb70847872fc" />
