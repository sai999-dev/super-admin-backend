/**
 * Pagination Helper Utility
 * Provides standardized pagination logic for API endpoints
 */

/**
 * Calculate pagination parameters
 * @param {Object} query - Express query object
 * @param {Object} options - Additional options
 * @returns {Object} Pagination parameters
 */
const calculatePagination = (query, options = {}) => {
  const {
    defaultPage = 1,
    defaultLimit = 25,
    maxLimit = 100
  } = options;

  const page = Math.max(1, parseInt(query.page) || defaultPage);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit) || defaultLimit));
  const offset = (page - 1) * limit;

  return {
    page,
    limit,
    offset,
    hasNext: false, // Will be calculated after query
    hasPrev: page > 1,
    totalPages: 0, // Will be calculated after query
    totalItems: 0 // Will be calculated after query
  };
};

/**
 * Build pagination response
 * @param {Object} pagination - Pagination parameters
 * @param {number} totalItems - Total number of items
 * @returns {Object} Complete pagination object
 */
const buildPaginationResponse = (pagination, totalItems) => {
  const totalPages = Math.ceil(totalItems / pagination.limit);
  
  return {
    ...pagination,
    totalItems,
    totalPages,
    hasNext: pagination.page < totalPages,
    hasPrev: pagination.page > 1
  };
};

/**
 * Build Sequelize pagination options
 * @param {Object} pagination - Pagination parameters
 * @returns {Object} Sequelize options
 */
const buildSequelizeOptions = (pagination) => {
  return {
    limit: pagination.limit,
    offset: pagination.offset
  };
};

/**
 * Build sorting options for Sequelize
 * @param {Object} query - Express query object
 * @param {Array} allowedSortFields - Array of allowed sort fields
 * @param {string} defaultSort - Default sort field
 * @param {string} defaultOrder - Default order (ASC/DESC)
 * @returns {Array} Sequelize order array
 */
const buildSortOptions = (query, allowedSortFields = [], defaultSort = 'created_at', defaultOrder = 'DESC') => {
  const sortBy = query.sortBy || defaultSort;
  const sortOrder = (query.sortOrder || defaultOrder).toUpperCase();
  
  // Validate sort field
  if (allowedSortFields.length > 0 && !allowedSortFields.includes(sortBy)) {
    throw new Error(`Invalid sort field. Allowed fields: ${allowedSortFields.join(', ')}`);
  }
  
  // Validate sort order
  if (!['ASC', 'DESC'].includes(sortOrder)) {
    throw new Error('Invalid sort order. Must be ASC or DESC');
  }
  
  return [[sortBy, sortOrder]];
};

/**
 * Build filter options for Sequelize
 * @param {Object} query - Express query object
 * @param {Object} filterMappings - Mapping of query params to model fields
 * @returns {Object} Sequelize where clause
 */
const buildFilterOptions = (query, filterMappings = {}) => {
  const where = {};
  
  Object.keys(filterMappings).forEach(queryParam => {
    const modelField = filterMappings[queryParam];
    const value = query[queryParam];
    
    if (value !== undefined && value !== null && value !== '') {
      // Handle different filter types
      if (Array.isArray(value)) {
        where[modelField] = { [require('sequelize').Op.in]: value };
      } else if (typeof value === 'string' && value.includes(',')) {
        // Handle comma-separated values
        where[modelField] = { [require('sequelize').Op.in]: value.split(',').map(v => v.trim()) };
      } else if (queryParam.includes('_from') || queryParam.includes('_after')) {
        // Handle date range filters
        const baseField = queryParam.replace(/_from$|_after$/, '');
        if (!where[baseField]) where[baseField] = {};
        where[baseField][require('sequelize').Op.gte] = new Date(value);
      } else if (queryParam.includes('_to') || queryParam.includes('_before')) {
        // Handle date range filters
        const baseField = queryParam.replace(/_to$|_before$/, '');
        if (!where[baseField]) where[baseField] = {};
        where[baseField][require('sequelize').Op.lte] = new Date(value);
      } else if (queryParam.includes('_like') || queryParam.includes('_search')) {
        // Handle search filters
        where[modelField] = { [require('sequelize').Op.iLike]: `%${value}%` };
      } else {
        where[modelField] = value;
      }
    }
  });
  
  return where;
};

/**
 * Build search options for text search
 * @param {Object} query - Express query object
 * @param {Array} searchFields - Array of fields to search in
 * @param {string} searchParam - Query parameter name for search
 * @returns {Object} Sequelize search options
 */
const buildSearchOptions = (query, searchFields = [], searchParam = 'search') => {
  const searchTerm = query[searchParam];
  
  if (!searchTerm || searchFields.length === 0) {
    return {};
  }
  
  const { Op } = require('sequelize');
  
  return {
    [Op.or]: searchFields.map(field => ({
      [field]: { [Op.iLike]: `%${searchTerm}%` }
    }))
  };
};

/**
 * Validate pagination parameters
 * @param {Object} pagination - Pagination parameters
 * @param {Object} options - Validation options
 * @throws {Error} If validation fails
 */
const validatePagination = (pagination, options = {}) => {
  const { maxLimit = 100, maxPage = 10000 } = options;
  
  if (pagination.page < 1) {
    throw new Error('Page must be greater than 0');
  }
  
  if (pagination.page > maxPage) {
    throw new Error(`Page must be less than or equal to ${maxPage}`);
  }
  
  if (pagination.limit < 1) {
    throw new Error('Limit must be greater than 0');
  }
  
  if (pagination.limit > maxLimit) {
    throw new Error(`Limit must be less than or equal to ${maxLimit}`);
  }
};

module.exports = {
  calculatePagination,
  buildPaginationResponse,
  buildSequelizeOptions,
  buildSortOptions,
  buildFilterOptions,
  buildSearchOptions,
  validatePagination
};

