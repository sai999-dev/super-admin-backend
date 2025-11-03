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

    // Validation
    if (!business_name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Business name, email, and password are required'
      });
    }

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
        // Create a fallback free trial plan in development
        if ((process.env.NODE_ENV || 'development') !== 'production') {
          const { data: createdPlan, error: createPlanError } = await supabase
            .from('subscription_plans')
            .insert([
              {
                plan_name: 'Free Trial',
                description: '14-day trial plan (auto-created)',
                base_price: 0,
                is_active: true,
                base_cities_included: 5,
              },
            ])
            .select('id')
            .maybeSingle();
          if (!createPlanError && createdPlan) {
            selectedPlanId = createdPlan.id;
            console.log('Created fallback trial plan:', selectedPlanId);
          } else {
            console.warn('Failed to create fallback plan:', createPlanError?.message);
          }
        }
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

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create agency - use ONLY columns that actually exist in the database
    // Based on actual schema: agency_name, email, status, industry, verification_status, created_date, updated_at
    let createdAgencyRow = null;
    let insertError = null;
    
    const now = new Date();
    const today = now.toISOString().split('T')[0]; // Format: YYYY-MM-DD for created_date
    
    // Use ONLY the columns that actually exist in the database
    const agencyData = {
      agency_name: business_name,  // Use agency_name (confirmed exists)
      email: email,
      status: 'PENDING',           // Start as PENDING
      industry: industry || 'general',
      verification_status: 'NOT VERIFIED',  // Match existing data format
      created_date: today,         // Use created_date (NOT created_at)
      updated_at: now.toISOString()
    };
    
    console.log('Creating agency with columns:', Object.keys(agencyData).join(', '));
    
    const creation = await supabase
      .from('agencies')
      .insert([agencyData])
      .select('*')
      .single();

    if (creation.error) {
      insertError = creation.error;
      console.error('Error creating agency:', insertError);
    } else {
      createdAgencyRow = creation.data;
      console.log('✅ Agency created successfully');
      
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
        }
      } catch (activateErr) {
        console.warn('Could not activate agency after creation (will remain PENDING):', activateErr.message);
        // Continue - agency was created successfully
      }
    }

    if (insertError) {
      console.error('Error creating agency:', insertError);
      return res.status(500).json({
        success: false,
        message: 'Failed to create agency',
        error: insertError.message
      });
    }

  const normalizedNewAgency = normalizeAgencyRow(createdAgencyRow);

  // Ensure a fallback user account exists for password auth
  await ensureUserAccount(email, contact_name || business_name, hashedPassword);

    // Create subscription (only if we have a plan)
    let subscription = null;
    if (selectedPlanId) {
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
        console.error('Error creating subscription:', subscriptionError);
        // Don't fail registration, just log
      } else {
        subscription = subscriptionData;
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
        console.error('Error adding territories:', territoryError);
      }
    }

    // Generate JWT token
    const token = generateToken(normalizedNewAgency.id, normalizedNewAgency.email, normalizedNewAgency.business_name);

    res.status(201).json({
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
    const token = generateToken(normalizedAgency.id, normalizedAgency.email, normalizedAgency.business_name);

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
    const token = generateToken(normalizedAgency.id, normalizedAgency.email, normalizedAgency.business_name);

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

    // TODO: Send email with reset link
    // const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    // await sendPasswordResetEmail(normalizedEmail, resetLink, agencyRow.agency_name || agencyRow.business_name);

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

module.exports = router;
