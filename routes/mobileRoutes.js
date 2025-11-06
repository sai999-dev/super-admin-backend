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

// =====================================================
// MOBILE AUTH ROUTES (Flutter API Contract)
// These routes match Flutter's expected /api/mobile/auth/* paths
// They use the same handlers as /api/v1/agencies/* for consistency
// =====================================================

// Import auth handlers directly
const bcrypt = require('bcryptjs');
const supabase = require('../config/supabaseClient');
const { generateAgencyToken } = require('../middleware/agencyAuth');
const emailService = require('../services/emailService');

// Helper to normalize agency row (copied from mobileAuthRoutes for consistency)
function normalizeAgencyRow(agencyRow) {
  if (!agencyRow) return null;
  return {
    id: agencyRow.id || agencyRow.agency_id,
    business_name: agencyRow.business_name || agencyRow.agency_name,
    email: agencyRow.email,
    phone_number: agencyRow.phone_number || agencyRow.contact_phone,
    status: agencyRow.status || (agencyRow.is_active === false ? 'inactive' : 'active'),
    verified: agencyRow.verified ?? (agencyRow.verification_status === 'VERIFIED'),
    password_hash: agencyRow.password_hash,
    raw: agencyRow
  };
}

/**
 * POST /api/mobile/auth/register
 * Register new agency
 * Matches Flutter API contract exactly
 */
router.post('/auth/register', async (req, res) => {
  try {
    const { email, password, agency_name, business_name, phone, contact_name, zipcodes, industry, plan_id, payment_method_id } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const hashedPassword = await bcrypt.hash(password, 10);

    // Check if agency exists
    const { data: existingAgency } = await supabase
      .from('agencies')
      .select('id')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (existingAgency) {
      return res.status(409).json({
        success: false,
        message: 'Agency with this email already exists'
      });
    }

    // Create agency
    const agencyData = {
      email: normalizedEmail,
      password_hash: hashedPassword,
      business_name: business_name || agency_name,
      agency_name: agency_name || business_name,
      phone_number: phone,
      contact_name: contact_name,
      industry_type: industry || 'healthcare',
      status: 'ACTIVE',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data: createdAgency, error: createError } = await supabase
      .from('agencies')
      .insert([agencyData])
      .select('*')
      .single();

    if (createError || !createdAgency) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create agency',
        error: createError?.message
      });
    }

    const normalizedAgency = normalizeAgencyRow(createdAgency);

    // Create subscription if plan_id provided
    let subscription = null;
    if (plan_id) {
      const now = new Date();
      const trialEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
      const nextBilling = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      const { data: subscriptionData } = await supabase
        .from('subscriptions')
        .insert([{
          agency_id: normalizedAgency.id,
          plan_id: plan_id,
          status: 'trial',
          start_date: now.toISOString(),
          trial_end_date: trialEnd.toISOString(),
          next_billing_date: nextBilling.toISOString(),
          auto_renew: true,
          metadata: { payment_method_id }
        }])
        .select()
        .single();

      subscription = subscriptionData;

      // Add territories
      if (Array.isArray(zipcodes) && zipcodes.length > 0 && subscription) {
        const territoryInserts = zipcodes.map(zipcode => ({
          subscription_id: subscription.id,
          agency_id: normalizedAgency.id,
          type: 'zipcode',
          value: zipcode,
          state: 'USA',
          is_active: true
        }));

        await supabase.from('territories').insert(territoryInserts);
      }
    }

    // Generate JWT token
    const token = generateAgencyToken({ 
      id: normalizedAgency.id, 
      email: normalizedAgency.email, 
      businessName: normalizedAgency.business_name 
    });

    res.status(201).json({
      success: true,
      token,
      agency_id: normalizedAgency.id,
      user_profile: {
        email: normalizedAgency.email,
        agency_name: normalizedAgency.business_name
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed',
      error: error.message
    });
  }
});

/**
 * POST /api/mobile/auth/login
 * Login
 * Matches Flutter API contract exactly
 */
