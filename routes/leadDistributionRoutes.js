/**
 * Lead Distribution Routes
 * API endpoints for lead distribution management
 */

import express from 'express';
import {
  distributeLeadManually,
  batchDistributeLeads,
  getDistributionStats,
  testDistributionEligibility,
  reassignLead
} from '../controllers/leadDistributionController.js';
import { authenticateAdmin } from '../middleware/adminAuth.js';

const router = express.Router();

// All routes require admin authentication
router.use(authenticateAdmin);

/**
 * @route   POST /api/admin/leads/:leadId/distribute
 * @desc    Manually trigger distribution for a specific lead
 * @access  Admin
 */
router.post('/:leadId/distribute', distributeLeadManually);

/**
 * @route   POST /api/admin/leads/batch-distribute
 * @desc    Batch distribute multiple unassigned leads
 * @access  Admin
 * @body    { limit: number } - Optional, default 50
 */
router.post('/batch-distribute', batchDistributeLeads);

/**
 * @route   GET /api/admin/leads/distribution/stats
 * @desc    Get distribution statistics
 * @access  Admin
 * @query   territory - Optional filter by territory
 */
router.get('/distribution/stats', getDistributionStats);

/**
 * @route   GET /api/admin/leads/:leadId/eligibility
 * @desc    Test which agencies are eligible for a lead
 * @access  Admin
 */
router.get('/:leadId/eligibility', testDistributionEligibility);

/**
 * @route   PUT /api/admin/leads/:leadId/reassign
 * @desc    Reassign lead to different agency
 * @access  Admin
 * @body    { agencyId: string }
 */
router.put('/:leadId/reassign', reassignLead);

export default router;
