# Stripe Webhook Testing Guide

## Problem
After successful payment in Stripe test mode, the `stripe_payment_intent_id` is not being saved in the transactions table.

## Root Cause
Webhooks from Stripe need to reach your local server, but localhost is not accessible from the internet.

## Solutions

### Option 1: Using Stripe CLI (RECOMMENDED for Local Testing)

1. **Install Stripe CLI**
   - Download from: https://stripe.com/docs/stripe-cli
   - Or use: `npm install -g stripe`

2. **Login to Stripe CLI**
   ```bash
   stripe login
   ```

3. **Forward webhooks to your local server**
   ```bash
   stripe listen --forward-to http://localhost:5000/api/stripe/webhook
   ```

4. **Copy the webhook signing secret** displayed in the terminal (starts with `whsec_`)
   - Update your `.env` file with this secret:
   ```
   STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx
   ```

5. **Restart your server**
   ```bash
   npm start
   ```

6. **Test the payment flow**
   - Create a checkout session via Postman
   - Complete the payment using test card: 4242 4242 4242 4242
   - Watch the terminal for webhook logs

### Option 2: Manual Sync Endpoint (IMMEDIATE FIX)

If webhooks are not working, use the manual sync endpoint to update the transaction:

1. **After completing payment**, get the `sessionId` from the response

2. **Call the sync endpoint**:
   ```bash
   POST http://localhost:5000/api/stripe/sync-transaction
   Content-Type: application/json

   {
     "sessionId": "cs_test_xxxxxxxxxxxxx"
   }
   ```

3. **This will**:
   - Retrieve the session from Stripe
   - Get the payment_intent_id from the session or subscription
   - Update the transaction status to "completed"
   - Save the stripe_payment_intent_id

### Option 3: Using Deployed Server

If your server is deployed on Render (https://super-admin-backend-2sy0.onrender.com):

1. **Configure webhook in Stripe Dashboard**:
   - Go to: https://dashboard.stripe.com/test/webhooks
   - Click "Add endpoint"
   - Endpoint URL: `https://super-admin-backend-2sy0.onrender.com/api/stripe/webhook`
   - Select events: `checkout.session.completed`, `invoice.payment_succeeded`
   - Copy the signing secret

2. **Update environment variable on Render**:
   - Set `STRIPE_WEBHOOK_SECRET` to the signing secret from Stripe Dashboard

3. **Test with deployed server**:
   - Use deployed URL in checkout-session API call
   - Webhooks will automatically work

## Debugging Checklist

- [ ] Stripe CLI is installed and forwarding webhooks
- [ ] STRIPE_WEBHOOK_SECRET is configured correctly in .env
- [ ] Server is restarted after updating .env
- [ ] Webhook logs appear in terminal when payment is completed
- [ ] Payment is completed successfully in Stripe (status = "paid")
- [ ] Transaction exists in database with matching sessionId

## Expected Server Logs (When Working)

```
🔔 WEBHOOK RECEIVED AT: 2025-01-24T...
📋 Body type: object
📋 Is Buffer: true
✅ Webhook secret configured: whsec_5695...
✅ Body is Buffer - constructing event...
✅✅✅ WEBHOOK VERIFIED: checkout.session.completed
📦 Event ID: evt_xxxxx
✅ Checkout session completed: cs_test_xxxxx
✅ Found transaction: 123
✅ Setting stripe_payment_intent_id: pi_xxxxx
✅ Transaction updated to completed
✅ Webhook processed successfully
```

## Testing Postman Collection

### 1. Create Checkout Session
```
POST http://localhost:5000/api/stripe/checkout-session
Content-Type: application/json

{
  "planId": "your-plan-id",
  "agencyId": "your-agency-id",
  "email": "test@example.com",
  "unitsPurchased": 1
}
```

**Save the `sessionId` from response**

### 2. Complete Payment
- Open the `url` from response in browser
- Use test card: 4242 4242 4242 4242
- Complete the payment

### 3. Manual Sync (if webhook doesn't work)
```
POST http://localhost:5000/api/stripe/sync-transaction
Content-Type: application/json

{
  "sessionId": "cs_test_xxxxxxxxxxxxx"
}
```

### 4. Verify Transaction
```
GET http://localhost:5000/api/transactions?sessionid=cs_test_xxxxxxxxxxxxx
```

## Common Issues

### Issue: Webhook not received
**Solution**: Use Stripe CLI to forward webhooks to localhost

### Issue: Webhook verification fails
**Solution**: Ensure STRIPE_WEBHOOK_SECRET matches the one from Stripe CLI or Dashboard

### Issue: Body is not raw
**Solution**: Already fixed - webhook route is mounted BEFORE body parsers in server.js

### Issue: Transaction not found
**Solution**: Ensure the checkout-session was created successfully and transaction exists in DB
