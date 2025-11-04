/**
 * Admin Leads Routes
 * Route definitions and validation for leads management endpoints
 */

const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const adminLeadsController = require('../controllers/adminLeadsController');
const { authenticateAdmin } = require('../middleware/adminAuth');

const router = express.Router();

// Apply admin authentication to all routes
router.use(authenticateAdmin);

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

// Authorization middleware (additional check - authenticateAdmin already verified admin role)
const authorizeAdmin = (req, res, next) => {
  if (!req.user || !['super_admin', 'admin'].includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: 'Insufficient permissions. Admin access required.'
    });
  }
  next();
};

/**
 * GET /api/admin/leads
 * View all leads with filtering by status, portal, agency, date range
 * 
 * Query Parameters:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 25, max: 100)
 * - sortBy: Sort field (created_at, updated_at, lead_name, email, status, priority, industry)
 * - sortOrder: Sort order (ASC, DESC)
 * - search: Search term for lead name, email, phone, city, zipcode
 * - status: Filter by lead status
 * - portal_id: Filter by portal ID
 * - agency_id: Filter by assigned agency ID
 * - industry: Filter by industry
 * - priority: Filter by priority
 * - created_from: Filter leads created after this date
 * - created_to: Filter leads created before this date
 * - assigned_from: Filter leads assigned after this date
 * - assigned_to: Filter leads assigned before this date
 */
router.get('/leads', 
  authenticateAdmin,
  authorizeAdmin,
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('sortBy').optional().isIn(['created_at', 'updated_at', 'lead_name', 'email', 'status', 'priority', 'industry'])
      .withMessage('Invalid sort field'),
    query('sortOrder').optional().isIn(['ASC', 'DESC']).withMessage('Sort order must be ASC or DESC'),
    query('search').optional().isLength({ min: 1, max: 100 }).withMessage('Search term must be 1-100 characters'),
    query('status').optional().isIn(['new', 'distributed', 'assigned', 'contacted', 'converted', 'lost', 'archived'])
      .withMessage('Invalid status filter'),
    query('portal_id').optional().isUUID().withMessage('Portal ID must be a valid UUID'),
    query('agency_id').optional().isUUID().withMessage('Agency ID must be a valid UUID'),
    query('industry').optional().isLength({ min: 1, max: 100 }).withMessage('Industry must be 1-100 characters'),
    query('priority').optional().isIn(['low', 'medium', 'high', 'urgent']).withMessage('Invalid priority filter'),
    query('created_from').optional().isISO8601().withMessage('Created from must be a valid date'),
    query('created_to').optional().isISO8601().withMessage('Created to must be a valid date'),
    query('assigned_from').optional().isISO8601().withMessage('Assigned from must be a valid date'),
    query('assigned_to').optional().isISO8601().withMessage('Assigned to must be a valid date')
  ],
  validateRequest,
  adminLeadsController.getAllLeads
);

/**
 * GET /api/admin/leads/:leadId
 * View detailed lead information including raw payload and assignment history
 * 
 * Path Parameters:
 * - leadId: Lead UUID
 */
router.get('/leads/:leadId',
  authenticateAdmin,
  authorizeAdmin,
  [
    param('leadId').isUUID().withMessage('Lead ID must be a valid UUID')
  ],
  validateRequest,
  adminLeadsController.getLeadById
);

/**
 * PUT /api/admin/leads/:leadId/reassign
 * Manually reassign lead to different agency
 * 
 * Path Parameters:
 * - leadId: Lead UUID
 * 
 * Body Parameters:
 * - agency_id: Target agency UUID (required)
 * - reason: Reassignment reason (optional)
 * - priority: Assignment priority 0-10 (optional, default: 0)
 * - notes: Additional notes (optional)
 */
