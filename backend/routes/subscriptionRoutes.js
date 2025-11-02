/**
 * Subscription Management Routes
 * Route definitions for subscription plans, subscriptions, and territories
 */

const express = require('express');
const { body, param, query, validationResult } = require('express-validator');

// Import controllers
const subscriptionPlansController = require('../controllers/subscriptionPlansController');
const subscriptionsController = require('../controllers/subscriptionsController');
const territoriesController = require('../controllers/territoriesController');
const billingPaymentsController = require('../controllers/billingPaymentsController');
const activeSubscriptionsController = require('../controllers/activeSubscriptionsController');

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

// ==================== SUBSCRIPTION PLANS ROUTES ====================

/**
 * GET /api/admin/subscription-plans
 * List all subscription plans with pricing tiers
 */
router.get('/subscription-plans',
  authenticateAdmin,
  authorizeAdmin,
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('sortBy').optional().isIn(['name', 'pricePerUnit', 'sort_order', 'created_at']),
    query('sortOrder').optional().isIn(['ASC', 'DESC']),
    query('isActive').optional().isBoolean(),
    query('unitType').optional().isIn(['zipcode', 'city', 'county', 'state'])
  ],
  validateRequest,
  subscriptionPlansController.getAllPlans
);

/**
 * GET /api/admin/subscription-plans/:planId
 * Get a single subscription plan by ID
 */
router.get('/subscription-plans/:planId',
  authenticateAdmin,
  authorizeAdmin,
  [
    param('planId').isUUID().withMessage('Plan ID must be a valid UUID')
  ],
  validateRequest,
  subscriptionPlansController.getPlanById
);

/**
 * POST /api/admin/subscription-plans
 * Create a new subscription plan
 */
router.post('/subscription-plans',
  authenticateAdmin,
  authorizeAdmin,
  [
    body('name').notEmpty().isLength({ min: 3, max: 100 }).withMessage('Name must be 3-100 characters'),
    body('description').optional().isString(),
    body('unitType').isIn(['zipcode', 'city', 'county', 'state']).withMessage('Invalid unit type'),
    body('pricePerUnit').isFloat({ min: 0 }).withMessage('Price per unit must be non-negative'),
    body('maxUnits').optional().isInt({ min: 1 }).withMessage('Max units must be at least 1'),
    body('minUnits').optional().isInt({ min: 1 }).withMessage('Min units must be at least 1'),
    body('billingCycle').optional().isIn(['monthly', 'quarterly', 'yearly']),
    body('trialDays').optional().isInt({ min: 0, max: 365 }),
    body('features').optional().isObject(),
    body('isActive').optional().isBoolean(),
    body('sortOrder').optional().isInt(),
    body('metadata').optional().isObject()
  ],
  validateRequest,
  subscriptionPlansController.createPlan
);

/**
 * PUT /api/admin/subscription-plans/:planId
 * Update an existing subscription plan
 */
router.put('/subscription-plans/:planId',
  authenticateAdmin,
  authorizeAdmin,
  [
    param('planId').isUUID().withMessage('Plan ID must be a valid UUID'),
    body('name').optional().isLength({ min: 3, max: 100 }),
    body('description').optional().isString(),
    body('pricePerUnit').optional().isFloat({ min: 0 }),
    body('maxUnits').optional().isInt({ min: 1 }),
    body('minUnits').optional().isInt({ min: 1 }),
    body('billingCycle').optional().isIn(['monthly', 'quarterly', 'yearly']),
    body('trialDays').optional().isInt({ min: 0, max: 365 }),
    body('features').optional().isObject(),
    body('isActive').optional().isBoolean(),
    body('sortOrder').optional().isInt(),
    body('metadata').optional().isObject()
  ],
  validateRequest,
  subscriptionPlansController.updatePlan
);

/**
 * DELETE /api/admin/subscription-plans/:planId
 * Soft delete a subscription plan
 */
