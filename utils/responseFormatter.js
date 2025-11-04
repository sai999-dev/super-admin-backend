/**
 * Standardized Response Formatter
 * Ensures all API responses follow consistent structure
 */

class ResponseFormatter {
  /**
   * Success response
   * @param {Object} options - Response options
   * @param {*} options.data - Response data
   * @param {string} options.message - Success message
   * @param {Object} options.meta - Additional metadata (pagination, etc.)
   * @returns {Object} - Formatted response
   */
  static success({ data = null, message = 'Success', meta = {} }) {
    return {
      success: true,
      message,
      data,
      ...(Object.keys(meta).length > 0 && { meta }),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Error response
   * @param {Object} options - Error options
   * @param {string} options.message - Error message
   * @param {string|Array} options.errors - Error details
   * @param {number} options.statusCode - HTTP status code
   * @param {string} options.code - Error code
   * @returns {Object} - Formatted error response
   */
  static error({ message = 'An error occurred', errors = null, statusCode = 500, code = null }) {
    const response = {
      success: false,
      message,
      ...(errors && { errors: Array.isArray(errors) ? errors : [errors] }),
      ...(code && { code }),
      timestamp: new Date().toISOString()
    };

    return response;
  }

  /**
   * Paginated response
   * @param {Object} options - Pagination options
   * @param {Array} options.data - Array of data items
   * @param {number} options.page - Current page
   * @param {number} options.limit - Items per page
   * @param {number} options.total - Total items
   * @param {string} options.message - Optional message
   * @returns {Object} - Formatted paginated response
   */
  static paginated({ data = [], page = 1, limit = 20, total = 0, message = null }) {
    const totalPages = Math.ceil(total / limit);
    
    return {
      success: true,
      ...(message && { message }),
      data,
      meta: {
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: parseInt(total),
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        }
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Validation error response
   * @param {Array} errors - Validation errors
   * @returns {Object} - Formatted validation error
   */
  static validationError(errors) {
    return this.error({
      message: 'Validation failed',
      errors,
      statusCode: 400,
      code: 'VALIDATION_ERROR'
    });
  }

  /**
   * Not found response
   * @param {string} resource - Resource name
   * @returns {Object} - Formatted not found response
   */
  static notFound(resource = 'Resource') {
    return this.error({
      message: `${resource} not found`,
      statusCode: 404,
      code: 'NOT_FOUND'
    });
  }

  /**
   * Unauthorized response
   * @param {string} message - Optional message
   * @returns {Object} - Formatted unauthorized response
   */
  static unauthorized(message = 'Unauthorized access') {
    return this.error({
      message,
      statusCode: 401,
      code: 'UNAUTHORIZED'
    });
  }

  /**
   * Forbidden response
   * @param {string} message - Optional message
   * @returns {Object} - Formatted forbidden response
   */
  static forbidden(message = 'Access forbidden') {
    return this.error({
      message,
      statusCode: 403,
      code: 'FORBIDDEN'
    });
  }
}

module.exports = ResponseFormatter;

