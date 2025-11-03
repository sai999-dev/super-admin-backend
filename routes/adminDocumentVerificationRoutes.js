/**
 * Admin Document Verification Routes
 * Handles document verification management for admin portal
 */

const express = require('express');
const router = express.Router();
const { authenticateAdmin } = require('../middleware/adminAuth');
const documentVerificationController = require('../controllers/documentVerificationController');

// All routes require admin authentication
router.use(authenticateAdmin);

/**
 * GET /api/admin/verification-documents
 * List verification documents with filters
 */
router.get('/verification-documents', documentVerificationController.listDocuments);

/**
 * GET /api/admin/verification-documents/:id/download
 * Download document file
 */
router.get('/verification-documents/:id/download', documentVerificationController.downloadDocument);

/**
 * PUT /api/admin/verification-documents/:id/approve
 * Approve document (Super Admin only)
 */
router.put('/verification-documents/:id/approve', documentVerificationController.approveDocument);

/**
 * PUT /api/admin/verification-documents/:id/reject
 * Reject document (Super Admin only)
 */
router.put('/verification-documents/:id/reject', documentVerificationController.rejectDocument);

module.exports = router;