router.delete('/subscription-plans/:planId',
  authenticateAdmin,
  authorizeAdmin,
  [
    param('planId').isUUID().withMessage('Plan ID must be a valid UUID')
  ],
  validateRequest,
  subscriptionPlansController.deletePlan
);

// ==================== SUBSCRIPTIONS ROUTES ====================

/**
 * GET /api/admin/subscriptions
 * List all agency subscriptions
 */
router.get('/subscriptions',
  authenticateAdmin,
  authorizeAdmin,
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('sortBy').optional().isIn(['created_at', 'updated_at', 'status', 'nextBillingDate']),
    query('sortOrder').optional().isIn(['ASC', 'DESC']),
    query('status').optional().isIn(['trial', 'active', 'suspended', 'cancelled', 'expired']),
    query('agencyId').optional().isUUID(),
    query('planId').optional().isUUID(),
    query('search').optional().isString()
  ],
  validateRequest,
  subscriptionsController.getAllSubscriptions
);

/**
 * GET /api/admin/subscriptions/:subscriptionId
 * Get a single subscription by ID
 */
router.get('/subscriptions/:subscriptionId',
  authenticateAdmin,
  authorizeAdmin,
  [
    param('subscriptionId').isUUID().withMessage('Subscription ID must be a valid UUID')
  ],
  validateRequest,
  subscriptionsController.getSubscriptionById
);

/**
 * POST /api/admin/subscriptions
 * Create a new subscription for an agency
 */
router.post('/subscriptions',
  authenticateAdmin,
  authorizeAdmin,
  [
    body('agencyId').isUUID().withMessage('Agency ID must be a valid UUID'),
    body('planId').isUUID().withMessage('Plan ID must be a valid UUID'),
    body('billingCycle').optional().isIn(['monthly', 'quarterly', 'yearly']),
    body('customPricePerUnit').optional().isFloat({ min: 0 }),
    body('maxUnits').optional().isInt({ min: 1 }),
    body('startDate').optional().isISO8601(),
    body('trialDays').optional().isInt({ min: 0, max: 365 }),
    body('autoRenew').optional().isBoolean(),
    body('notes').optional().isString()
  ],
  validateRequest,
  subscriptionsController.createSubscription
);

/**
 * PUT /api/admin/subscriptions/:subscriptionId
 * Update a subscription
 */
router.put('/subscriptions/:subscriptionId',
  authenticateAdmin,
  authorizeAdmin,
  [
    param('subscriptionId').isUUID().withMessage('Subscription ID must be a valid UUID'),
    body('planId').optional().isUUID(),
    body('status').optional().isIn(['trial', 'active', 'suspended', 'cancelled', 'expired']),
    body('customPricePerUnit').optional().isFloat({ min: 0 }),
    body('maxUnits').optional().isInt({ min: 1 }),
    body('billingCycle').optional().isIn(['monthly', 'quarterly', 'yearly']),
    body('autoRenew').optional().isBoolean(),
    body('notes').optional().isString()
  ],
  validateRequest,
  subscriptionsController.updateSubscription
);

/**
 * DELETE /api/admin/subscriptions/:subscriptionId
 * Cancel a subscription
 */
router.delete('/subscriptions/:subscriptionId',
  authenticateAdmin,
  authorizeAdmin,
  [
    param('subscriptionId').isUUID().withMessage('Subscription ID must be a valid UUID'),
    body('reason').optional().isString()
  ],
  validateRequest,
  subscriptionsController.cancelSubscription
);

// ==================== TERRITORIES ROUTES ====================

/**
 * GET /api/admin/territories
 * List all territories with conflict detection
 */
router.get('/territories',
  authenticateAdmin,
  authorizeAdmin,
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('sortBy').optional().isIn(['created_at', 'type', 'value', 'priority']),
    query('sortOrder').optional().isIn(['ASC', 'DESC']),
    query('agencyId').optional().isUUID(),
    query('subscriptionId').optional().isUUID(),
    query('type').optional().isIn(['zipcode', 'city', 'county', 'state']),
    query('state').optional().isString(),
    query('isActive').optional().isBoolean(),
    query('search').optional().isString()
  ],
  validateRequest,
  territoriesController.getAllTerritories
);

