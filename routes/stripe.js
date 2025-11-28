const express = require('express');
const router = express.Router();
const stripeController = require('../controllers/StripeController');

// WEBHOOK - MUST use raw body
router.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  stripeController.handleWebhook
);

// Other routes - use JSON
router.post('/checkout-session', stripeController.createCheckoutSession);
router.get('/checkout-session/:sessionId', stripeController.getCheckoutSession);
router.get('/subscription/:subscriptionId', stripeController.getSubscription);
router.put('/subscription/:subscriptionId', stripeController.updateSubscription);
router.delete('/subscription/:subscriptionId', stripeController.cancelSubscription);

module.exports = router;