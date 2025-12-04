/**
 * Password Reset Controller (for Agencies)
 * Flow: Forgot → Verify OTP → Reset Password
 */

const supabase = require('../config/supabaseClient');
const EmailService = require('../services/emailService');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

/**
 * POST /api/mobile/auth/forgot-password
 */
exports.forgotPassword = async (req, res) => {
  try {
    console.log('[DEBUG] Forgot Password request:', req.body);
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email is required' });

    // ✅ Always send 200 to avoid email enumeration
    const genericMsg = 'If this email is registered, you will receive a verification code.';

    console.log('[DEBUG] Attempting to find agency with email:', email);
    
    // Use Supabase to find agency
    const { data: agency, error: agencyError } = await supabase
      .from('agencies')
      .select('id, email, reset_code, reset_code_expires, reset_verified')
      .eq('email', email.toLowerCase().trim())
      .maybeSingle();

    if (agencyError) {
      console.error('[ERROR] Database error finding agency:', agencyError);
      return res.status(500).json({
        success: false,
        message: 'Database query error. Please try again later.',
        error: process.env.NODE_ENV === 'development' ? agencyError.message : undefined
      });
    }

    if (!agency) {
      console.log(`⚠️ Password reset requested for unregistered email: ${email}`);
      return res.status(200).json({ success: true, message: genericMsg });
    }

    console.log('[DEBUG] Agency found:', agency.id);

    // Generate secure 6-digit OTP
    const code = crypto.randomInt(100000, 999999).toString();
    const normalizedEmail = email.toLowerCase().trim();

    console.log('🧾 Generated reset code:', code);
    console.log('🧾 Saving reset code for:', normalizedEmail);

    // Save the OTP details in Supabase (agencies table)
    const { error: updateError, data: updateResult } = await supabase
      .from('agencies')
      .update({
        // Use consistent naming depending on your DB schema
        reset_code: code,
        reset_code_expires: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        reset_verified: false
      })
      .eq('email', normalizedEmail)
      .select();

    if (updateError) {
      console.error('[ERROR] Failed to save reset code:', updateError);
      return res.status(500).json({ success: false, message: 'Failed to save reset code' });
    }

    console.log('✅ Saved reset code successfully:', updateResult);

    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#333;">
        <h2 style="color:#00796b;">Password Reset Verification Code</h2>
        <p>Use the following verification code to reset your password:</p>
        <h3 style="letter-spacing:3px;color:#00796b;">${code}</h3>
        <p>This code will expire in <b>10 minutes</b>.</p>
        <p>If you didn’t request this, please ignore this email.</p>
      </div>
    `;

    try {
      const info = await EmailService.sendEmail({
        to: email,
        subject: 'Lead Marketplace Pro – Password Reset Code',
        html
      });
      console.log('[DEBUG] Email send result:', info);
      console.log(`✅ OTP ${code} sent to ${email}`);
    } catch (mailError) {
      console.error('[ERROR] Email sending failed:', mailError);
      return res.status(500).json({
        success: false,
        message: 'Email sending failed. Please try again later.'
      });
    }
    res.status(200).json({ success: true, message: genericMsg });
  } catch (err) {
    console.error('❌ forgotPassword error:', err);
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
 * POST /api/mobile/auth/verify-code
 */
exports.verifyCode = async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) {
      return res.status(400).json({ success: false, message: 'Email and code are required' });
    }

    console.log('🔍 Verifying code for:', { email, code });

    // Fetch agency record from Supabase
    const { data: agency, error: agencyError } = await supabase
      .from('agencies')
      .select('id, email, reset_code, reset_code_expires, reset_verified')
      .eq('email', email.toLowerCase().trim())
      .maybeSingle();

    if (agencyError) {
      console.error('[ERROR] Database error finding agency:', agencyError);
      return res.status(500).json({
        success: false,
        message: 'Database query error. Please try again later.',
        error: process.env.NODE_ENV === 'development' ? agencyError.message : undefined
      });
    }

    if (!agency) {
      console.log('❌ No agency found for:', email);
      return res.status(404).json({ success: false, message: 'Invalid request' });
    }

    // Debug: show what was fetched
    console.log('💾 Stored in DB:', {
      reset_code: agency.reset_code,
      reset_code_expires: agency.reset_code_expires
    });
    console.log('⏰ Current time:', new Date().toISOString());

    // Validate code match and expiry
    const storedCode = String(agency.reset_code || '').trim();
    const receivedCode = String(code || '').trim();
    const expiresAt = agency.reset_code_expires ? new Date(agency.reset_code_expires) : null;
    const now = new Date();

    if (!storedCode || storedCode !== receivedCode) {
      console.log(`❌ Invalid code entered for: ${email}`);
      return res.status(400).json({ success: false, message: 'Invalid or expired verification code' });
    }

    if (!expiresAt || now > expiresAt) {
      console.log(`⏰ Code expired for: ${email}`);
      return res.status(400).json({ success: false, message: 'Verification code expired' });
    }

    // Mark as verified
    const { error: updateError } = await supabase
      .from('agencies')
      .update({ reset_verified: true })
      .eq('email', email.toLowerCase().trim());

    if (updateError) {
      console.error('[ERROR] Failed to update verification status:', updateError);
      return res.status(500).json({ success: false, message: 'Failed to update verification status' });
    }

    console.log(`✅ Verification successful for: ${email}`);
    return res.status(200).json({ success: true, message: 'Code verified successfully' });

  } catch (err) {
    console.error('❌ verifyCode error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * POST /api/mobile/auth/reset-password
 */
exports.resetPassword = async (req, res) => {
  try {
    // Accept both newPassword and new_password from frontend
    const email = req.body.email;
    const code = req.body.code; // Optional - if provided, verify it
    const newPassword = req.body.newPassword || req.body.new_password;

    console.log('🔐 Resetting password for:', email);
    console.log('📦 Body received:', req.body);

    if (!email || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Email and new password are required'
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Fetch agency record
    const { data: agency, error: agencyError } = await supabase
      .from('agencies')
      .select('id, email, reset_code, reset_code_expires, reset_verified')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (agencyError) {
      console.error('[ERROR] Supabase fetch failed:', agencyError);
      return res.status(500).json({ success: false, message: 'Database error' });
    }

    if (!agency) {
      console.log(`❌ No agency found for: ${email}`);
      return res.status(404).json({ success: false, message: 'No account found with this email address' });
    }

    // If code is provided, verify it first
    if (code) {
      console.log('🔍 Verifying code before password reset:', code);
      const storedCode = String(agency.reset_code || '').trim();
      const receivedCode = String(code || '').trim();
      const expiresAt = agency.reset_code_expires ? new Date(agency.reset_code_expires) : null;
      const now = new Date();

      console.log('💾 Code comparison:', {
        stored: storedCode,
        received: receivedCode,
        match: storedCode === receivedCode,
        expires: expiresAt,
        expired: expiresAt ? now > expiresAt : true
      });

      if (!storedCode || storedCode !== receivedCode) {
        console.log(`❌ Invalid code for password reset: ${email}`);
        return res.status(400).json({ success: false, message: 'Invalid verification code' });
      }

      if (!expiresAt || now > expiresAt) {
        console.log(`⏰ Code expired for password reset: ${email}`);
        return res.status(400).json({ success: false, message: 'Verification code expired' });
      }

      console.log('✅ Code verified successfully');
    } else {
      // If no code provided, check if already verified
      if (!agency.reset_verified) {
        console.log(`❌ Reset password denied: ${email} not verified and no code provided`);
        return res.status(400).json({ success: false, message: 'Invalid or unverified request. Please verify code first.' });
      }
      console.log('✅ Using existing verification status');
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password and clear OTP fields
    const { error: updateError } = await supabase
      .from('agencies')
      .update({
        password_hash: hashedPassword,
        reset_verified: false,
        reset_code: null,
        reset_code_expires: null
      })
      .eq('email', normalizedEmail);

    if (updateError) {
      console.error('[ERROR] Failed to update password:', updateError);
      return res.status(500).json({ success: false, message: 'Password update failed' });
    }

    console.log(`✅ Password reset successful for: ${email}`);
    return res.status(200).json({ success: true, message: 'Password reset successful' });
  } catch (err) {
    console.error('❌ resetPassword error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
