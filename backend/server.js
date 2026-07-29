// server.js
require('dotenv').config();
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const path = require('path');

const executeRoutes = require('./src/routes/execute');
const historyRoutes = require('./src/routes/history');

const app = express();
const PORT = process.env.PORT || 8080;
const SESSION_COOKIE = 'codebuddy_session';

function parseCookieHeader(header = '') {
  return header.split(';').map(cookie => cookie.trim()).reduce((map, cookie) => {
    const [name, ...rest] = cookie.split('=');
    if (!name) return map;
    map[name] = rest.join('=');
    return map;
  }, {});
}

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  const cookies = parseCookieHeader(req.headers.cookie);
  let sessionId = cookies[SESSION_COOKIE];
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    const cookieValue = `${SESSION_COOKIE}=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
    res.setHeader('Set-Cookie', cookieValue);
  }
  req.sessionId = sessionId;
  next();
});

app.use('/api', executeRoutes);
app.use('/api', historyRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Serve the frontend
app.use(express.static(path.join(__dirname, 'public')));
// Express 5 (path-to-regexp v6+) requires a named wildcard, not bare '*'.
app.get('/*splat', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`CodeBuddy backend listening on port ${PORT}`);
});