router.put('/leads/:leadId/reassign',
  authenticateAdmin,
  authorizeAdmin,
  [
    param('leadId').isUUID().withMessage('Lead ID must be a valid UUID'),
    body('agency_id').isUUID().withMessage('Agency ID must be a valid UUID'),
    body('reason').optional().isLength({ min: 1, max: 500 }).withMessage('Reason must be 1-500 characters'),
    body('priority').optional().isInt({ min: 0, max: 10 }).withMessage('Priority must be between 0 and 10'),
    body('notes').optional().isLength({ min: 1, max: 1000 }).withMessage('Notes must be 1-1000 characters')
  ],
  validateRequest,
  adminLeadsController.reassignLead
);

/**
 * GET /api/admin/leads/stats
 * Get lead statistics and conversion metrics by portal, territory, agency
 * 
 * Query Parameters:
 * - portal_id: Filter by portal ID
 * - agency_id: Filter by agency ID
 * - industry: Filter by industry
 * - date_from: Start date for statistics
 * - date_to: End date for statistics
 * - group_by: Group statistics by (overall, portal, agency, industry, date)
 */
router.get('/leads/stats',
  authenticateAdmin,
  authorizeAdmin,
  [
    query('portal_id').optional().isUUID().withMessage('Portal ID must be a valid UUID'),
    query('agency_id').optional().isUUID().withMessage('Agency ID must be a valid UUID'),
    query('industry').optional().isLength({ min: 1, max: 100 }).withMessage('Industry must be 1-100 characters'),
    query('date_from').optional().isISO8601().withMessage('Date from must be a valid date'),
    query('date_to').optional().isISO8601().withMessage('Date to must be a valid date'),
    query('group_by').optional().isIn(['overall', 'portal', 'agency', 'industry', 'date'])
      .withMessage('Invalid group_by parameter')
  ],
  validateRequest,
  adminLeadsController.getLeadStats
);

/**
 * POST /api/admin/leads/export
 * Export lead data to CSV with filtering options
 * 
 * Body Parameters:
 * - status: Filter by lead status (array)
 * - portal_id: Filter by portal ID
 * - agency_id: Filter by assigned agency ID
 * - industry: Filter by industry
 * - priority: Filter by priority
 * - created_from: Filter leads created after this date
 * - created_to: Filter leads created before this date
 * - search: Search term for lead name, email, phone, city, zipcode
 * - format: Export format (csv, excel) - default: csv
 * - include_assignments: Include assignment history (boolean) - default: true
 * - include_raw_data: Include raw payload data (boolean) - default: false
 */
router.post('/leads/export',
  authenticateAdmin,
  authorizeAdmin,
  [
    body('status').optional().isArray().withMessage('Status must be an array'),
    body('status.*').optional().isIn(['new', 'distributed', 'assigned', 'contacted', 'converted', 'lost', 'archived'])
      .withMessage('Invalid status value'),
    body('portal_id').optional().isUUID().withMessage('Portal ID must be a valid UUID'),
    body('agency_id').optional().isUUID().withMessage('Agency ID must be a valid UUID'),
    body('industry').optional().isLength({ min: 1, max: 100 }).withMessage('Industry must be 1-100 characters'),
    body('priority').optional().isIn(['low', 'medium', 'high', 'urgent']).withMessage('Invalid priority filter'),
    body('created_from').optional().isISO8601().withMessage('Created from must be a valid date'),
    body('created_to').optional().isISO8601().withMessage('Created to must be a valid date'),
    body('search').optional().isLength({ min: 1, max: 100 }).withMessage('Search term must be 1-100 characters'),
    body('format').optional().isIn(['csv', 'excel']).withMessage('Format must be csv or excel'),
    body('include_assignments').optional().isBoolean().withMessage('Include assignments must be boolean'),
    body('include_raw_data').optional().isBoolean().withMessage('Include raw data must be boolean')
  ],
  validateRequest,
  adminLeadsController.exportLeads
);

/**
 * POST /api/admin/leads/archive
 * Archive old leads to maintain system performance
 * 
 * Body Parameters:
 * - older_than_days: Archive leads older than this many days (default: 90)
 * - status_filter: Array of statuses to archive (default: ['converted', 'lost'])
 * - dry_run: If true, only show what would be archived without actually archiving (default: false)
 */
