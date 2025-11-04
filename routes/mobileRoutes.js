/**
 * Mobile Routes
 * API routes for mobile app functionality
 */

const express = require('express');
const router = express.Router();
const ENABLE_MESSAGING = process.env.ENABLE_MESSAGING === 'true';

// Import controllers
const mobileSubscriptionController = require('../controllers/mobileSubscriptionController');
const mobileTerritoryController = require('../controllers/mobileTerritoryController');
const mobileLeadsController = require('../controllers/mobileLeadsController');
const mobileDeviceController = require('../controllers/mobileDeviceController');
const mobileNotificationController = require('../controllers/mobileNotificationController');
const mobileAnalyticsController = require('../controllers/mobileAnalyticsController');
let mobileMessagingController = null;
try {
  if (ENABLE_MESSAGING) {
    mobileMessagingController = require('../controllers/mobileMessagingController');
  }
} catch (e) {
  // Leave controller null; we'll stub routes below
}

// Import middleware
const { authenticateAgency } = require('../middleware/agencyAuth');

// -----------------------------------------------------
// PUBLIC (no auth) endpoints needed during onboarding
// Flutter needs to show plans before an account/token exists
// GET /api/mobile/subscription/plans (Public)
router.get('/subscription/plans', mobileSubscriptionController.getAvailablePlans);

// Apply agency authentication middleware to all remaining mobile routes
router.use(authenticateAgency);

// =====================================================
// MOBILE SUBSCRIPTION ROUTES
// =====================================================

/**
 * @route GET /api/mobile/subscription/status
 * @desc Get agency subscription status and territories
 * @access Private (Agency)
 */
router.get('/subscription/status', mobileSubscriptionController.getSubscriptionStatus);

// NOTE: Auth-protected duplicate removed; public route defined above

/**
 * @route GET /api/mobile/billing/history
 * @desc Get billing history for the agency
 * @access Private (Agency)
 */
router.get('/billing/history', mobileSubscriptionController.getBillingHistory);

/**
 * @route GET /api/mobile/billing/upcoming
 * @desc Get upcoming billing information
 * @access Private (Agency)
 */
router.get('/billing/upcoming', mobileSubscriptionController.getUpcomingBilling);

/**
 * @route POST /api/mobile/subscription/subscribe
 * @desc Subscribe to a plan
 * @access Private (Agency)
 */
router.post('/subscription/subscribe', mobileSubscriptionController.subscribe);

/**
 * @route PUT /api/mobile/subscription/upgrade
 * @desc Upgrade to higher tier plan
 * @access Private (Agency)
 */
router.put('/subscription/upgrade', mobileSubscriptionController.upgrade);

/**
 * @route PUT /api/mobile/subscription/downgrade
 * @desc Downgrade to lower tier plan
 * @access Private (Agency)
 */
router.put('/subscription/downgrade', mobileSubscriptionController.downgrade);

/**
 * @route POST /api/mobile/subscription/cancel
 * @desc Cancel subscription
 * @access Private (Agency)
 */
router.post('/subscription/cancel', mobileSubscriptionController.cancel);

/**
 * @route GET /api/mobile/subscription/invoices
 * @desc Get billing history/invoices
 * @access Private (Agency)
 */
router.get('/subscription/invoices', mobileSubscriptionController.getInvoices);

/**
 * @route PUT /api/mobile/payment-method
 * @desc Update payment method
 * @access Private (Agency)
 */
router.put('/payment-method', mobileSubscriptionController.updatePaymentMethod);

// =====================================================
// MOBILE TERRITORY ROUTES
// =====================================================

/**
 * @route GET /api/mobile/territories
 * @desc Get agency's current territories
 * @access Private (Agency)
 */
router.get('/territories', mobileTerritoryController.getAgencyTerritories);
// Flutter compatibility endpoints
router.post('/territories', mobileTerritoryController.addTerritory);
router.delete('/territories/:zipcode', mobileTerritoryController.removeTerritory);

/**
 * @route GET /api/mobile/territories/available
 * @desc Get territories available for claiming
 * @access Private (Agency)
 */
router.get('/territories/available', mobileTerritoryController.getAvailableTerritories);

/**
 * @route POST /api/mobile/territories/request
 * @desc Request territory addition (requires admin approval)
 * @access Private (Agency)
 */
router.post('/territories/request', mobileTerritoryController.requestTerritoryAddition);

