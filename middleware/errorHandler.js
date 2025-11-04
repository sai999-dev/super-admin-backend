/**
 * Global Error Handling Middleware
 * Centralized error handling with proper logging
 */

const logger = require('../utils/logger');
const ResponseFormatter = require('../utils/responseFormatter');

class ErrorHandler {
  /**
   * Handle errors and send appropriate response
   * @param {Error} err - Error object
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   * @param {Function} next - Express next
   */
  static handle(err, req, res, next) {
    // Log error
    logger.error('API Error:', {
      message: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
      ip: req.ip,
      userAgent: req.get('user-agent')
    });

    // Default error response
    let statusCode = err.statusCode || err.status || 500;
    let message = err.message || 'Internal server error';
    let errors = null;

    // Handle specific error types
    if (err.name === 'ValidationError') {
      statusCode = 400;
      message = 'Validation error';
      errors = err.errors || [err.message];
    } else if (err.name === 'UnauthorizedError') {
      statusCode = 401;
      message = 'Unauthorized access';
    } else if (err.name === 'ForbiddenError') {
      statusCode = 403;
      message = 'Access forbidden';
    } else if (err.name === 'NotFoundError') {
      statusCode = 404;
      message = err.message || 'Resource not found';
    } else if (err.name === 'ConflictError') {
      statusCode = 409;
      message = err.message || 'Resource conflict';
    }

    // Format response
    const response = ResponseFormatter.error({
      message,
      errors,
      statusCode,
      code: err.code || 'INTERNAL_ERROR'
    });

    // Include stack trace in development
    if (process.env.NODE_ENV === 'development') {
      response.stack = err.stack;
      response.details = {
        path: req.path,
        method: req.method,
        timestamp: new Date().toISOString()
      };
    }

    res.status(statusCode).json(response);
  }

  /**
   * Handle async errors
   * Wraps async route handlers to catch errors
   * @param {Function} fn - Async function
   * @returns {Function} - Wrapped function
   */
  static asyncHandler(fn) {
    return (req, res, next) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  }

  /**
   * Create custom error
   * @param {string} message - Error message
   * @param {number} statusCode - HTTP status code
   * @param {string} code - Error code
   * @returns {Error} - Custom error
   */
  static createError(message, statusCode = 500, code = null) {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.status = statusCode;
    error.code = code;
    return error;
  }

  /**
   * Handle 404 errors
   */
  static notFound(req, res, next) {
    const error = ErrorHandler.createError(
      `Route ${req.method} ${req.originalUrl} not found`,
      404,
      'ROUTE_NOT_FOUND'
    );
    next(error);
  }
}

module.exports = ErrorHandler;

