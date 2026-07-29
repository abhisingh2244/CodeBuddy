// src/routes/history.js
const express = require('express');
const { getRecentRuns, getStats } = require('../db');

const router = express.Router();

router.get('/history', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  res.json(getRecentRuns(limit));
});

router.get('/stats', (req, res) => {
  res.json(getStats());
});

module.exports = router;
