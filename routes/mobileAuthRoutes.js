/**
 * Mobile App Authentication Routes
 * Public endpoints for agency registration and login
 * These endpoints do NOT require authentication
 */




const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const supabase = require('../config/supabaseClient');
const { authenticateAgency, generateAgencyToken } = require('../middleware/agencyAuth');
const notificationService = require('../services/notificationService');

// JWT secret from environment
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = '7d';

// =====================================================
// HELPER FUNCTIONS
// =====================================================

/**
 * Generate JWT token for agency
 */
const generateToken = (agencyId, agencyEmail, businessName) => {
  // Use shared generator to ensure compatibility with authenticateAgency
  return generateAgencyToken({ id: agencyId, email: agencyEmail, businessName });
};

/**
 * Normalize agency row across differing schemas
 * Supports both { id, business_name } and { agency_id, agency_name }
 */
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

// Ensure a user record exists (fallback auth when agencies has no password column)
async function ensureUserAccount(email, name, passwordHash) {
  try {
    if (!email || !passwordHash) return null;
    // Check if user exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id, email')
      .eq('email', email)
      .maybeSingle();

    if (existingUser) {
      // Optionally update password if missing
      await supabase
        .from('users')
        .update({ password_hash: passwordHash, updated_at: new Date().toISOString() })
        .eq('id', existingUser.id);
      return existingUser;
    }

    const { data: newUser } = await supabase
      .from('users')
      .insert([{ name: name || email, email, password_hash: passwordHash, role: 'agency', is_active: true }])
      .select()
      .maybeSingle();
    return newUser;
  } catch (e) {
    console.warn('ensureUserAccount warning:', e.message);
    return null;
  }
}

// =====================================================
// PUBLIC ROUTES (NO AUTH REQUIRED)
// =====================================================

/**
 * POST /api/v1/agencies/register
 * Register new agency with plan selection
 * 
 * Body:
 * {
 *   business_name: string,
 *   email: string,
 *   password: string,
 *   phone_number: string,
 *   industry: string,
 *   zipcodes: string[],
 *   plan_id: string (UUID),
 *   payment_method_id: string (Stripe payment method ID)
 * }
 */
