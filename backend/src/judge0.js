// src/judge0.js
//
// Thin client for the Judge0 CE public execution API. Kept isolated
// here so the rest of the backend doesn't need to know about Judge0's
// specific request/response shape (base64 payloads, numeric status
// codes, polling contract) -- if this ever needs to swap to a
// self-hosted Judge0 instance or a different execution backend, only
// this file changes.

const JUDGE0_BASE = process.env.JUDGE0_BASE_URL || 'https://ce.judge0.com';

const STATUS_MAP = {
  1: 'In queue', 2: 'Processing', 3: 'Accepted', 4: 'Wrong answer',
  5: 'Time limit exceeded', 6: 'Compilation error', 7: 'Runtime error (SIGSEGV)',
  8: 'Runtime error (SIGXFSZ)', 9: 'Runtime error (SIGFPE)', 10: 'Runtime error (SIGABRT)',
  11: 'Runtime error (NZEC)', 12: 'Runtime error', 13: 'Internal error', 14: 'Exec format error',
};

function b64encode(str) {
  return Buffer.from(str || '', 'utf-8').toString('base64');
}

function b64decode(b64) {
  if (!b64) return '';
  return Buffer.from(b64, 'base64').toString('utf-8');
}

async function createSubmission({ languageId, source, stdin }) {
  const res = await fetch(`${JUDGE0_BASE}/submissions?base64_encoded=true&wait=false`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      language_id: languageId,
      source_code: b64encode(source),
      stdin: b64encode(stdin),
      cpu_time_limit: 8,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Judge0 submit failed (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  if (!data.token) throw new Error('Judge0 did not return a submission token');
  return data.token;
}

async function getSubmission(token) {
  const url = `${JUDGE0_BASE}/submissions/${token}?base64_encoded=true&fields=stdout,stderr,compile_output,message,status_id,time,memory`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Judge0 poll failed (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  return {
    statusId: data.status_id,
    statusLabel: STATUS_MAP[data.status_id] || 'Unknown',
    stdout: b64decode(data.stdout),
    stderr: b64decode(data.stderr),
    compileOutput: b64decode(data.compile_output),
    message: b64decode(data.message),
    time: data.time,
    memory: data.memory,
    isDone: data.status_id > 2,     // 1=queued, 2=processing; >2 means finished (success/error/etc.)
    isSuccess: data.status_id === 3,
  };
}

module.exports = { createSubmission, getSubmission, STATUS_MAP };