router.post('/leads/archive',
  authenticateAdmin,
  authorizeAdmin,
  [
    body('older_than_days').optional().isInt({ min: 1, max: 3650 }).withMessage('Older than days must be between 1 and 3650'),
    body('status_filter').optional().isArray().withMessage('Status filter must be an array'),
    body('status_filter.*').optional().isIn(['new', 'distributed', 'assigned', 'contacted', 'converted', 'lost', 'archived'])
      .withMessage('Invalid status filter value'),
    body('dry_run').optional().isBoolean().withMessage('Dry run must be boolean')
  ],
  validateRequest,
  adminLeadsController.archiveLeads
);

/**
 * GET /api/downloads/:filename
 * Serve exported files for download
 * 
 * Path Parameters:
 * - filename: Name of the file to download
 */
router.get('/downloads/:filename',
  [
    param('filename').matches(/^[a-zA-Z0-9._-]+$/).withMessage('Invalid filename format')
  ],
  validateRequest,
  adminLeadsController.downloadFile
);

// Error handling middleware for this router
router.use((error, req, res, next) => {
  console.error('Error in adminLeadsRoutes:', error);
  
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      message: 'Invalid JSON in request body'
    });
  }
  
  if (error.type === 'entity.too.large') {
    return res.status(413).json({
      success: false,
      message: 'Request entity too large'
    });
  }
  
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

/**
 * ====================================================================
 * LEAD DISTRIBUTION ROUTES
 * ====================================================================
 */

/**
 * POST /api/admin/leads/:leadId/distribute
 * Manually trigger distribution for a specific lead
 * 
 * Path Parameters:
 * - leadId: Lead UUID
 */
router.post('/leads/:leadId/distribute',
  authenticateAdmin,
  authorizeAdmin,
  [
    param('leadId').isUUID().withMessage('Lead ID must be a valid UUID')
  ],
  validateRequest,
  adminLeadsController.distributeLeadManually
);

/**
 * POST /api/admin/leads/batch-distribute
 * Batch distribute multiple unassigned leads
 * 
 * Body Parameters:
 * - limit: Maximum number of leads to distribute (default: 50, max: 100)
 */
router.post('/leads/batch-distribute',
  authenticateAdmin,
  authorizeAdmin,
  [
    body('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
  ],
  validateRequest,
  adminLeadsController.batchDistributeLeads
);

/**
 * GET /api/admin/leads/distribution/stats
 * Get distribution statistics
 * 
 * Query Parameters:
 * - territory: Optional filter by territory
 */
router.get('/leads/distribution/stats',
  authenticateAdmin,
  authorizeAdmin,
  [
    query('territory').optional().isLength({ min: 1, max: 100 }).withMessage('Territory must be 1-100 characters')
  ],
  validateRequest,
  adminLeadsController.getDistributionStats
);

/**
 * GET /api/admin/leads/:leadId/eligibility
 * Test which agencies are eligible for a lead
 * 
 * Path Parameters:
 * - leadId: Lead UUID
 */
router.get('/leads/:leadId/eligibility',
  authenticateAdmin,
  authorizeAdmin,
  [
    param('leadId').isUUID().withMessage('Lead ID must be a valid UUID')
  ],
  validateRequest,
  adminLeadsController.testDistributionEligibility
);

/**
 * PUT /api/admin/leads/:leadId/reassign
 * Reassign lead to a different agency
 * 
 * Path Parameters:
 * - leadId: Lead UUID
 * 
 * Body Parameters:
 * - agencyId: UUID of agency to reassign to
 */
router.put('/leads/:leadId/reassign',
  authenticateAdmin,
  authorizeAdmin,
  [
    param('leadId').isUUID().withMessage('Lead ID must be a valid UUID'),
    body('agencyId').isUUID().withMessage('Agency ID must be a valid UUID')
  ],
  validateRequest,
  adminLeadsController.reassignLead
);

module.exports = router;

