/**
 * Registration Email Verification Controller
 * Flow: Send Code → Verify Code
 */

const supabase = require('../config/supabaseClient');
const EmailService = require('../services/emailService');
const crypto = require('crypto');

/**
 * POST /api/mobile/auth/register/send-email-code
 * Send 6-digit verification code to email during registration
 */
exports.sendEmailCode = async (req, res) => {
  try {
    const { email } = req.body;

    // Validation
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    console.log('📧 Registration email verification request:', {
      email: `${normalizedEmail.substring(0, 3)}***`,
      timestamp: new Date().toISOString()
    });

    // Generate secure 6-digit code
    const code = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

    console.log('🔐 Generated verification code:', code);
    console.log('⏰ Code expires at:', expiresAt.toISOString());

    // Insert into email_verification_codes table
    const { data: codeRecord, error: insertError } = await supabase
      .from('email_verification_codes')
      .insert({
        email: normalizedEmail,
        code: code,
        expires_at: expiresAt.toISOString(),
        used: false
      })
      .select()
      .single();

    if (insertError) {
      console.error('❌ Failed to save verification code:', insertError);
      return res.status(500).json({
        success: false,
        message: 'Failed to generate verification code. Please try again later.',
        error: process.env.NODE_ENV === 'development' ? insertError.message : undefined
      });
    }

    console.log('✅ Verification code saved to database:', codeRecord.id);

    // Send email with verification code
    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#333;">
        <h2 style="color:#00796b;">Email Verification Code</h2>
        <p>Thank you for registering with Lead Marketplace Pro!</p>
        <p>Use the following verification code to complete your registration:</p>
        <h3 style="letter-spacing:3px;color:#00796b;font-size:24px;">${code}</h3>
        <p>This code will expire in <b>10 minutes</b>.</p>
        <p>If you didn't request this code, please ignore this email.</p>
      </div>
    `;

    try {
      await EmailService.sendEmail({
        to: email,
        subject: 'Lead Marketplace Pro – Email Verification Code',
        html
      });
      console.log(`✅ Verification code ${code} sent to ${normalizedEmail}`);
    } catch (mailError) {
      console.error('❌ Email sending failed:', mailError);
      // Still return success to avoid email enumeration, but log the error
      // In production, you might want to handle this differently
    }

    // Always return success to avoid email enumeration
    res.status(200).json({
      success: true,
      message: 'If this email is valid, you will receive a verification code.'
    });

  } catch (err) {
    console.error('❌ sendEmailCode error:', err);
    console.error('❌ Error details:', {
      message: err.message,
      stack: err.stack,
      name: err.name,
      code: err.code
    });
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

/**
 * POST /api/mobile/auth/register/verify-email-code
 * Verify the 6-digit code sent during registration
 */
exports.verifyEmailCode = async (req, res) => {
  try {
    const { email, code } = req.body;

    // Validation
    if (!email || !code) {
      return res.status(400).json({
        verified: false,
        error: 'Email and verification code are required'
      });
    }

    // Validate code format (must be 6 digits)
    if (!/^\d{6}$/.test(code)) {
      return res.status(400).json({
        verified: false,
        error: 'Verification code must be 6 digits'
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const trimmedCode = code.trim();

    console.log('🔍 Verifying registration code:', {
      email: `${normalizedEmail.substring(0, 3)}***`,
      code: '******',
      timestamp: new Date().toISOString()
    });

    // Fetch latest unused code from email_verification_codes table
    const { data: codeRecords, error: fetchError } = await supabase
      .from('email_verification_codes')
      .select('*')
      .eq('email', normalizedEmail)
      .eq('used', false)
      .order('expires_at', { ascending: false })
      .limit(1);

    if (fetchError) {
      console.error('❌ Database error fetching code:', fetchError);
      return res.status(500).json({
        verified: false,
        error: 'Database error. Please try again later.',
        details: process.env.NODE_ENV === 'development' ? fetchError.message : undefined
      });
    }

    // Check if code exists
    if (!codeRecords || codeRecords.length === 0) {
      console.log('❌ No verification code found for:', normalizedEmail);
      return res.status(400).json({
        verified: false,
        error: 'Invalid or expired verification code'
      });
    }

    const codeRecord = codeRecords[0];

    // Validate code match
    const storedCode = String(codeRecord.code || '').trim();
    const receivedCode = String(trimmedCode || '').trim();

    if (storedCode !== receivedCode) {
      console.log('❌ Invalid code entered for:', normalizedEmail);
      return res.status(400).json({
        verified: false,
        error: 'Invalid verification code'
      });
    }

    // Validate expiration
    const expiresAt = codeRecord.expires_at ? new Date(codeRecord.expires_at) : null;
    const now = new Date();

    if (!expiresAt || now > expiresAt) {
      console.log('⏰ Code expired for:', normalizedEmail);
      // Mark as used even though expired
      await supabase
        .from('email_verification_codes')
        .update({ used: true })
        .eq('id', codeRecord.id);

      return res.status(400).json({
        verified: false,
        error: 'Verification code has expired'
      });
    }

    // Mark code as used
    const { error: updateError } = await supabase
      .from('email_verification_codes')
      .update({ used: true })
      .eq('id', codeRecord.id);

    if (updateError) {
      console.error('❌ Failed to mark code as used:', updateError);
      // Still return success since code was verified
    }

    console.log(`✅ Email verification successful for: ${normalizedEmail}`);

    return res.status(200).json({
      verified: true,
      message: 'Email verified successfully'
    });

  } catch (err) {
    console.error('❌ verifyEmailCode error:', err);
    console.error('❌ Error details:', {
      message: err.message,
      stack: err.stack,
      name: err.name,
      code: err.code
    });
    return res.status(500).json({
      verified: false,
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

