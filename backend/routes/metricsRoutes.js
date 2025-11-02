/**
 * Metrics and Observability Routes
 * Provides endpoints for monitoring and debugging
 */

const express = require('express');
const { getMetrics } = require('../middleware/observability');
const featureFlags = require('../config/featureFlags');
const router = express.Router();

/**
 * GET /api/metrics
 * Get application metrics (requests, errors, performance)
 */
router.get('/metrics', (req, res) => {
  if (!featureFlags.ENABLE_PERFORMANCE_MONITORING) {
    return res.status(403).json({
      success: false,
      message: 'Performance monitoring is disabled'
    });
  }

  const metrics = getMetrics();
  res.json({
    success: true,
    data: metrics,
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /api/metrics/health
 * Enhanced health check with metrics
 */
router.get('/metrics/health', (req, res) => {
  const metrics = featureFlags.ENABLE_PERFORMANCE_MONITORING ? getMetrics() : null;
  
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    metrics: metrics ? {
      requests: metrics.requests,
      errors: metrics.errors,
      errorRate: metrics.errorRate
    } : undefined
  });
});

module.exports = router;