/**
 * GET /api/admin/territories/conflicts
 * Get territories with multiple agency ownership
 */
router.get('/territories/conflicts',
  authenticateAdmin,
  authorizeAdmin,
  territoriesController.getTerritoryConflicts
);

/**
 * POST /api/admin/subscriptions/:subscriptionId/territories
 * Add territories to a subscription
 */
router.post('/subscriptions/:subscriptionId/territories',
  authenticateAdmin,
  authorizeAdmin,
  [
    param('subscriptionId').isUUID().withMessage('Subscription ID must be a valid UUID'),
    body('territories').isArray({ min: 1 }).withMessage('Territories array is required'),
    body('territories.*.type').isIn(['zipcode', 'city', 'county', 'state']),
    body('territories.*.value').notEmpty().isString(),
    body('territories.*.state').optional().isString(),
    body('territories.*.county').optional().isString(),
    body('territories.*.city').optional().isString(),
    body('territories.*.zipcode').optional().isString(),
    body('territories.*.priority').optional().isInt({ min: 0, max: 10 }),
    body('territories.*.metadata').optional().isObject()
  ],
  validateRequest,
  territoriesController.addTerritories
);

/**
 * PUT /api/admin/territories/:territoryId
 * Update a territory
 */
router.put('/territories/:territoryId',
  authenticateAdmin,
  authorizeAdmin,
  [
    param('territoryId').isUUID().withMessage('Territory ID must be a valid UUID'),
    body('priority').optional().isInt({ min: 0, max: 10 }),
    body('isActive').optional().isBoolean(),
    body('metadata').optional().isObject()
  ],
  validateRequest,
  territoriesController.updateTerritory
);

/**
 * DELETE /api/admin/territories/:territoryId
 * Soft delete a territory
 */
router.delete('/territories/:territoryId',
  authenticateAdmin,
  authorizeAdmin,
  [
    param('territoryId').isUUID().withMessage('Territory ID must be a valid UUID')
  ],
  validateRequest,
  territoriesController.deleteTerritory
);

/**
 * POST /api/admin/territories/:territoryId/restore
 * Restore a soft-deleted territory
 */
router.post('/territories/:territoryId/restore',
  authenticateAdmin,
  authorizeAdmin,
  [
    param('territoryId').isUUID().withMessage('Territory ID must be a valid UUID')
  ],
  validateRequest,
  territoriesController.restoreTerritory
);

// ==================== BILLING & PAYMENTS ROUTES ====================

/**
 * GET /api/admin/billing-payments/summary
 * Get billing and payment summary for dashboard
 */
router.get('/billing-payments/summary',
  authenticateAdmin,
  authorizeAdmin,
  [
    query('dateRange').optional().isIn(['last7days', 'last30days', 'last90days', 'thisMonth', 'lastMonth', 'thisYear']),
    query('agencyId').optional().isUUID(),
    query('planId').optional().isUUID()
  ],
  validateRequest,
  billingPaymentsController.getSummary
);

/**
 * GET /api/admin/billing-payments/history
 * Get paginated billing history with filters
 */
router.get('/billing-payments/history',
  authenticateAdmin,
  authorizeAdmin,
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('sortBy').optional().isIn(['billing_date', 'amount', 'status', 'created_at']),
    query('sortOrder').optional().isIn(['ASC', 'DESC']),
    query('dateRange').optional().isIn(['last7days', 'last30days', 'last90days', 'thisMonth', 'lastMonth', 'thisYear', 'all']),
    query('status').optional().isIn(['PENDING', 'COMPLETED', 'FAILED', 'CANCELLED', 'REFUNDED']),
    query('agencyId').optional().isUUID(),
    query('planId').optional().isUUID(),
    query('paymentMethod').optional().isIn(['CREDIT_CARD', 'BANK_TRANSFER', 'DEBIT_CARD', 'PAYPAL', 'STRIPE', 'MANUAL']),
    query('search').optional().isString()
  ],
  validateRequest,
  billingPaymentsController.getBillingHistory
);

