/**
 * Agency Management Routes
 * Route definitions for agency CRUD operations and management
 */

const express = require('express');
const { body, param, query, validationResult } = require('express-validator');

// Import controllers
const agencyController = require('../controllers/agencyController');

const router = express.Router();

// Validation middleware
const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

// Authentication middleware (placeholder - implement based on your auth system)
const authenticateAdmin = (req, res, next) => {
  // TODO: Implement proper authentication
  req.user = {
    id: 'admin-user-123',
    role: 'super_admin',
    email: 'admin@leadmarketplace.com'
  };
  next();
};

// Authorization middleware
const authorizeAdmin = (req, res, next) => {
  if (!req.user || !['super_admin', 'admin'].includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: 'Insufficient permissions. Admin access required.'
    });
  }
  next();
};

// ==================== AGENCY ROUTES ====================

/**
 * GET /api/admin/agencies/summary
 * Get agencies summary for dashboard
 */
router.get('/summary',
  authenticateAdmin,
  authorizeAdmin,
  [
    query('dateRange').optional().isIn(['last7days', 'last30days', 'last90days', 'thisMonth', 'lastMonth', 'thisYear', 'all']),
    query('status').optional().isIn(['ACTIVE', 'SUSPENDED', 'PENDING', 'DELETED']),
    query('search').optional().isString()
  ],
  validateRequest,
  agencyController.getSummary
);

/**
 * GET /api/admin/agencies
 * Get paginated agencies with filters
 */
router.get('/',
  authenticateAdmin,
  authorizeAdmin,
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('sortBy').optional().isIn(['business_name', 'email', 'created_at', 'updated_at', 'account_status']),
    query('sortOrder').optional().isIn(['ASC', 'DESC']),
    query('status').optional().isIn(['ACTIVE', 'SUSPENDED', 'PENDING', 'DELETED']),
    query('subscriptionStatus').optional().isIn(['ACTIVE', 'EXPIRING', 'CANCELLED', 'EXPIRED', 'SUSPENDED', 'TRIAL']),
    query('dateRange').optional().isIn(['last7days', 'last30days', 'last90days', 'thisMonth', 'lastMonth', 'thisYear', 'all']),
    query('search').optional().isString()
  ],
  validateRequest,
  agencyController.getAgencies
);

/**
 * GET /api/admin/agencies/:id
 * Get single agency details
 */
router.get('/:id',
  authenticateAdmin,
  authorizeAdmin,
  [
    param('id').isUUID().withMessage('Agency ID must be a valid UUID')
  ],
  validateRequest,
  agencyController.getAgencyDetails
);

/**
 * POST /api/admin/agencies
 * Create new agency
 */
router.post('/',
  authenticateAdmin,
  authorizeAdmin,
  [
    body('businessName').notEmpty().isLength({ min: 2, max: 150 }).withMessage('Business name must be 2-150 characters'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('phoneNumber').optional().isString().isLength({ max: 30 }),
    body('address').optional().isString().isLength({ max: 255 }),
    body('city').optional().isString().isLength({ max: 100 }),
    body('state').optional().isString().isLength({ max: 100 }),
    body('zipCode').optional().isString().isLength({ max: 20 }),
    body('country').optional().isString().isLength({ max: 100 }),
    body('website').optional().isURL().withMessage('Valid website URL is required'),
    body('description').optional().isString().isLength({ max: 1000 }),
    body('accountStatus').optional().isIn(['ACTIVE', 'SUSPENDED', 'PENDING']),
    body('subscriptionPlan').optional().isObject(),
    body('territories').optional().isArray()
  ],
  validateRequest,
  agencyController.createAgency
);

/**
 * PUT /api/admin/agencies/:id
 * Update agency
 */
router.put('/:id',
  authenticateAdmin,
  authorizeAdmin,
  [
    param('id').isUUID().withMessage('Agency ID must be a valid UUID'),
    body('businessName').optional().isLength({ min: 2, max: 150 }),
    body('email').optional().isEmail(),
    body('phoneNumber').optional().isString().isLength({ max: 30 }),
    body('address').optional().isString().isLength({ max: 255 }),
    body('city').optional().isString().isLength({ max: 100 }),
    body('state').optional().isString().isLength({ max: 100 }),
    body('zipCode').optional().isString().isLength({ max: 20 }),
    body('country').optional().isString().isLength({ max: 100 }),
    body('website').optional().isURL(),
    body('description').optional().isString().isLength({ max: 1000 }),
    body('accountStatus').optional().isIn(['ACTIVE', 'SUSPENDED', 'PENDING', 'DELETED']),
    body('territories').optional().isArray()
  ],
  validateRequest,
  agencyController.updateAgency
);

/**
 * DELETE /api/admin/agencies/:id
 * Delete agency (soft delete)
 */
router.delete('/:id',
  authenticateAdmin,
  authorizeAdmin,
  [
    param('id').isUUID().withMessage('Agency ID must be a valid UUID'),
    body('reason').optional().isString().isLength({ max: 500 })
  ],
  validateRequest,
  agencyController.deleteAgency
);

/**
 * PUT /api/admin/agencies/:id/status
 * Update agency status
 */
router.put('/:id/status',
  authenticateAdmin,
  authorizeAdmin,
  [
    param('id').isUUID().withMessage('Agency ID must be a valid UUID'),
    body('status').isIn(['ACTIVE', 'SUSPENDED', 'PENDING', 'DELETED']).withMessage('Invalid status'),
    body('reason').optional().isString().isLength({ max: 500 })
  ],
  validateRequest,
  agencyController.updateAgencyStatus
);

/**
 * POST /api/admin/agencies/:id/reset-password
 * Reset agency admin password
 */
router.post('/:id/reset-password',
  authenticateAdmin,
  authorizeAdmin,
  [
    param('id').isUUID().withMessage('Agency ID must be a valid UUID')
  ],
  validateRequest,
  agencyController.resetAgencyPassword
);

/**
 * POST /api/admin/agencies/export
 * Export agencies data
 */
router.post('/export',
  authenticateAdmin,
  authorizeAdmin,
  [
    body('dateRange').optional().isIn(['last7days', 'last30days', 'last90days', 'thisMonth', 'lastMonth', 'thisYear', 'all']),
    body('format').optional().isIn(['csv', 'json']),
    body('status').optional().isIn(['ACTIVE', 'SUSPENDED', 'PENDING', 'DELETED'])
  ],
  validateRequest,
  agencyController.exportAgencies
);

// Error handling middleware for this router
router.use((error, req, res, next) => {
  console.error('Error in agencyRoutes:', error);
  
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

module.exports = router;
