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
  // Log immediately when route is hit
  console.log('\n========================================');
  console.log('🔵 REGISTRATION REQUEST RECEIVED');
  console.log('🔵 Time:', new Date().toISOString());
  console.log('🔵 Method:', req.method);
  console.log('🔵 URL:', req.url);
  console.log('🔵 Request body:', JSON.stringify(req.body, null, 2));
  console.log('========================================\n');
  
  try {
    const { email, password, agency_name, business_name, phone, contact_name, zipcodes, industry, plan_id, payment_method_id } = req.body;

    console.log('🔵 Parsed request data:', { email, agency_name, business_name, hasPassword: !!password });

    // Validation
    if (!email || !password) {
      console.log('❌ Validation failed: missing email or password');
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }
    
    console.log('✅ Validation passed');

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

    // Create agency - use ONLY columns that actually exist in the database
    const now = new Date();
    const today = now.toISOString().split('T')[0]; // Format: YYYY-MM-DD for created_date
    
    // Use columns that exist in the database (confirmed from schema)
    const agencyData = {
      agency_name: agency_name || business_name,  // ✅ EXISTS
      email: normalizedEmail,                     // ✅ EXISTS
      status: 'PENDING',                          // ✅ EXISTS - Start as PENDING
      industry: industry || 'general',            // ✅ EXISTS
      verification_status: 'NOT VERIFIED',        // ✅ EXISTS
      created_date: today,                        // ✅ EXISTS - Format: YYYY-MM-DD
      updated_at: now.toISOString()               // ✅ EXISTS
    };
    
    // Add business_name if provided (column EXISTS in database)
    if (business_name && business_name !== agency_name) {
      agencyData.business_name = business_name;  // ✅ Column exists!
    }
    // Note: contact_name column doesn't exist in database - skipping it
    // if (contact_name) {
    //   agencyData.contact_name = contact_name;  // Column doesn't exist - commented out
    // }
    // Phone column - try to add if it exists, but don't fail if it doesn't
    // Comment out phone for now since we're not sure which column exists
    // if (phone) {
    //   const cleanPhone = phone.trim();
    //   if (cleanPhone) {
    //     agencyData.phone_number = cleanPhone;
    //   }
    // }
    
    // Make absolutely sure contact_name is NOT in agencyData
    delete agencyData.contact_name;
    delete agencyData.phone; // Also remove phone if it was accidentally added
    
    console.log('Creating agency with columns:', Object.keys(agencyData).join(', '));
    console.log('Agency data (FINAL):', JSON.stringify(agencyData, null, 2));
    console.log('⚠️ Removed contact_name and phone from agencyData (columns don\'t exist)');

    console.log('Attempting to insert with data:', JSON.stringify(agencyData, null, 2));
    
    let createdAgency = null;
    try {
      const { data, error: createError } = await supabase
        .from('agencies')
        .insert([agencyData])
        .select('*')
        .single();

      if (createError) {
        console.error('❌ Supabase error creating agency:', JSON.stringify(createError, null, 2));
        console.error('❌ Error code:', createError.code);
        console.error('❌ Error message:', createError.message);
        console.error('❌ Error details:', createError.details);
        console.error('❌ Error hint:', createError.hint);
        
        const errorResponse = {
          success: false,
          message: 'Failed to create agency',
          error: createError.message || 'Unknown error creating agency'
        };
        
        if (createError.code) errorResponse.code = createError.code;
        if (createError.details) errorResponse.details = createError.details;
        if (createError.hint) errorResponse.hint = createError.hint;
        
        console.error('❌ Sending error response:', JSON.stringify(errorResponse, null, 2));
        return res.status(500).json(errorResponse);
      }
      
      if (!data) {
        console.error('❌ No agency data returned from insert');
        return res.status(500).json({
          success: false,
          message: 'Failed to create agency',
          error: 'No agency data returned from database'
        });
      }
      
      createdAgency = data;
    } catch (insertErr) {
      console.error('❌ Exception during insert:', insertErr);
      console.error('❌ Insert error stack:', insertErr.stack);
      return res.status(500).json({
        success: false,
        message: 'Failed to create agency',
        error: insertErr.message || 'Exception during database insert',
        errorType: insertErr.name || 'Error'
      });
    }
    
    if (!createdAgency) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create agency',
        error: 'Agency creation failed - no data returned'
      });
    }
    
    console.log('✅ Agency created successfully:', createdAgency.id);
    
    // Try to activate the account (PENDING -> ACTIVE)
    try {
      const activateResult = await supabase
        .from('agencies')
        .update({ 
          status: 'ACTIVE',
          updated_at: new Date().toISOString()
        })
        .eq('id', createdAgency.id)
        .select()
        .single();
      
      if (activateResult.data) {
        createdAgency = activateResult.data;
        console.log('✅ Agency activated successfully');
      }
    } catch (activateErr) {
      console.warn('Could not activate agency after creation (will remain PENDING):', activateErr.message);
      // Continue - agency was created successfully
    }
    
    // Ensure a fallback user account exists for password auth
    try {
      const { data: existingUser } = await supabase
        .from('users')
        .select('id, email')
        .eq('email', normalizedEmail)
        .maybeSingle();

      if (existingUser) {
        // Update password if user exists
        await supabase
          .from('users')
          .update({ password_hash: hashedPassword, updated_at: new Date().toISOString() })
          .eq('id', existingUser.id);
      } else {
        // Create user account
        await supabase
          .from('users')
          .insert([{ 
            name: contact_name || agency_name || business_name || normalizedEmail, 
            email: normalizedEmail, 
            password_hash: hashedPassword, 
            role: 'agency', 
            is_active: true 
          }]);
      }
    } catch (userErr) {
      console.warn('Could not create/update user account (non-critical):', userErr.message);
      // Continue - agency was created successfully
    }

    console.log('🔵 Normalizing agency data...');
    const normalizedAgency = normalizeAgencyRow(createdAgency);
    console.log('🔵 Normalized agency:', JSON.stringify(normalizedAgency, null, 2));

    // Create subscription if plan_id provided
    let subscription = null;
    if (plan_id) {
      console.log('🔵 Creating subscription with plan_id:', plan_id);
      try {
        const now = new Date();
        const trialEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
        const nextBilling = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        const { data: subscriptionData, error: subError } = await supabase
          .from('subscriptions')
          .insert([{
            agency_id: normalizedAgency.id,
            plan_id: plan_id,
            status: 'trial',
            start_date: now.toISOString(),
            trial_end_date: trialEnd.toISOString(),
            next_billing_date: nextBilling.toISOString(),
            auto_renew: true,
            metadata: payment_method_id ? { payment_method_id } : null
          }])
          .select()
          .single();

        if (subError) {
          console.error('❌ Error creating subscription:', subError);
          console.error('❌ Subscription error details:', JSON.stringify(subError, null, 2));
          // Don't fail registration if subscription fails - just log it
        } else {
          subscription = subscriptionData;
          console.log('✅ Subscription created:', subscription.id);
        }

        // Add territories (only if subscription was created)
        if (Array.isArray(zipcodes) && zipcodes.length > 0 && subscription) {
          console.log('🔵 Adding territories:', zipcodes);
          try {
            const territoryInserts = zipcodes.map(zipcode => ({
              subscription_id: subscription.id,
              agency_id: normalizedAgency.id,
              type: 'zipcode',
              value: zipcode,
              state: 'USA',
              is_active: true
            }));

            const { error: territoryError } = await supabase.from('territories').insert(territoryInserts);
            if (territoryError) {
              console.error('❌ Error adding territories:', territoryError);
              // Don't fail registration if territories fail
            } else {
              console.log('✅ Territories added successfully');
            }
          } catch (territoryErr) {
            console.error('❌ Exception adding territories:', territoryErr);
            // Don't fail registration
          }
        }
      } catch (subErr) {
        console.error('❌ Exception creating subscription:', subErr);
        // Don't fail registration if subscription creation fails
      }
    } else {
      console.log('⚠️ No plan_id provided - skipping subscription creation');
    }

    console.log('🔵 Generating JWT token...');
    // Generate JWT token
    let token;
    try {
      // Get business_name safely
      const businessName = normalizedAgency.business_name || normalizedAgency.agency_name || createdAgency.agency_name || createdAgency.business_name || 'Agency';
      
      console.log('🔵 Token payload:', { 
        id: normalizedAgency.id, 
        email: normalizedAgency.email, 
        businessName 
      });
      
      // generateAgencyToken expects: { id, email, businessName }
      token = generateAgencyToken({ 
        id: normalizedAgency.id, 
        email: normalizedAgency.email, 
        businessName: businessName
      });
      
      if (!token) {
        throw new Error('Token generation returned null/undefined');
      }
      console.log('✅ JWT token generated (length:', token ? token.length : 0, ')');
    } catch (tokenErr) {
      console.error('❌ Error generating token:', tokenErr);
      console.error('❌ Token error stack:', tokenErr.stack);
      return res.status(500).json({
        success: false,
        message: 'Registration successful but failed to generate token',
        error: tokenErr.message
      });
    }

    console.log('🔵 Preparing response...');
    
    // Get agency name safely
    const agencyName = normalizedAgency.business_name || normalizedAgency.agency_name || createdAgency.agency_name || createdAgency.business_name || 'Agency';
    
    const responseData = {
      success: true,
      token,
      agency_id: normalizedAgency.id,
      email: normalizedAgency.email,
      agency_name: agencyName,
      message: 'Registration successful',
      user_profile: {
        email: normalizedAgency.email,
        agency_name: agencyName
      }
    };
    
    console.log('✅ Registration complete! Sending response:', JSON.stringify(responseData, null, 2));
    
    // Return response matching Flutter's expected format
    res.status(201).json(responseData);
  } catch (error) {
    console.error('❌ Registration error:', error);
    console.error('❌ Error stack:', error.stack);
    console.error('❌ Error name:', error.name);
    console.error('❌ Error message:', error.message);
    
    // Make sure we always send a response
    try {
      res.status(500).json({
        success: false,
        message: 'Registration failed',
        error: error.message || 'Unknown error',
        errorType: error.name || 'Error',
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    } catch (responseErr) {
      console.error('❌ Failed to send error response:', responseErr);
      // If response already sent, just log
      if (!res.headersSent) {
        res.status(500).send('Registration failed: ' + (error.message || 'Unknown error'));
      }
    }
  }
});

