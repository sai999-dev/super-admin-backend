/**
 * Request Validation Middleware
 * Validates request body, params, and query
 */

const { validationResult } = require('express-validator');
const ResponseFormatter = require('../utils/responseFormatter');

/**
 * Validate request using express-validator results
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    return res.status(400).json(
      ResponseFormatter.validationError(errors.array())
    );
  }
  
  next();
};

/**
 * Validate UUID format
 */
const validateUUID = (value) => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
};

/**
 * Validate pagination params
 */
const validatePagination = (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;

  if (page < 1) {
    return res.status(400).json(
      ResponseFormatter.error({
        message: 'Page number must be greater than 0',
        statusCode: 400,
        code: 'INVALID_PAGINATION'
      })
    );
  }

  if (limit < 1 || limit > 100) {
    return res.status(400).json(
      ResponseFormatter.error({
        message: 'Limit must be between 1 and 100',
        statusCode: 400,
        code: 'INVALID_PAGINATION'
      })
    );
  }

  req.pagination = { page, limit };
  next();
};

module.exports = {
  validate,
  validateUUID,
  validatePagination
};

