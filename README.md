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
- **Backend**: Node.js + Express REST API. Proxies execution requests
  to the public [Judge0 CE](https://ce.judge0.com) API rather than
  running its own sandboxed compilers — building a secure multi-language
  execution sandbox from scratch is its own large project, and Judge0
  already solves that problem well. The backend's real job is the API
  surface in front of it: validation, rate limiting, and persistence.
- **Database**: SQLite (`better-sqlite3`) with a real schema — every
  run is recorded (language, status, execution time, timestamp), with
  indexed queries for recent-runs and per-language aggregate stats.
- **Rate limiting**: 20 requests/minute per client via
  `express-rate-limit`, so one client can't hammer the shared
  third-party execution API through this server.

**What this is *not***: there's no user accounts/auth, no Docker-based
sandboxing of our own, and Judge0's free public instance has its own
usage limits shared across everyone using it — this is a portfolio
project, not a production code-execution platform.

## Architecture

```
browser (CodeMirror editor)
   │  POST /api/execute  { language, source, stdin } → { token }
   │  GET  /api/execute/:token  (poll until done)
   │  GET  /api/history, /api/stats
   ▼
Express backend (server.js)
   │
   ├─ src/judge0.js    — Judge0 API client (submit, poll, decode base64)
   ├─ src/db.js        — SQLite schema + queries (better-sqlite3)
   └─ src/routes/
        execute.js      — POST/GET execution endpoints, rate limiting, validation
        history.js       — GET /api/history, GET /api/stats
```

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

```bash
cd backend
npm install
cp .env.example .env      # defaults are fine as-is
npm start
```
Open `http://localhost:8080`.

## Deploying

This is a standard Node/Express app (no Docker required) — Render,
Railway, or any Node-compatible host will auto-detect `package.json`
and run `npm install && npm start`. Set the `PORT` env var if your
host requires a specific one (Render/Heroku-style platforms set this
automatically and `server.js` already reads `process.env.PORT`).

One thing to check on whatever host you use: outbound HTTPS access to
`ce.judge0.com` needs to be allowed, or code execution will fail with
a 502 (the same error you'd see if this were misconfigured — it's a
clear, deliberate error message, not a silent failure).

## Why a backend at all, instead of calling Judge0 straight from the browser

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