/**
 * POST /api/mobile/auth/login
 * Login
 * Matches Flutter API contract exactly
 * PUBLIC ROUTE - No authentication required
 */
router.post('/auth/login', async (req, res) => {
  const startTime = Date.now();
  
  try {
    console.log('🔐 Login request received:', {
      email: req.body.email ? `${req.body.email.substring(0, 3)}***` : 'missing',
      hasPassword: !!req.body.password,
      timestamp: new Date().toISOString()
    });

    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      console.warn('❌ Login validation failed: missing email or password');
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Normalize email (trim and lowercase) - MUST match how registration stores it
    const normalizedEmail = email.trim().toLowerCase();
    // Trim password - MUST match how registration processes it
    const trimmedPassword = password.trim();

    console.log('🔍 Searching for agency with email:', normalizedEmail);

    // Find agency - use normalized email for case-insensitive lookup
    const { data: agencyRow, error: agencyError } = await supabase
      .from('agencies')
      .select('*')
      .eq('email', normalizedEmail)
      .maybeSingle();

    // Handle database errors separately from "not found"
    if (agencyError) {
      console.error('❌ Database error during login:', {
        error: agencyError.message,
        code: agencyError.code,
        details: agencyError
      });
      return res.status(500).json({
        success: false,
        message: 'Database error during login',
        error: process.env.NODE_ENV === 'development' ? agencyError.message : undefined
      });
    }

    // Check if agency exists
    if (!agencyRow) {
      console.warn('❌ Login failed: Agency not found for email:', normalizedEmail);
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
        debug: process.env.NODE_ENV === 'development' ? `No agency found with email: ${normalizedEmail}` : undefined
      });
    }

    console.log('✅ Agency found:', {
      id: agencyRow.id,
      email: agencyRow.email,
      business_name: agencyRow.business_name,
      hasPasswordHash: !!agencyRow.password_hash
    });

    const normalizedAgency = normalizeAgencyRow(agencyRow);

    // Verify password - check agencies table first, then users table
    let passwordHashToUse = normalizedAgency.password_hash;
    let passwordSource = 'agencies';

    if (!passwordHashToUse) {
      console.log('⚠️ No password_hash in agencies table, checking users table...');
      const { data: userRow, error: userError } = await supabase
        .from('users')
        .select('password_hash')
        .eq('email', normalizedEmail)
        .maybeSingle();
      
      if (userError) {
        console.error('❌ Error checking users table:', userError.message);
      } else if (userRow?.password_hash) {
        passwordHashToUse = userRow.password_hash;
        passwordSource = 'users';
        console.log('✅ Found password_hash in users table');
      } else {
        console.warn('⚠️ No password_hash found in either table');
      }
    }

    // Verify password using bcrypt.compare (same method as registration uses bcrypt.hash)
    let isValidPassword = false;
    if (passwordHashToUse) {
      console.log('🔐 Verifying password with bcrypt.compare...');
      console.log('   Password source:', passwordSource);
      // Use trimmed password - MUST match how registration processes it
      isValidPassword = await bcrypt.compare(trimmedPassword, passwordHashToUse);
      console.log(isValidPassword ? '✅ Password verified successfully' : '❌ Password verification failed');
    } else {
      console.warn('⚠️ No password hash available for comparison');
      // In development, allow login if no hash exists (legacy support)
      if (process.env.NODE_ENV !== 'production') {
        console.warn('⚠️ DEV BYPASS: Allowing login without password hash in non-production');
        isValidPassword = true;
      }
    }

    if (!isValidPassword) {
      console.warn('❌ Login failed: Invalid password', {
        email: normalizedEmail,
        hasPasswordHash: !!passwordHashToUse,
        passwordSource: passwordSource
      });
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
        debug: process.env.NODE_ENV === 'development' ? 'Password verification failed' : undefined
      });
    }

    // Generate JWT token
    console.log('🔑 Generating JWT token...');
    const token = generateAgencyToken({ 
      id: normalizedAgency.id, 
      email: normalizedAgency.email, 
      businessName: normalizedAgency.business_name 
    });

    const responseTime = Date.now() - startTime;
    console.log('✅ Login successful:', {
      agency_id: normalizedAgency.id,
      email: normalizedAgency.email,
      responseTime: `${responseTime}ms`
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
    const responseTime = Date.now() - startTime;
    console.error('❌ Login error (catch block):', {
      error: error.message,
      stack: error.stack,
      responseTime: `${responseTime}ms`
    });
    
    // Check for timeout errors
    if (error.message?.includes('timeout') || error.message?.includes('ETIMEDOUT')) {
      return res.status(504).json({
        success: false,
        message: 'Login request timed out. Please try again.',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }

    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
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

// =====================================================
// PASSWORD RESET WITH 6-DIGIT CODE FLOW
// =====================================================

/**
 * Helper: Generate cryptographically secure 6-digit code
 */
function generateResetCode() {
  const crypto = require('crypto');
  // Generate random number between 0 and 999999
  const randomBytes = crypto.randomBytes(4);
  const randomNumber = randomBytes.readUInt32BE(0);
  // Ensure it's 6 digits (000000-999999)
  const code = (randomNumber % 1000000).toString().padStart(6, '0');
  return code;
}

/**
 * Helper: Check rate limiting for password reset requests
 */
async function checkRateLimit(email, type = 'forgot_password') {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  
  // Count requests in last hour (type column may not exist, so query without it)
  let query = supabase
    .from('password_reset_codes')
    .select('*', { count: 'exact', head: true })
    .eq('email', email)
    .gte('created_at', oneHourAgo);
  
  // Only filter by type if column exists (check by trying to add the filter)
  const { count, error } = await query;
  
  if (error) {
    // If error is about missing column, try without type filter
    if (error.message?.includes('type') || error.message?.includes('column')) {
      console.warn('Type column not found, checking rate limit without type filter');
      const { count: countWithoutType, error: error2 } = await supabase
        .from('password_reset_codes')
        .select('*', { count: 'exact', head: true })
        .eq('email', email)
        .gte('created_at', oneHourAgo);
      
      if (error2) {
        console.warn('Rate limit check error:', error2.message);
        return { allowed: true }; // Allow on error to not block users
      }
      
      const maxAttempts = type === 'forgot_password' ? 3 : 5;
      return {
        allowed: (countWithoutType || 0) < maxAttempts,
        attempts: countWithoutType || 0,
        maxAttempts
      };
    }
    
    console.warn('Rate limit check error:', error.message);
    return { allowed: true }; // Allow on error to not block users
  }
  
  const maxAttempts = type === 'forgot_password' ? 3 : 5;
  return {
    allowed: (count || 0) < maxAttempts,
    attempts: count || 0,
    maxAttempts
  };
}

/**
 * POST /api/mobile/auth/forgot-password
 * Request password reset - sends 6-digit code to email
 * PUBLIC ROUTE - No authentication required
 * 
 * Request Body: { "email": "user@example.com" }
 * Response (200): { "success": true, "message": "Verification code sent to your email" }
 * Response (404): { "success": false, "message": "No account found with this email address" }
 * Response (429): { "success": false, "message": "Too many attempts. Please try again later" }
 */
router.post('/auth/forgot-password', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { email } = req.body;

    // Validation
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    // Normalize email (trim and lowercase) - MUST match registration/login
    const normalizedEmail = email.trim().toLowerCase();

    console.log('🔐 Forgot password request:', {
      email: `${normalizedEmail.substring(0, 3)}***`,
      timestamp: new Date().toISOString()
    });

    // Check rate limiting (max 3 requests per hour per email)
    const rateLimit = await checkRateLimit(normalizedEmail, 'forgot_password');
    if (!rateLimit.allowed) {
      console.warn('❌ Rate limit exceeded for:', normalizedEmail);
      return res.status(429).json({
        success: false,
        message: 'Too many attempts. Please try again later'
      });
    }

    // Check if email exists in agencies table
    const { data: agencyRow, error: agencyError } = await supabase
      .from('agencies')
      .select('id, email, business_name')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (agencyError) {
      console.error('❌ Database error:', agencyError.message);
      return res.status(500).json({
        success: false,
        message: 'Database error during password reset request',
        error: process.env.NODE_ENV === 'development' ? agencyError.message : undefined
      });
    }

    // Return 404 if email not found (security: don't reveal if email exists)
    if (!agencyRow) {
      console.warn('❌ Password reset: Email not found:', normalizedEmail);
      return res.status(404).json({
        success: false,
        message: 'No account found with this email address'
      });
    }

    console.log('✅ Agency found:', {
      id: agencyRow.id,
      email: agencyRow.email
    });

    // Generate 6-digit code
    const resetCode = generateResetCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Invalidate any existing unused codes for this email
    await supabase
      .from('password_reset_codes')
      .update({ used: true })
      .eq('email', normalizedEmail)
      .eq('used', false);

    // Store code in database (type column may not exist, so make it optional)
    const codeData = {
      email: normalizedEmail,
      code: resetCode,
      expires_at: expiresAt.toISOString(),
      used: false,
      created_at: new Date().toISOString()
    };
    
    // Only include type if column exists (will be handled by Supabase if column doesn't exist)
    // Try with type first, fallback without it if error
    let insertError;
    const { error: insertErrorWithType } = await supabase
      .from('password_reset_codes')
      .insert([{ ...codeData, type: 'forgot_password' }]);
    
    if (insertErrorWithType && (insertErrorWithType.message?.includes('type') || insertErrorWithType.message?.includes('column'))) {
      // Type column doesn't exist, insert without it
      console.log('Type column not found, inserting without type field');
      const { error: insertErrorWithoutType } = await supabase
        .from('password_reset_codes')
        .insert([codeData]);
      insertError = insertErrorWithoutType;
    } else {
      insertError = insertErrorWithType;
    }

    if (insertError) {
      console.error('❌ Error storing reset code:', insertError.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to generate reset code',
        error: process.env.NODE_ENV === 'development' ? insertError.message : undefined
      });
    }

    console.log('✅ Reset code generated:', {
      email: normalizedEmail,
      code: resetCode,
      expiresAt: expiresAt.toISOString()
    });

    // Send email with 6-digit code using Nodemailer directly (same as superadmin forgot password)
    try {
      const nodemailer = require('nodemailer');
      const emailUser = process.env.ADMIN_EMAIL_USER?.trim() || process.env.SMTP_USER?.trim();
      const emailPass = (process.env.ADMIN_EMAIL_PASS?.trim() || process.env.SMTP_PASS?.trim() || '').replace(/\s+/g, ''); // Remove all spaces
      
      if (!emailUser || !emailPass) {
        console.error('❌ Email credentials missing!');
        console.error('   ADMIN_EMAIL_USER:', emailUser ? '✅' : '❌');
        console.error('   ADMIN_EMAIL_PASS:', emailPass ? '✅' : '❌');
        // Don't fail - code is stored, user can check email or request again
        console.warn('⚠️ Email not sent - credentials not configured. Code is stored in database.');
      } else {
        console.log('📧 Configuring email transporter...');
        console.log('   Email user:', emailUser);
        console.log('   Password length:', emailPass.length, 'characters');
        
        // Create transporter with Gmail SMTP
        const transporter = nodemailer.createTransport({
          host: 'smtp.gmail.com',
          port: 587,
          secure: false, // use TLS
          auth: {
            user: emailUser,
            pass: emailPass
          },
          tls: {
            rejectUnauthorized: false // avoid local SSL issues
          }
        });

        // Verify transporter connection
        console.log('🔍 Verifying email transporter connection...');
        try {
          await transporter.verify();
          console.log('✅ Email transporter verified successfully!');
        } catch (verifyError) {
          console.error('❌ Email transporter verification failed:', verifyError.message);
          console.error('   Error code:', verifyError.code);
          throw verifyError; // Re-throw to be caught by outer catch
        }

        const emailSubject = 'Password Reset Verification Code';
        const emailHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <title>Password Reset Code</title>
          </head>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
              <h2 style="color: #4CAF50;">Password Reset Verification Code</h2>
              <p>You requested to reset your password for your Lead Marketplace account.</p>
              <p style="font-size: 24px; font-weight: bold; color: #2196F3; text-align: center; padding: 20px; background: #f5f5f5; border-radius: 5px; margin: 20px 0;">
                ${resetCode}
              </p>
              <p>Enter this code in the app to reset your password.</p>
              <p style="color: #666; font-size: 14px;">This code will expire in 15 minutes.</p>
              <p style="color: #999; font-size: 12px; margin-top: 30px;">If you didn't request this code, please ignore this email.</p>
            </div>
          </body>
          </html>
        `;
        const emailText = `Your password reset code is: ${resetCode}. This code will expire in 15 minutes. If you didn't request this code, please ignore this email.`;

        const mailOptions = {
          from: `"LeadMarketplace Admin" <${emailUser}>`,
          to: normalizedEmail,
          subject: emailSubject,
          html: emailHtml,
          text: emailText
        };

        const emailResult = await transporter.sendMail(mailOptions);
        console.log('✅ Password reset email sent successfully!');
        console.log('   Message ID:', emailResult.messageId);
        console.log('   To:', normalizedEmail);
      }
    } catch (emailError) {
      console.error('❌ Failed to send password reset email:', emailError.message);
      console.error('   Error code:', emailError.code);
      console.error('   Error command:', emailError.command);
      // Don't fail the request if email fails - code is still stored
      // User can request again if email doesn't arrive
      console.warn('⚠️ Code is stored in database. User can request again if email doesn\'t arrive.');
    }

    const responseTime = Date.now() - startTime;
    console.log('✅ Forgot password request successful:', {
      email: normalizedEmail,
      responseTime: `${responseTime}ms`
    });

    res.status(200).json({
      success: true,
      message: 'Verification code sent to your email'
    });
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error('❌ Forgot password error:', {
      error: error.message,
      stack: error.stack,
      responseTime: `${responseTime}ms`
    });

    res.status(500).json({
      success: false,
      message: 'Failed to process password reset request',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * POST /api/mobile/auth/verify-reset-code
 * Verify the 6-digit reset code
 * PUBLIC ROUTE - No authentication required
 * 
 * Request Body: { "email": "user@example.com", "code": "123456" }
 * Response (200): { "success": true, "message": "Code verified successfully" }
 * Response (400): { "success": false, "message": "Invalid or expired verification code" }
 */
router.post('/auth/verify-reset-code', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { email, code } = req.body;

    // Validation
    if (!email || !code) {
      return res.status(400).json({
        success: false,
        message: 'Email and verification code are required'
      });
    }

    // Validate code format (must be 6 digits)
    if (!/^\d{6}$/.test(code)) {
      return res.status(400).json({
        success: false,
        message: 'Verification code must be 6 digits'
      });
    }

    // Normalize email
    const normalizedEmail = email.trim().toLowerCase();
    const trimmedCode = code.trim();

    console.log('🔐 Verify reset code request:', {
      email: `${normalizedEmail.substring(0, 3)}***`,
      code: '******',
      timestamp: new Date().toISOString()
    });

    // Check rate limiting (max 5 verification attempts per code)
    const rateLimit = await checkRateLimit(normalizedEmail, 'verify_code');
    if (!rateLimit.allowed) {
      console.warn('❌ Rate limit exceeded for code verification:', normalizedEmail);
      return res.status(429).json({
        success: false,
        message: 'Too many attempts. Please try again later'
      });
    }

    // Find code record
    const { data: codeRecord, error: codeError } = await supabase
      .from('password_reset_codes')
      .select('*')
      .eq('email', normalizedEmail)
      .eq('code', trimmedCode)
      .eq('used', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (codeError) {
      console.error('❌ Database error:', codeError.message);
      return res.status(500).json({
        success: false,
        message: 'Database error during code verification',
        error: process.env.NODE_ENV === 'development' ? codeError.message : undefined
      });
    }

    // Check if code exists
    if (!codeRecord) {
      console.warn('❌ Invalid code for:', normalizedEmail);
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired verification code'
      });
    }

    // Check if code is expired
    const now = new Date();
    const expiresAt = new Date(codeRecord.expires_at);
    if (now > expiresAt) {
      console.warn('❌ Expired code for:', normalizedEmail);
      // Mark as used
      await supabase
        .from('password_reset_codes')
        .update({ used: true })
        .eq('id', codeRecord.id);
      
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired verification code'
      });
    }

    // Check if code is already used
    if (codeRecord.used) {
      console.warn('❌ Code already used for:', normalizedEmail);
      return res.status(400).json({
        success: false,
        message: 'Code has already been used'
      });
    }

    console.log('✅ Code verified successfully:', {
      email: normalizedEmail,
      codeId: codeRecord.id
    });

    const responseTime = Date.now() - startTime;
    res.status(200).json({
      success: true,
      message: 'Code verified successfully'
    });
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error('❌ Verify reset code error:', {
      error: error.message,
      stack: error.stack,
      responseTime: `${responseTime}ms`
    });

    res.status(500).json({
      success: false,
      message: 'Failed to verify code',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * POST /api/mobile/auth/reset-password
 * Reset password with verified code
 * PUBLIC ROUTE - No authentication required
 * 
 * Request Body: { "email": "user@example.com", "code": "123456", "new_password": "newpassword123" }
 * Response (200): { "success": true, "message": "Password reset successfully" }
 * Response (400): { "success": false, "message": "Invalid code or password requirements not met" }
 */
router.post('/auth/reset-password', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { email, code, new_password } = req.body;

    // Validation
    if (!email || !code || !new_password) {
      return res.status(400).json({
        success: false,
        message: 'Email, verification code, and new password are required'
      });
    }

    // Validate code format
    if (!/^\d{6}$/.test(code)) {
      return res.status(400).json({
        success: false,
        message: 'Verification code must be 6 digits'
      });
    }

    // Validate password strength (minimum 6 characters)
    if (new_password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters'
      });
    }

    // Normalize email
    const normalizedEmail = email.trim().toLowerCase();
    const trimmedCode = code.trim();
    const trimmedPassword = new_password.trim();

    console.log('🔐 Reset password request:', {
      email: `${normalizedEmail.substring(0, 3)}***`,
      code: '******',
      timestamp: new Date().toISOString()
    });

    // Verify code again (same checks as verify-reset-code)
    const { data: codeRecord, error: codeError } = await supabase
      .from('password_reset_codes')
      .select('*')
      .eq('email', normalizedEmail)
      .eq('code', trimmedCode)
      .eq('used', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (codeError) {
      console.error('❌ Database error:', codeError.message);
      return res.status(500).json({
        success: false,
        message: 'Database error during password reset',
        error: process.env.NODE_ENV === 'development' ? codeError.message : undefined
      });
    }

    if (!codeRecord) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired verification code'
      });
    }

    // Check if code is expired
    const now = new Date();
    const expiresAt = new Date(codeRecord.expires_at);
    if (now > expiresAt) {
      await supabase
        .from('password_reset_codes')
        .update({ used: true })
        .eq('id', codeRecord.id);
      
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired verification code'
      });
    }

    // Check if code is already used
    if (codeRecord.used) {
      return res.status(400).json({
        success: false,
        message: 'Code has already been used'
      });
    }

    // Find agency
    const { data: agencyRow, error: agencyError } = await supabase
      .from('agencies')
      .select('id, email')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (agencyError) {
      console.error('❌ Database error finding agency:', agencyError.message);
      return res.status(500).json({
        success: false,
        message: 'Database error during password reset',
        error: process.env.NODE_ENV === 'development' ? agencyError.message : undefined
      });
    }

    if (!agencyRow) {
      return res.status(404).json({
        success: false,
        message: 'No account found with this email address'
      });
    }

    // Hash new password (same method as registration - bcrypt with 10 salt rounds)
    console.log('🔐 Hashing new password...');
    const hashedPassword = await bcrypt.hash(trimmedPassword, 10);

    // Update password in agencies table
    const { error: updateError } = await supabase
      .from('agencies')
      .update({
        password_hash: hashedPassword,
        updated_at: new Date().toISOString()
      })
      .eq('id', agencyRow.id);

    if (updateError) {
      console.error('❌ Error updating password:', updateError.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to update password',
        error: process.env.NODE_ENV === 'development' ? updateError.message : undefined
      });
    }

    // Also update in users table if exists
    const { data: userRow } = await supabase
      .from('users')
      .select('id')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (userRow) {
      await supabase
        .from('users')
        .update({
          password_hash: hashedPassword,
          updated_at: new Date().toISOString()
        })
        .eq('id', userRow.id);
    }

    // Mark code as used
    await supabase
      .from('password_reset_codes')
      .update({ used: true })
      .eq('id', codeRecord.id);

    console.log('✅ Password reset successful:', {
      email: normalizedEmail,
      agencyId: agencyRow.id
    });

    const responseTime = Date.now() - startTime;
    res.status(200).json({
      success: true,
      message: 'Password reset successfully'
    });
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error('❌ Reset password error:', {
      error: error.message,
      stack: error.stack,
      responseTime: `${responseTime}ms`
    });

    res.status(500).json({
      success: false,
      message: 'Failed to reset password',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
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