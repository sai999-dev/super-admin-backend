/**
 * Registration Email Verification Routes
 * Handles email verification during user registration
 */

const express = require('express');
const router = express.Router();
const registerEmailController = require('../controllers/registerEmailController');

/**
 * POST /api/mobile/auth/register/send-email-code
 * Send 6-digit verification code to email
 */
router.post('/register/send-email-code', registerEmailController.sendEmailCode);

/**
 * POST /api/mobile/auth/register/verify-email-code
 * Verify the 6-digit code sent during registration
 */
router.post('/register/verify-email-code', registerEmailController.verifyEmailCode);

module.exports = router;