/**
 * GET /api/admin/billing-payments/:id
 * Get single billing record details
 */
router.get('/billing-payments/:id',
  authenticateAdmin,
  authorizeAdmin,
  [
    param('id').isUUID().withMessage('Billing ID must be a valid UUID')
  ],
  validateRequest,
  billingPaymentsController.getBillingDetails
);

/**
 * POST /api/admin/billing-payments/export
 * Export billing data in requested format
 */
router.post('/billing-payments/export',
  authenticateAdmin,
  authorizeAdmin,
  [
    body('dateRange').optional().isIn(['last7days', 'last30days', 'last90days', 'thisMonth', 'lastMonth', 'thisYear', 'all']),
    body('format').optional().isIn(['csv', 'json']),
    body('status').optional().isIn(['PENDING', 'COMPLETED', 'FAILED', 'CANCELLED', 'REFUNDED']),
    body('agencyId').optional().isUUID(),
    body('planId').optional().isUUID()
  ],
  validateRequest,
  billingPaymentsController.exportBillingData
);

/**
 * PUT /api/admin/billing-payments/:id/status
 * Update billing record status
 */
router.put('/billing-payments/:id/status',
  authenticateAdmin,
  authorizeAdmin,
  [
    param('id').isUUID().withMessage('Billing ID must be a valid UUID'),
    body('status').isIn(['PENDING', 'COMPLETED', 'FAILED', 'CANCELLED', 'REFUNDED']),
    body('notes').optional().isString(),
    body('processedBy').optional().isUUID()
  ],
  validateRequest,
  billingPaymentsController.updateBillingStatus
);

/**
 * POST /api/admin/billing-payments/retry-failed
 * Retry failed payments
 */
router.post('/billing-payments/retry-failed',
  authenticateAdmin,
  authorizeAdmin,
  [
    body('paymentIds').isArray({ min: 1 }).withMessage('Payment IDs array is required'),
    body('paymentIds.*').isUUID().withMessage('Each payment ID must be a valid UUID')
  ],
  validateRequest,
  billingPaymentsController.retryFailedPayments
);

// ==================== ACTIVE SUBSCRIPTIONS ROUTES ====================

/**
 * GET /api/admin/active-subscriptions/summary
 * Get active subscriptions summary for dashboard
 */
router.get('/active-subscriptions/summary',
  authenticateAdmin,
  authorizeAdmin,
  [
    query('dateRange').optional().isIn(['last7days', 'last30days', 'last90days', 'thisMonth', 'lastMonth', 'thisYear', 'all']),
    query('agencyId').optional().isUUID(),
    query('planId').optional().isUUID()
  ],
  validateRequest,
  activeSubscriptionsController.getSummary
);

/**
 * GET /api/admin/active-subscriptions
 * Get paginated active subscriptions with filters
 */
router.get('/active-subscriptions',
  authenticateAdmin,
  authorizeAdmin,
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('sortBy').optional().isIn(['start_date', 'end_date', 'monthly_cost', 'status', 'created_at']),
    query('sortOrder').optional().isIn(['ASC', 'DESC']),
    query('status').optional().isIn(['ACTIVE', 'EXPIRING', 'CANCELLED', 'EXPIRED', 'SUSPENDED', 'TRIAL']),
    query('agencyId').optional().isUUID(),
    query('planId').optional().isUUID(),
    query('dateRange').optional().isIn(['last7days', 'last30days', 'last90days', 'thisMonth', 'lastMonth', 'thisYear', 'all']),
    query('search').optional().isString()
  ],
  validateRequest,
  activeSubscriptionsController.getActiveSubscriptions
);

