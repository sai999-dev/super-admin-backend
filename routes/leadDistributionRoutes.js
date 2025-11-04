/**
 * Lead Distribution Routes
 * API endpoints for lead distribution management
 */

const express = require('express');
const {
  distributeLeadManually,
  batchDistributeLeads,
  getDistributionStats,
  testDistributionEligibility,
  reassignLead
} = require('../controllers/leadDistributionController');
const { authenticateAdmin } = require('../middleware/adminAuth');

const router = express.Router();

// All routes require admin authentication
router.use(authenticateAdmin);

/**
 * @route   POST /api/admin/leads/distribution/:leadId
 * @desc    Manually trigger distribution for a specific lead
 * @access  Admin
 */
router.post('/distribution/:leadId', distributeLeadManually);

/**
 * @route   POST /api/admin/leads/distribution/batch
 * @desc    Batch distribute multiple unassigned leads
 * @access  Admin
 * @body    { limit: number } - Optional, default 50
 */
router.post('/distribution/batch', batchDistributeLeads);

/**
 * @route   GET /api/admin/leads/distribution/stats
 * @desc    Get distribution statistics
 * @access  Admin
 * @query   territory - Optional filter by territory
 */
router.get('/distribution/stats', getDistributionStats);

/**
 * @route   GET /api/admin/leads/distribution/:leadId/eligibility
 * @desc    Test which agencies are eligible for a lead
 * @access  Admin
 */
router.get('/distribution/:leadId/eligibility', testDistributionEligibility);

/**
 * @route   PUT /api/admin/leads/distribution/:leadId/reassign
 * @desc    Reassign lead to different agency
 * @access  Admin
 * @body    { agencyId: string }
 */
router.put('/distribution/:leadId/reassign', reassignLead);

module.exports = router;
