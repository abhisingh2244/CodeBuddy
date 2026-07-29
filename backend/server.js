// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const executeRoutes = require('./src/routes/execute');
const historyRoutes = require('./src/routes/history');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

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