/**
 * @route PUT /api/mobile/territories/:territoryId
 * @desc Update territory priority or status (if allowed)
 * @access Private (Agency)
 */
router.put('/territories/:territoryId', mobileTerritoryController.updateTerritory);

/**
 * @route DELETE /api/mobile/territories/:territoryId
 * @desc Request territory removal (requires admin approval)
 * @access Private (Agency)
 */
router.delete('/territories/:territoryId', mobileTerritoryController.requestTerritoryRemoval);

// =====================================================
// MOBILE MESSAGING ROUTES
// =====================================================

/**
 * @route GET /api/mobile/conversations
 * @desc Get agency's active conversations
 * @access Private (Agency)
 */
if (mobileMessagingController) {
  router.get('/conversations', mobileMessagingController.getConversations);
} else {
  router.get('/conversations', (req, res) => res.status(501).json({ success: false, message: 'Messaging disabled. Set ENABLE_MESSAGING=true to enable.' }));
}

/**
 * @route GET /api/mobile/conversations/:conversationId/messages
 * @desc Get messages for a specific conversation
 * @access Private (Agency)
 */
if (mobileMessagingController) {
  router.get('/conversations/:conversationId/messages', mobileMessagingController.getConversationMessages);
} else {
  router.get('/conversations/:conversationId/messages', (req, res) => res.status(501).json({ success: false, message: 'Messaging disabled.' }));
}

/**
 * @route POST /api/mobile/conversations/:conversationId/messages
 * @desc Send a message in a conversation
 * @access Private (Agency)
 */
if (mobileMessagingController) {
  router.post('/conversations/:conversationId/messages', mobileMessagingController.sendMessage);
} else {
  router.post('/conversations/:conversationId/messages', (req, res) => res.status(501).json({ success: false, message: 'Messaging disabled.' }));
}

/**
 * @route POST /api/mobile/conversations
 * @desc Start a new conversation with a lead
 * @access Private (Agency)
 */
if (mobileMessagingController) {
  router.post('/conversations', mobileMessagingController.startConversation);
} else {
  router.post('/conversations', (req, res) => res.status(501).json({ success: false, message: 'Messaging disabled.' }));
}

/**
 * @route PUT /api/mobile/conversations/:conversationId/status
 * @desc Update conversation status
 * @access Private (Agency)
 */
if (mobileMessagingController) {
  router.put('/conversations/:conversationId/status', mobileMessagingController.updateConversationStatus);
} else {
  router.put('/conversations/:conversationId/status', (req, res) => res.status(501).json({ success: false, message: 'Messaging disabled.' }));
}

// =====================================================
// MOBILE MESSAGE TEMPLATE ROUTES
// =====================================================

/**
 * @route GET /api/mobile/message-templates
 * @desc Get agency's message templates
 * @access Private (Agency)
 */
if (mobileMessagingController) {
  router.get('/message-templates', mobileMessagingController.getMessageTemplates);
} else {
  router.get('/message-templates', (req, res) => res.status(501).json({ success: false, message: 'Messaging disabled.' }));
}

/**
 * @route POST /api/mobile/message-templates
 * @desc Create a new message template
 * @access Private (Agency)
 */
if (mobileMessagingController) {
  router.post('/message-templates', mobileMessagingController.createMessageTemplate);
} else {
  router.post('/message-templates', (req, res) => res.status(501).json({ success: false, message: 'Messaging disabled.' }));
}

/**
 * @route PUT /api/mobile/message-templates/:templateId
 * @desc Update a message template
 * @access Private (Agency)
 */
if (mobileMessagingController) {
  router.put('/message-templates/:templateId', mobileMessagingController.updateMessageTemplate);
} else {
  router.put('/message-templates/:templateId', (req, res) => res.status(501).json({ success: false, message: 'Messaging disabled.' }));
}

/**
 * @route DELETE /api/mobile/message-templates/:templateId
 * @desc Delete a message template
 * @access Private (Agency)
 */
if (mobileMessagingController) {
  router.delete('/message-templates/:templateId', mobileMessagingController.deleteMessageTemplate);
} else {
  router.delete('/message-templates/:templateId', (req, res) => res.status(501).json({ success: false, message: 'Messaging disabled.' }));
}

// =====================================================
// MOBILE ANALYTICS ROUTES (Future Implementation)
// =====================================================

/**
 * @route POST /api/mobile/analytics/event
 * @desc Track mobile app events
 * @access Private (Agency)
 */
