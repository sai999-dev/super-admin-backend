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
router.post('/analytics/event', (req, res) => {
  // TODO: Implement mobile analytics tracking
  res.status(200).json({
    success: true,
    message: 'Analytics event tracked successfully'
  });
});

/**
 * @route GET /api/mobile/analytics/performance
 * @desc Get mobile performance metrics
 * @access Private (Agency)
 */
router.get('/analytics/performance', (req, res) => {
  // TODO: Implement mobile performance metrics
  res.status(200).json({
    success: true,
    data: {
      performance: {
        leadsViewed: 0,
        leadsPurchased: 0,
        messagesSent: 0,
        conversionRate: 0
      }
    }
  });
});

module.exports = router;