router.post('/register', async (req, res) => {
  // Log immediately when route is hit
  console.log('\n========================================');
  console.log('🔵 REGISTRATION REQUEST RECEIVED');
  console.log('🔵 Time:', new Date().toISOString());
  console.log('🔵 Method:', req.method);
  console.log('🔵 URL:', req.url);
  console.log('🔵 Request body:', JSON.stringify(req.body, null, 2));
  console.log('========================================\n');
  
  try {
    const {
      business_name,
      email,
      password,
      phone_number,
      contact_name,
      industry,
      zipcodes = [],
      plan_id,
      payment_method_id
    } = req.body;

    console.log('🔵 Parsed request data:', { 
      email, 
      business_name, 
      hasPassword: !!password,
      hasPlanId: !!plan_id,
      zipcodesCount: zipcodes?.length || 0
    });

    // Validation
    if (!business_name || !email || !password) {
      console.log('❌ Validation failed: missing required fields');
      console.log('❌ Missing:', {
        business_name: !business_name,
        email: !email,
        password: !password
      });
      return res.status(400).json({
        success: false,
        message: 'Business name, email, and password are required',
        missing_fields: {
          business_name: !business_name,
          email: !email,
          password: !password
        }
      });
    }
    
    console.log('✅ Validation passed');

    // Get default plan if not provided
    let selectedPlanId = plan_id;
    if (!selectedPlanId) {
      // Get the first available plan as default (or create a free trial plan)
      const { data: defaultPlan } = await supabase
        .from('subscription_plans')
        .select('id')
        .eq('is_active', true)
        .order('base_price', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (defaultPlan) {
        selectedPlanId = defaultPlan.id;
        console.log('Using default plan:', selectedPlanId);
      } else {
        // AUTO-CREATION DISABLED - Plans must be created manually through admin portal
        // No fallback plan creation - admin must create plans first
        console.warn('⚠️  No active subscription plan found. User registration requires an active plan.');
        console.warn('⚠️  Admin must create subscription plans manually through the admin portal.');
        console.warn('⚠️  User registration will proceed without a plan assignment.');
        // selectedPlanId remains null - user will be registered without a subscription
      }
    }

    // Check if email already exists (support both schemas)
    const { data: existingAgency } = await supabase
      .from('agencies')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (existingAgency) {
      return res.status(409).json({
        success: false,
        message: 'Email already registered'
      });
    }

    // Hash password BEFORE creating agency
    console.log('🔵 Hashing password...');
    const hashedPassword = await bcrypt.hash(password, 10);
    console.log('✅ Password hashed successfully');

    // Create agency - include ALL required fields
    // Required: business_name, email, password_hash (from Sequelize model)
    let createdAgencyRow = null;
    
    const now = new Date();
    const today = now.toISOString().split('T')[0]; // Format: YYYY-MM-DD for created_date
    
    // Build agency data with required fields first
    const agencyData = {
      // REQUIRED FIELDS (NOT NULL in database)
      business_name: business_name,  // REQUIRED - primary name field
      email: email.trim().toLowerCase(),  // REQUIRED - must be unique
      password_hash: hashedPassword,  // REQUIRED - for authentication
      
      // OPTIONAL BUT RECOMMENDED FIELDS
      agency_name: business_name,  // Alias for business_name (if column exists)
      phone_number: phone_number || null,
      status: 'PENDING',  // Start as PENDING, will activate after creation
      industry: industry || 'general',
      verification_status: 'NOT VERIFIED',
      is_active: true,  // Set to active
      
      // TIMESTAMP FIELDS
      created_date: today,  // Use created_date if it exists
      created_at: now.toISOString(),  // Also set created_at (standard)
      updated_at: now.toISOString()
    };
    
    console.log('🔵 Creating agency with columns:', Object.keys(agencyData).join(', '));
    console.log('🔵 Agency data:', JSON.stringify(agencyData, null, 2));
    
    let creation;
    try {
      // Try full insert first
      creation = await supabase
        .from('agencies')
        .insert([agencyData])
        .select('*')
        .single();

      if (creation.error) {
        console.error('❌ Supabase error creating agency (full data):', JSON.stringify(creation.error, null, 2));
        console.error('❌ Error code:', creation.error.code);
        console.error('❌ Error message:', creation.error.message);
        console.error('❌ Error details:', creation.error.details);
        console.error('❌ Error hint:', creation.error.hint);
        
        // If error is about missing column, try with minimal required fields only
        if (creation.error.code === '42703' || creation.error.message?.includes('column') || creation.error.message?.includes('does not exist')) {
          console.log('⚠️ Trying with minimal required fields only...');
          
          const minimalAgencyData = {
            business_name: business_name,
            email: email.trim().toLowerCase(),
            password_hash: hashedPassword,
            status: 'PENDING',
            created_at: now.toISOString(),
            updated_at: now.toISOString()
          };
          
          console.log('🔵 Retrying with minimal data:', Object.keys(minimalAgencyData).join(', '));
          
          const retryCreation = await supabase
            .from('agencies')
            .insert([minimalAgencyData])
            .select('*')
            .single();
          
          if (retryCreation.error) {
            console.error('❌ Retry also failed:', JSON.stringify(retryCreation.error, null, 2));
            const errorResponse = {
              success: false,
              message: 'Failed to create agency',
              error: retryCreation.error.message || creation.error.message || 'Unknown error creating agency',
              attemptedFields: Object.keys(agencyData),
              retryFields: Object.keys(minimalAgencyData)
            };
            
            if (retryCreation.error.code) errorResponse.code = retryCreation.error.code;
            if (retryCreation.error.details) errorResponse.details = retryCreation.error.details;
            if (retryCreation.error.hint) errorResponse.hint = retryCreation.error.hint;
            
            console.error('❌ Sending error response:', JSON.stringify(errorResponse, null, 2));
            return res.status(500).json(errorResponse);
          }
          
          // Retry succeeded!
          creation = retryCreation;
          console.log('✅ Agency created with minimal fields');
        } else {
          // Other error - return it
          const errorResponse = {
            success: false,
            message: 'Failed to create agency',
            error: creation.error.message || 'Unknown error creating agency'
          };
          
          if (creation.error.code) errorResponse.code = creation.error.code;
          if (creation.error.details) errorResponse.details = creation.error.details;
          if (creation.error.hint) errorResponse.hint = creation.error.hint;
          
          console.error('❌ Sending error response:', JSON.stringify(errorResponse, null, 2));
          return res.status(500).json(errorResponse);
        }
      }
      
      if (!creation.data) {
        console.error('❌ No agency data returned from insert');
        return res.status(500).json({
          success: false,
          message: 'Failed to create agency',
          error: 'No agency data returned from database'
        });
      }
      
      createdAgencyRow = creation.data;
      console.log('✅ Agency created successfully:', createdAgencyRow.id);
      
      // Try to activate the account (PENDING -> ACTIVE)
      try {
        const activateResult = await supabase
          .from('agencies')
          .update({ 
            status: 'ACTIVE',
            updated_at: new Date().toISOString()
          })
          .eq('id', createdAgencyRow.id)
          .select()
          .single();
        
        if (activateResult.data) {
          createdAgencyRow = activateResult.data;
          console.log('✅ Agency activated successfully');
        } else if (activateResult.error) {
          console.warn('⚠️ Could not activate agency:', activateResult.error.message);
        }
      } catch (activateErr) {
        console.warn('⚠️ Could not activate agency after creation (will remain PENDING):', activateErr.message);
        // Continue - agency was created successfully
      }
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
    
    if (!createdAgencyRow) {
      console.error('❌ createdAgencyRow is null after insert attempt');
      return res.status(500).json({
        success: false,
        message: 'Failed to create agency',
        error: 'Agency creation returned no data'
      });
    }

  const normalizedNewAgency = normalizeAgencyRow(createdAgencyRow);
  
  if (!normalizedNewAgency || !normalizedNewAgency.id) {
    console.error('❌ Failed to normalize agency row or missing ID');
    console.error('❌ createdAgencyRow:', JSON.stringify(createdAgencyRow, null, 2));
    return res.status(500).json({
      success: false,
      message: 'Failed to create agency',
      error: 'Agency created but could not be normalized',
      details: 'Missing agency ID after creation'
    });
  }

  // Ensure a fallback user account exists for password auth
  try {
    console.log('🔵 Ensuring user account exists...');
    await ensureUserAccount(email, contact_name || business_name, hashedPassword);
    console.log('✅ User account ensured');
  } catch (userErr) {
    console.warn('⚠️ Warning: Could not ensure user account:', userErr.message);
    // Don't fail registration if user account creation fails
  }

    // Create subscription (only if we have a plan)
    let subscription = null;
    if (selectedPlanId) {
      console.log('🔵 Creating subscription with plan_id:', selectedPlanId);
      const now = new Date();
      const trialEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
      const nextBilling = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const { data: subscriptionData, error: subscriptionError } = await supabase
        .from('subscriptions')
        .insert([
          {
            agency_id: normalizedNewAgency.id,
            plan_id: selectedPlanId,
            status: 'trial',
            start_date: now.toISOString(),
            trial_end_date: trialEnd.toISOString(),
            next_billing_date: nextBilling.toISOString(),
            auto_renew: true,
            metadata: { payment_method_id }
          }
        ])
        .select()
        .single();

      if (subscriptionError) {
        console.error('❌ Error creating subscription:', JSON.stringify(subscriptionError, null, 2));
        console.error('❌ Subscription error code:', subscriptionError.code);
        console.error('❌ Subscription error message:', subscriptionError.message);
        // Don't fail registration, just log
      } else {
        subscription = subscriptionData;
        console.log('✅ Subscription created successfully:', subscription.id);
        // Mirror to agency_subscriptions used by the admin portal list
        try {
          // Normalize agency_id - handle both id and agency_id columns
          const finalAgencyId = normalizedNewAgency.id || normalizedNewAgency.agency_id || createdAgencyRow?.agency_id || createdAgencyRow?.id;
          
          if (finalAgencyId && selectedPlanId) {
            // Get plan price for monthly_payment
            const { data: planInfo } = await supabase
              .from('subscription_plans')
              .select('base_price')
              .eq('id', selectedPlanId)
              .maybeSingle();
            
            const { error: agencySubError } = await supabase
              .from('agency_subscriptions')
              .insert([
                {
                  agency_id: finalAgencyId,
                  plan_id: selectedPlanId,
                  status: 'active',
                  start_date: now.toISOString(),
                  end_date: nextBilling.toISOString(),
                  trial_end_date: trialEnd.toISOString(),
                  auto_renew: true,
                  monthly_payment: planInfo?.base_price || 0,
                },
              ]);
            if (agencySubError) {
              console.warn('Unable to mirror agency_subscriptions:', agencySubError.message);
            } else {
              console.log('✅ Successfully mirrored subscription to agency_subscriptions');
            }
          }
        } catch (e) {
          console.warn('Mirror agency_subscriptions failed:', e.message);
        }
      }
    }

    // Add territories (zipcodes)
    if (Array.isArray(zipcodes) && zipcodes.length > 0 && subscription) {
      try {
        console.log('🔵 Adding territories:', zipcodes.length);
        const territoryInserts = zipcodes.map(zipcode => ({
          subscription_id: subscription.id,
          agency_id: normalizedNewAgency.id,
          type: 'zipcode',
          value: zipcode,
          state: 'USA', // Default, should be validated
          is_active: true
        }));

        const { error: territoryError } = await supabase
          .from('territories')
          .insert(territoryInserts);

        if (territoryError) {
          console.error('❌ Error adding territories:', JSON.stringify(territoryError, null, 2));
          // Don't fail registration if territories fail
        } else {
          console.log('✅ Territories added successfully');
        }
      } catch (territoryErr) {
        console.warn('⚠️ Warning: Could not add territories:', territoryErr.message);
        // Don't fail registration if territories fail
      }
    }

    // Generate JWT token
    console.log('🔵 Generating JWT token for agency:', normalizedNewAgency.id);
    const token = generateToken(normalizedNewAgency.id, normalizedNewAgency.email, normalizedNewAgency.business_name);
    console.log('✅ Token generated successfully');

    const responseData = {
      success: true,
      message: 'Agency registered successfully',
      data: {
        agency_id: normalizedNewAgency.id,
        business_name: normalizedNewAgency.business_name,
        email: normalizedNewAgency.email,
        status: normalizedNewAgency.status,
        subscription: subscription ? {
          status: subscription.status,
          trial_end: subscription.trial_end_date,
          territories_count: zipcodes.length
        } : null
      },
      token,
      expires_in: JWT_EXPIRES_IN
    };

    console.log('\n✅ ========================================');
    console.log('✅ REGISTRATION SUCCESSFUL');
    console.log('✅ Agency ID:', normalizedNewAgency.id);
    console.log('✅ Email:', normalizedNewAgency.email);
    console.log('✅ Has Subscription:', !!subscription);
    console.log('✅ Sending response...');
    console.log('✅ ========================================\n');

    // Send verification notification after successful registration and subscription
    if (subscription) {
      try {
        console.log('🔵 Sending verification notification...');
        
        // Save notification to database
        await supabase.from('notifications').insert({
          agency_id: normalizedNewAgency.id,
          title: 'Verify Your Agency',
          message: 'Verify your agency/company to get leads. Upload your verification document to start receiving leads.',
          type: 'verification_required',
          is_read: false,
          created_at: new Date().toISOString()
        });

        // Send push notification if device is registered
        await notificationService.sendPushNotification(normalizedNewAgency.id, {
          title: 'Verify Your Agency',
          body: 'Verify your agency/company to get leads. Upload your verification document to start receiving leads.',
          type: 'verification_required',
          data: {
            action: 'upload_document',
            agency_id: normalizedNewAgency.id
          }
        });

        console.log('✅ Verification notification sent');
      } catch (notifErr) {
        console.warn('⚠️ Could not send verification notification:', notifErr.message);
        // Don't fail registration if notification fails
      }
    }

    res.status(201).json(responseData);

  } catch (error) {
    console.error('\n❌ ========================================');
    console.error('❌ REGISTRATION ERROR (Catch Block)');
    console.error('❌ Error message:', error.message);
    console.error('❌ Error name:', error.name);
    console.error('❌ Error code:', error.code);
    console.error('❌ Error details:', error.details);
    console.error('❌ Error hint:', error.hint);
    console.error('❌ Error stack:', error.stack);
    console.error('❌ Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    console.error('❌ ========================================\n');
    
    // Build detailed error response
    const errorResponse = {
      success: false,
      message: 'Registration failed',
      error: error.message || 'Unknown error occurred',
      errorType: error.name || 'Error'
    };
    
    // Add database-specific error details
    if (error.code) {
      errorResponse.code = error.code;
      // Map common PostgreSQL error codes to user-friendly messages
      if (error.code === '23502') {
        errorResponse.message = 'Missing required field in database';
        errorResponse.field = error.column || 'unknown';
      } else if (error.code === '23505') {
        errorResponse.message = 'Email already exists';
      } else if (error.code === '23503') {
        errorResponse.message = 'Invalid reference (foreign key constraint)';
      } else if (error.code === '42703') {
        errorResponse.message = 'Database column does not exist';
      }
    }
    
    if (error.details) errorResponse.details = error.details;
    if (error.hint) errorResponse.hint = error.hint;
    if (process.env.NODE_ENV === 'development') {
      errorResponse.stack = error.stack;
    }
    
    errorResponse.timestamp = new Date().toISOString();
    
    console.error('❌ Sending error response:', JSON.stringify(errorResponse, null, 2));
    
    // Make sure response hasn't been sent already
    if (!res.headersSent) {
      res.status(500).json(errorResponse);
    } else {
      console.error('❌ WARNING: Response already sent, cannot send error response');
    }
  }
});

/**
 * POST /api/v1/agencies/login
 * Login for agency users
 * 
 * Body:
 * {
 *   email: string,
 *   password: string
 * }
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Find agency (support both schemas)
    const { data: agencyRow, error: agencyError } = await supabase
      .from('agencies')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (agencyError || !agencyRow) {
      console.warn('Login reject: agency not found for email', email, 'error:', agencyError?.message);
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    let normalizedAgency = normalizeAgencyRow(agencyRow);
    // Normalize status to uppercase for consistent comparison
    const normalizedStatus = normalizedAgency.status ? normalizedAgency.status.toString().toUpperCase() : 'ACTIVE';

    // Check if account is active
    if (normalizedStatus !== 'ACTIVE') {
      console.warn('Login status check:', normalizedStatus);
      if (
        normalizedStatus === 'PENDING' &&
        (process.env.NODE_ENV || 'development') !== 'production'
      ) {
        // Auto-activate pending accounts in non-production for DX
        await supabase
          .from('agencies')
          .update({ status: 'ACTIVE', updated_at: new Date().toISOString() })
          .eq('id', normalizedAgency.id);
        normalizedAgency = { ...normalizedAgency, status: 'ACTIVE' };
        console.log('Auto-activated pending account for', normalizedAgency.email);
      } else {
        console.warn('Login reject: account not active. Status =', normalizedStatus);
        return res.status(403).json({
          success: false,
          message: `Account is ${normalizedStatus}. Please contact support.`
        });
      }
    }

    // Verify password
    let passwordHashToUse = normalizedAgency.password_hash;
    if (!passwordHashToUse) {
      const { data: userRow } = await supabase
        .from('users')
        .select('password_hash')
        .eq('email', email)
        .maybeSingle();
      passwordHashToUse = userRow?.password_hash;
    }

    // In development, allow login if no stored hash exists (legacy schema/dev environments)
    // This bypass is disabled in production
    let isValidPassword = false;
    if (passwordHashToUse) {
      isValidPassword = await bcrypt.compare(password, passwordHashToUse);
    } else if ((process.env.NODE_ENV || 'development') !== 'production') {
      console.warn('DEV BYPASS: No stored password hash found; allowing login in non-production.');
      isValidPassword = true;
    }

    if (!isValidPassword) {
      console.warn('Login reject: invalid password or missing hash');
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Get subscription status
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('*, subscription_plans(*)')
      .eq('agency_id', normalizedAgency.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Get territory count
    const { count: territoryCount } = await supabase
      .from('territories')
      .select('*', { count: 'exact', head: true })
      .eq('agency_id', normalizedAgency.id)
      .eq('is_active', true);

  // Generate JWT token
   const token = generateAgencyToken({
  id: normalizedAgency.id,
  email: normalizedAgency.email,
  businessName: normalizedAgency.business_name
});


    res.json({
      success: true,
      message: 'Login successful',
      data: {
        agency_id: normalizedAgency.id,
        business_name: normalizedAgency.business_name,
        email: normalizedAgency.email,
        phone_number: normalizedAgency.phone_number,
        status: normalizedAgency.status,
        verified: !!normalizedAgency.verified,
        subscription: subscription ? {
          status: subscription.status,
          plan_name: subscription.subscription_plans?.plan_name,
          current_period_end: subscription.end_date,
          trial_end: subscription.trial_end_date,
          territories_count: territoryCount || 0
        } : null
      },
      token,
      expires_in: JWT_EXPIRES_IN
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
 * POST /api/v1/agencies/logout
 * Logout (client-side token removal, optional server-side cleanup)
 */
router.post('/logout', (req, res) => {
  // In a stateless JWT system, logout is primarily client-side
  // Optionally implement token blacklisting here
  
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

/**
 * POST /api/v1/agencies/verify-email
 * Verify agency email with verification code
 * 
 * Body:
 * {
 *   email: string,
 *   verification_code: string
 * }
 */
router.post('/verify-email', async (req, res) => {
  try {
    const { email, verification_code } = req.body;

    if (!email || !verification_code) {
      return res.status(400).json({
        success: false,
        message: 'Email and verification code are required'
      });
    }

    // Find agency by email
    const { data: agencyRow, error: agencyError } = await supabase
      .from('agencies')
      .select('*')
      .eq('email', email)
      .single();

    if (agencyError || !agencyRow) {
      return res.status(404).json({
        success: false,
        message: 'Agency not found'
      });
    }

    // Check verification code (if stored in database)
    // Note: This assumes verification_code is stored in agencies table
    // If using separate table, query that instead
    if (agencyRow.verification_code !== verification_code) {
      return res.status(400).json({
        success: false,
        message: 'Invalid verification code'
      });
    }

    // Check if code is expired
    if (agencyRow.verification_expires_at) {
      const expiresAt = new Date(agencyRow.verification_expires_at);
      if (expiresAt < new Date()) {
        return res.status(410).json({
          success: false,
          message: 'Verification code has expired'
        });
      }
    }

    // Update agency as verified
    const normalizedAgency = normalizeAgencyRow(agencyRow);
    const { error: updateError } = await supabase
      .from('agencies')
      .update({
        is_verified: true,
        verification_code: null,
        verification_expires_at: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', normalizedAgency.id);

    if (updateError) throw updateError;

    // Generate JWT token
   const token = generateAgencyToken({
  id: normalizedAgency.id,
  email: normalizedAgency.email,
  businessName: normalizedAgency.business_name
});


    res.json({
      success: true,
      token,
      message: 'Email verified successfully',
      data: {
        agency_id: normalizedAgency.id,
        email: normalizedAgency.email,
        agency_name: normalizedAgency.business_name,
        is_verified: true
      }
    });
  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify email',
      error: error.message
    });
  }
});

/**
 * POST /api/v1/agencies/forgot-password
 * Request password reset for agency email
 * 
 * Body:
 * {
 *   email: string
 * }
 */
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    // Validation
    if (!email || typeof email !== 'string' || !email.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check if agency exists
    const { data: agencyRow, error: agencyError } = await supabase
      .from('agencies')
      .select('id, email, agency_name, business_name')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (agencyError) {
      console.error('Error checking agency:', agencyError);
      return res.status(500).json({
        success: false,
        message: 'Error checking email'
      });
    }

    // Security: Always return success to prevent email enumeration
    // But log internally if email doesn't exist
    if (!agencyRow) {
      console.warn('Password reset requested for non-existent email:', normalizedEmail);
      // Return success to prevent email enumeration attacks
      return res.json({
        success: true,
        message: 'If an account with this email exists, password reset instructions have been sent.'
      });
    }

    // Check rate limiting (max 3 requests per hour)
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
    const { count: recentRequests } = await supabase
      .from('password_reset_tokens')
      .select('*', { count: 'exact', head: true })
      .eq('agency_id', agencyRow.id)
      .gte('created_at', oneHourAgo);

    if (recentRequests >= 3) {
      return res.status(429).json({
        success: false,
        message: 'Too many reset attempts. Please try again later.'
      });
    }

    // Generate secure reset token
    const crypto = require('crypto');
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 3600000); // 1 hour

    // Store reset token
    await supabase.from('password_reset_tokens').insert({
      agency_id: agencyRow.id,
      token: resetToken,
      expires_at: expiresAt.toISOString(),
      created_at: new Date().toISOString()
    });

    // Send email with reset link
    try {
      const emailService = require('../services/emailService');
      await emailService.sendPasswordResetEmail(normalizedEmail, resetToken);
      console.log('Password reset email sent to:', normalizedEmail);
    } catch (emailError) {
      // Log but don't fail - email is non-critical
      console.warn('Failed to send password reset email (non-critical):', emailError.message);
    }

    console.log('Password reset token generated for:', normalizedEmail, 'Token:', resetToken);

    // Always return success (security best practice)
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

// =====================================================
// AUTHENTICATED AGENCY PROFILE ROUTES
// =====================================================

/**
 * GET /api/v1/agencies/profile
 * Get agency profile, subscription summary, and territories count
 */
router.get('/profile', authenticateAgency, async (req, res) => {
  try {
    const agencyId = req.agency.id;

    const { data: agencyRow, error: agencyError } = await supabase
      .from('agencies')
      .select('*')
      .in('id', [agencyId])
      .maybeSingle();

    const agency = normalizeAgencyRow(agencyRow);

    if (agencyError || !agency) {
      return res.status(404).json({ success: false, message: 'Agency not found' });
    }

    const { data: subscription } = await supabase
      .from('subscriptions')
      .select(`id, status, start_date, trial_end_date, next_billing_date, auto_renew, subscription_plans(plan_name, base_price, base_cities_included)`) 
      .eq('agency_id', agencyId)
      .in('status', ['trial','active','suspended'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    const { count: territoriesCount } = await supabase
      .from('territories')
      .select('*', { count: 'exact', head: true })
      .eq('agency_id', agencyId)
      .eq('is_active', true);

    return res.json({
      success: true,
      data: {
        ...agency,
        zipcodes: agencyRow.zipcodes || agencyRow.primary_zipcodes || [],  // Ensure zipcodes are included
        subscription: subscription || null,
        territories_count: territoriesCount || 0
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ success: false, message: 'Failed to get profile', error: error.message });
  }
});

/**
 * PUT /api/v1/agencies/profile
 * Update agency profile
 */
router.put('/profile', authenticateAgency, async (req, res) => {
  try {
    const agencyId = req.agency.id;
    const { business_name, phone_number } = req.body;

  const updates = { updated_at: new Date().toISOString() };
  if (business_name !== undefined) updates.business_name = business_name;
    if (phone_number !== undefined) updates.phone_number = phone_number;

    const { data, error } = await supabase
      .from('agencies')
      .update(updates)
  .eq('id', agencyId)
      .select()
      .single();

    if (error) {
      return res.status(400).json({ success: false, message: 'Failed to update profile', error: error.message });
    }

    res.json({ success: true, data });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ success: false, message: 'Failed to update profile', error: error.message });
  }
});



/**
 * POST /api/mobile/save-device-token
 * Save device token for web or mobile (no auth required)
 * Body:
 * {
 *   token: string,
 *   platform: "web" | "android" | "ios"
 * }
 */
/** 
 * PUBLIC: Save Web / Mobile device token 
 * (No authentication required for Flutter Web)
 */
/**
 * PUBLIC: Save Web / Mobile device token (NO AUTH)
 */
// PUBLIC: Save Web / Mobile device token
// PUBLIC: Save Web / Mobile device token
router.post("/save-device-token", async (req, res) => {
  try {
    const { token, platform, agency_id } = req.body;

    if (!token) return res.status(400).json({ success: false, message: "token is required" });
    if (!agency_id) return res.status(400).json({ success: false, message: "agency_id is required" });

    console.log("💾 Inserting device token", { token, platform, agency_id });

    const { error } = await supabase.from("agency_devices").insert([
      {
        agency_id,
        device_token: token,
        platform: platform || "web",
        device_type: platform || "web",
        is_active: true,
        push_enabled: true,
        created_at: new Date().toISOString(),
        last_seen: new Date().toISOString(),
      },
    ]);

    if (error) {
      console.error("❌ Insert error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to save device token",
        error: error.message,
      });
    }

    return res.json({ success: true, message: "Device token saved successfully" });

  } catch (err) {
    console.error("❌ save-device-token error:", err);
    return res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
});









/**
 * POST /api/v1/agencies/update-fcm
 * Save or update device FCM token for this agency
 */
// router.post('/update-fcm', authenticateAgency, async (req, res) => {
//   try {
//     const agencyId = req.agency.id;
//     const { fcm_token } = req.body;

//     if (!fcm_token) {
//       return res.status(400).json({
//         success: false,
//         message: "fcm_token is required"
//       });
//     }

//     console.log("📌 Updating FCM for agency:", agencyId, "Token:", fcm_token);

//     const { error } = await supabase
//       .from('agencies')
//       .update({
//         fcm_token: fcm_token,
//         updated_at: new Date().toISOString()
//       })
//       .eq('id', agencyId);

//     if (error) {
//       console.error("❌ Failed to update FCM:", error.message);
//       return res.status(500).json({
//         success: false,
//         message: "Failed to update FCM token",
//         error: error.message
//       });
//     }

//     return res.json({
//       success: true,
//       message: "FCM token updated successfully"
//     });

//   } catch (error) {
//     console.error("❌ Error updating FCM token:", error);
//     res.status(500).json({
//       success: false,
//       message: "Server error updating FCM token"
//     });
//   }
// });


module.exports = router;
