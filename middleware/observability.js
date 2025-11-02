/**
 * Observability Middleware
 * Error tracking, performance monitoring, and detailed logging
 */

const featureFlags = require('../config/featureFlags');

// In-memory metrics (can be replaced with external service)
const metrics = {
  requests: 0,
  errors: 0,
  slowQueries: [],
  errorLogs: []
};

/**
 * Performance monitoring middleware
 */
const performanceMonitor = (req, res, next) => {
  if (!featureFlags.ENABLE_PERFORMANCE_MONITORING) {
    return next();
  }

  const startTime = Date.now();
  const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Attach request ID for tracing
  req.requestId = requestId;

  // Track response time
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    metrics.requests++;

    // Log slow requests (>1 second)
    if (duration > 1000) {
      metrics.slowQueries.push({
        method: req.method,
        path: req.path,
        duration,
        timestamp: new Date().toISOString(),
        requestId
      });

      if (featureFlags.ENABLE_DETAILED_LOGGING) {
        console.warn(`⚠️  Slow request: ${req.method} ${req.path} took ${duration}ms [${requestId}]`);
      }
    }

    // Log all requests in development
    if (featureFlags.ENABLE_DETAILED_LOGGING && process.env.NODE_ENV === 'development') {
      console.log(`${req.method} ${req.path} - ${res.statusCode} - ${duration}ms [${requestId}]`);
    }
  });

  next();
};

/**
 * Error tracking middleware
 */
const errorTracker = (err, req, res, next) => {
  if (!featureFlags.ENABLE_ERROR_TRACKING) {
    return next(err);
  }

  metrics.errors++;
  const errorEntry = {
    message: err.message,
    stack: err.stack,
    method: req.method,
    path: req.path,
    statusCode: err.statusCode || 500,
    timestamp: new Date().toISOString(),
    requestId: req.requestId,
    userAgent: req.get('user-agent'),
    ip: req.ip
  };

  metrics.errorLogs.push(errorEntry);

  // Keep only last 100 errors
  if (metrics.errorLogs.length > 100) {
    metrics.errorLogs.shift();
  }

  // Log error
  console.error('❌ Error:', {
    message: err.message,
    path: req.path,
    statusCode: errorEntry.statusCode,
    requestId: req.requestId
  });

  next(err);
};

/**
 * Get metrics endpoint data
 */
const getMetrics = () => ({
  requests: metrics.requests,
  errors: metrics.errors,
  errorRate: metrics.requests > 0 ? (metrics.errors / metrics.requests * 100).toFixed(2) + '%' : '0%',
  slowQueries: metrics.slowQueries.slice(-10), // Last 10 slow queries
  recentErrors: metrics.errorLogs.slice(-10), // Last 10 errors
  timestamp: new Date().toISOString()
});

/**
 * Get health check data (returns data object, doesn't send response)
 */
const getHealthData = () => {
  return {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    metrics: featureFlags.ENABLE_PERFORMANCE_MONITORING ? {
      requests: metrics.requests,
      errors: metrics.errors,
      errorRate: getMetrics().errorRate
    } : undefined
  };
};

module.exports = {
  performanceMonitor,
  errorTracker,
  getMetrics,
  getHealthData
};