/**
 * GET /api/admin/active-subscriptions/:id
 * Get single active subscription details
 */
router.get('/active-subscriptions/:id',
  authenticateAdmin,
  authorizeAdmin,
  [
    param('id').isUUID().withMessage('Active subscription ID must be a valid UUID')
  ],
  validateRequest,
  activeSubscriptionsController.getActiveSubscriptionDetails
);

/**
 * POST /api/admin/active-subscriptions
 * Create new active subscription
 */
router.post('/active-subscriptions',
  authenticateAdmin,
  authorizeAdmin,
  [
    body('agencyId').isUUID().withMessage('Agency ID must be a valid UUID'),
    body('planId').isUUID().withMessage('Plan ID must be a valid UUID'),
    body('subscriptionId').isUUID().withMessage('Subscription ID must be a valid UUID'),
    body('startDate').isISO8601().withMessage('Start date must be a valid date'),
    body('endDate').isISO8601().withMessage('End date must be a valid date'),
    body('monthlyCost').isFloat({ min: 0 }).withMessage('Monthly cost must be non-negative'),
    body('billingCycle').optional().isIn(['MONTHLY', 'QUARTERLY', 'YEARLY']),
    body('autoRenew').optional().isBoolean(),
    body('notes').optional().isString(),
    body('territories').optional().isArray()
  ],
  validateRequest,
  activeSubscriptionsController.createActiveSubscription
);

/**
 * PUT /api/admin/active-subscriptions/:id
 * Update active subscription
 */
router.put('/active-subscriptions/:id',
  authenticateAdmin,
  authorizeAdmin,
  [
    param('id').isUUID().withMessage('Active subscription ID must be a valid UUID'),
    body('endDate').optional().isISO8601(),
    body('status').optional().isIn(['ACTIVE', 'EXPIRING', 'CANCELLED', 'EXPIRED', 'SUSPENDED', 'TRIAL']),
    body('monthlyCost').optional().isFloat({ min: 0 }),
    body('autoRenew').optional().isBoolean(),
    body('notes').optional().isString(),
    body('territories').optional().isArray()
  ],
  validateRequest,
  activeSubscriptionsController.updateActiveSubscription
);

/**
 * DELETE /api/admin/active-subscriptions/:id
 * Cancel active subscription
 */
router.delete('/active-subscriptions/:id',
  authenticateAdmin,
  authorizeAdmin,
  [
    param('id').isUUID().withMessage('Active subscription ID must be a valid UUID'),
    body('reason').optional().isString()
  ],
  validateRequest,
  activeSubscriptionsController.cancelActiveSubscription
);

/**
 * POST /api/admin/active-subscriptions/:id/renew
 * Renew active subscription
 */
router.post('/active-subscriptions/:id/renew',
  authenticateAdmin,
  authorizeAdmin,
  [
    param('id').isUUID().withMessage('Active subscription ID must be a valid UUID'),
    body('newEndDate').optional().isISO8601(),
    body('notes').optional().isString()
  ],
  validateRequest,
  activeSubscriptionsController.renewActiveSubscription
);

/**
 * POST /api/admin/active-subscriptions/export
 * Export active subscriptions data
 */
router.post('/active-subscriptions/export',
  authenticateAdmin,
  authorizeAdmin,
  [
    body('dateRange').optional().isIn(['last7days', 'last30days', 'last90days', 'thisMonth', 'lastMonth', 'thisYear', 'all']),
    body('format').optional().isIn(['csv', 'json']),
    body('status').optional().isIn(['ACTIVE', 'EXPIRING', 'CANCELLED', 'EXPIRED', 'SUSPENDED', 'TRIAL']),
    body('agencyId').optional().isUUID(),
    body('planId').optional().isUUID()
  ],
  validateRequest,
  activeSubscriptionsController.exportActiveSubscriptions
);

// Error handling middleware for this router
router.use((error, req, res, next) => {
  console.error('Error in subscriptionRoutes:', error);
  
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

module.exports = router;