router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Find agency
    const { data: agencyRow, error: agencyError } = await supabase
      .from('agencies')
      .select('*')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (agencyError || !agencyRow) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const normalizedAgency = normalizeAgencyRow(agencyRow);

    // Verify password
    let isValidPassword = false;
    if (normalizedAgency.password_hash) {
      isValidPassword = await bcrypt.compare(password, normalizedAgency.password_hash);
    } else {
      // Check users table
      const { data: userRow } = await supabase
        .from('users')
        .select('password_hash')
        .eq('email', normalizedEmail)
        .maybeSingle();
      
      if (userRow?.password_hash) {
        isValidPassword = await bcrypt.compare(password, userRow.password_hash);
      }
    }

    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Generate token
    const token = generateAgencyToken({ 
      id: normalizedAgency.id, 
      email: normalizedAgency.email, 
      businessName: normalizedAgency.business_name 
    });

    res.json({
      success: true,
      token,
      data: {
        agency_id: normalizedAgency.id,
        business_name: normalizedAgency.business_name,
        email: normalizedAgency.email
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message
    });
  }
});

/**
 * POST /api/mobile/auth/verify-email
 * Verify email with code
 * Matches Flutter API contract exactly
 */
router.post('/auth/verify-email', async (req, res) => {
  try {
    const { email, verification_code } = req.body;

    if (!email || !verification_code) {
      return res.status(400).json({
        success: false,
        message: 'Email and verification code are required'
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const { data: agencyRow } = await supabase
      .from('agencies')
      .select('*')
      .eq('email', normalizedEmail)
      .single();

    if (!agencyRow) {
      return res.status(404).json({
        success: false,
        message: 'Agency not found'
      });
    }

    // Check verification code
    if (agencyRow.verification_code !== verification_code) {
      return res.status(400).json({
        success: false,
        message: 'Invalid verification code'
      });
    }

    // Update as verified
    await supabase
      .from('agencies')
      .update({
        is_verified: true,
        verification_code: null,
        verification_expires_at: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', agencyRow.id);

    res.json({
      success: true,
      message: 'Email verified successfully'
    });
  } catch (error) {
    console.error('Verify email error:', error);
    res.status(500).json({
      success: false,
      message: 'Verification failed',
      error: error.message
    });
  }
});

/**
 * POST /api/mobile/auth/forgot-password
 * Request password reset
 * Matches Flutter API contract exactly
 */
router.post('/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const { data: agencyRow } = await supabase
      .from('agencies')
      .select('id, email')
      .eq('email', normalizedEmail)
      .maybeSingle();

    // Always return success (security best practice)
    if (!agencyRow) {
      return res.json({
        success: true,
        message: 'If an account with this email exists, password reset instructions have been sent.'
      });
    }

    // Generate reset token
    const crypto = require('crypto');
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 3600000);

    // Store token
    await supabase.from('password_reset_tokens').insert({
      agency_id: agencyRow.id,
      token: resetToken,
      expires_at: expiresAt.toISOString(),
      created_at: new Date().toISOString()
    });

    // Send email
    try {
      await emailService.sendPasswordResetEmail(normalizedEmail, resetToken);
    } catch (emailError) {
      console.warn('Failed to send password reset email:', emailError.message);
    }

    res.json({
      success: true,
      message: 'If an account with this email exists, password reset instructions have been sent.'
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process password reset request',
      error: error.message
    });
  }
});

// Apply agency authentication middleware to all remaining mobile routes
router.use(authenticateAgency);

// =====================================================
// MOBILE SUBSCRIPTION ROUTES
// =====================================================

/**
 * @route GET /api/mobile/subscription
 * @desc Get current subscription (Flutter API contract)
 * @access Private (Agency)
 */
router.get('/subscription', mobileSubscriptionController.getSubscription);

/**
 * @route GET /api/mobile/subscription/status
 * @desc Get agency subscription status and territories (legacy endpoint)
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
 * @route PUT /api/mobile/territories/:id
 * @desc Update territory (Flutter API contract - uses :id instead of :territoryId)
 * @access Private (Agency)
 */
router.put('/territories/:id', mobileTerritoryController.updateTerritory);

/**
 * @route DELETE /api/mobile/territories/:id
 * @desc Remove territory (Flutter API contract - uses :id)
 * @access Private (Agency)
 */
router.delete('/territories/:id', mobileTerritoryController.removeTerritory);

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