router.post('/analytics/event', mobileAnalyticsController.trackEvent);

/**
 * @route GET /api/mobile/analytics/performance
 * @desc Get mobile performance metrics
 * @access Private (Agency)
 */
router.get('/analytics/performance', mobileAnalyticsController.getPerformanceMetrics);

// =====================================================
// MOBILE LEAD MANAGEMENT ROUTES
// =====================================================

/**
 * @route GET /api/mobile/leads
 * @desc Get agency's assigned leads with filters
 * @access Private (Agency)
 */
router.get('/leads', mobileLeadsController.getLeads);

/**
 * @route GET /api/mobile/leads/:id
 * @desc Get detailed information for a specific lead
 * @access Private (Agency)
 */
router.get('/leads/:id', mobileLeadsController.getLeadById);

/**
 * @route PUT /api/mobile/leads/:id/accept
 * @desc Accept a lead assignment
 * @access Private (Agency)
 */
router.put('/leads/:id/accept', mobileLeadsController.acceptLead);

/**
 * @route PUT /api/mobile/leads/:id/reject
 * @desc Reject a lead assignment (triggers round-robin)
 * @access Private (Agency)
 */
router.put('/leads/:id/reject', mobileLeadsController.rejectLead);

/**
 * @route PUT /api/mobile/leads/:id/status
 * @desc Update lead status
 * @access Private (Agency)
 */
router.put('/leads/:id/status', mobileLeadsController.updateLeadStatus);

/**
 * @route PUT /api/mobile/leads/:id/view
 * @desc Mark lead as viewed (analytics)
 * @access Private (Agency)
 */
router.put('/leads/:id/view', mobileLeadsController.markLeadViewed);

/**
 * @route POST /api/mobile/leads/:id/call
 * @desc Track phone call made to lead
 * @access Private (Agency)
 */
router.post('/leads/:id/call', mobileLeadsController.trackCall);

/**
 * @route POST /api/mobile/leads/:id/notes
 * @desc Add notes/comments to a lead
 * @access Private (Agency)
 */
router.post('/leads/:id/notes', mobileLeadsController.addNotes);

// =====================================================
// MOBILE DEVICE MANAGEMENT ROUTES
// =====================================================

/**
 * @route POST /api/mobile/auth/register-device
 * @desc Register device for push notifications
 * @access Private (Agency)
 */
router.post('/auth/register-device', mobileDeviceController.registerDevice);

/**
 * @route PUT /api/mobile/auth/update-device
 * @desc Update device token
 * @access Private (Agency)
 */
router.put('/auth/update-device', mobileDeviceController.updateDevice);

/**
 * @route DELETE /api/mobile/auth/unregister-device
 * @desc Unregister device on logout
 * @access Private (Agency)
 */
router.delete('/auth/unregister-device', mobileDeviceController.unregisterDevice);

// =====================================================
// MOBILE NOTIFICATION SETTINGS ROUTES
// =====================================================

/**
 * @route GET /api/mobile/notifications/settings
 * @desc Get notification preferences
 * @access Private (Agency)
 */
router.get('/notifications/settings', mobileNotificationController.getSettings);

/**
 * @route PUT /api/mobile/notifications/settings
 * @desc Update notification preferences
 * @access Private (Agency)
 */
router.put('/notifications/settings', mobileNotificationController.updateSettings);

// =====================================================
// DOCUMENT VERIFICATION ROUTES (Mobile)
// =====================================================

const documentVerificationController = require('../controllers/documentVerificationController');
const multer = require('multer');

// Configure multer for file uploads (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

/**
 * @route POST /api/mobile/auth/upload-document
 * @desc Upload company verification document
 * @access Private (Agency)
 * Note: authenticateAgency is already applied globally above
 */
router.post('/auth/upload-document', upload.single('document'), documentVerificationController.uploadDocument);

/**
 * @route GET /api/mobile/auth/verification-status
 * @desc Get current verification status
 * @access Private (Agency)
 * Note: authenticateAgency is already applied globally above
 */
router.get('/auth/verification-status', documentVerificationController.getVerificationStatus);

/**
 * @route GET /api/mobile/auth/documents
 * @desc Get all uploaded documents for agency
 * @access Private (Agency)
 * Note: authenticateAgency is already applied globally above
 */
router.get('/auth/documents', documentVerificationController.getDocuments);

module.exports = router;