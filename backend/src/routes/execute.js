// src/routes/execute.js
const express = require('express');
const rateLimit = require('express-rate-limit');
const judge0 = require('../judge0');
const { recordRun } = require('../db');

const router = express.Router();

// Real backend concern that didn't exist in the original single-file
// version: rate limiting so one client can't hammer the (shared,
// third-party) execution API through our server.
const executeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many run requests -- please wait a moment before trying again.' },
});

const LANGUAGE_IDS = {
  javascript: 63, typescript: 74, python: 71, c: 50, cpp: 54,
  java: 62, csharp: 51, go: 60, rust: 73, ruby: 72, php: 68, bash: 46,
};

// In-memory map from our own request id -> { judge0Token, language, source, startedAt }
// so we can record run history once a poll comes back finished, without
// the client needing to resend the source code on every poll.
const pending = new Map();

router.post('/execute', executeLimiter, async (req, res) => {
  const { language, source, stdin } = req.body || {};

  if (!language || !LANGUAGE_IDS[language]) {
    return res.status(400).json({ error: `Unsupported or missing language. Supported: ${Object.keys(LANGUAGE_IDS).join(', ')}` });
  }
  if (typeof source !== 'string' || source.length === 0) {
    return res.status(400).json({ error: 'source is required' });
  }
  if (source.length > 50000) {
    return res.status(400).json({ error: 'source too large (max 50000 chars)' });
  }

  try {
    const token = await judge0.createSubmission({
      languageId: LANGUAGE_IDS[language],
      source,
      stdin: stdin || '',
    });
    pending.set(token, { language, source, startedAt: Date.now() });
    res.json({ token });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

router.get('/execute/:token', async (req, res) => {
  const { token } = req.params;
  try {
    const result = await judge0.getSubmission(token);

    if (result.isDone) {
      const meta = pending.get(token);
      if (meta) {
        const execTimeMs = Date.now() - meta.startedAt;
        let status = 'error';
        if (result.isSuccess) status = 'success';
        else if (result.statusId === 5) status = 'timeout';
        recordRun({ language: meta.language, source: meta.source, status, execTimeMs });
        pending.delete(token);
      }
    }

    res.json(result);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

module.exports = router;
