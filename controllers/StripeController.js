const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const stripeService = require('../services/StripeService');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

class StripeController {
  async createCheckoutSession(req, res) {
    try {
      const { planId, agencyId, customPrice, unitsPurchased, email } = req.body;

      if (!planId || !agencyId || !email) {
        return res.status(400).json({ error: 'planId, agencyId, and email required' });
      }

      const { data: plan, error: planError } = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('id', planId)
        .single();

      if (planError || !plan) {
        return res.status(404).json({ error: 'Plan not found' });
      }

      let { data: subscription } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('plan_id', planId)
        .eq('agency_id', agencyId)
        .single();

      if (!subscription) {
        const { data: newSub, error: createError } = await supabase
          .from('subscriptions')
          .insert([{
            plan_id: planId,
            agency_id: agencyId,
            custom_price: customPrice || null,
            units_purchased: unitsPurchased || 1,
            status: 'pending',
            billing_cycle: 'monthly',
            current_units: 0,
            start_date: new Date().toISOString()
          }])
          .select()
          .single();

        if (createError) throw createError;
        subscription = newSub;
      }

      const unitPrice = customPrice ? customPrice / (unitsPurchased || 1) : plan.price_per_unit;
      const amount = Math.round(unitPrice * (unitsPurchased || 1) * 100);

      // For mobile apps, use a simple success page that shows payment status
      // The app will check payment status via the session ID
      const baseUrl = process.env.BASE_API_URL || `http://localhost:${process.env.PORT || 5000}`;

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'subscription',
        line_items: [{
          price_data: {
            currency: process.env.STRIPE_CURRENCY || 'usd',
            product_data: {
              name: plan.name,
              description: plan.description || 'Subscription Plan'
            },
            unit_amount: amount,
            recurring: {
              interval: subscription.billing_cycle || 'month',
              interval_count: 1
            }
          },
          quantity: 1
        }],
        success_url: `${baseUrl}/api/stripe/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/api/stripe/payment-cancelled?session_id={CHECKOUT_SESSION_ID}`,
        customer_email: email,
        metadata: {
          subscriptionId: subscription.id,
          agencyId,
          planId
        }
      });

      // ✅ DON'T store session.id as stripe_subscription_id
      // The actual subscription ID will come from the webhook

      // ✅ Create transaction with checkout session ID
      const { data: transaction, error: transactionError } = await supabase
        .from('transactions')
        .insert([{
          agency_id: agencyId,
          subscriptionid: subscription.id,
          transaction_type: 'subscription',
          amount: parseFloat((amount / 100).toFixed(2)),
          currency: process.env.STRIPE_CURRENCY || 'USD',
          sessionid: session.id,  // ✅ This is the key identifier
          status: 'pending',
          gateway: 'stripe',
          metadata: {
            planId,
            email,
            unitsPurchased,
            planName: plan.name,
            checkoutSessionId: session.id
          }
        }])
        .select()
        .single();

      if (transactionError) {
        console.error('❌ Transaction creation error:', transactionError);
        throw transactionError;
      }

      console.log('✅ Transaction created:', transaction.id);
      console.log('✅ Checkout session ID:', session.id);

      res.json({ 
        sessionId: session.id,
        url: session.url,
        subscriptionId: subscription.id,
        transactionId: transaction.id
      });
    } catch (error) {
      console.error('Checkout error:', error);
      res.status(500).json({ error: error.message });
    }
  }

  async getCheckoutSession(req, res) {
    try {
      const { sessionId } = req.params;
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      
      res.json({
        id: session.id,
        status: session.payment_status,
        customer: session.customer,
        subscription: session.subscription,
        metadata: session.metadata
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async getSubscription(req, res) {
    try {
      const { subscriptionId } = req.params;

      const { data: subscription, error } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('id', subscriptionId)
        .single();

      if (error || !subscription) {
        return res.status(404).json({ error: 'Subscription not found' });
      }

      res.json(subscription);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async updateSubscription(req, res) {
    try {
      const { subscriptionId } = req.params;
      const { custom_price_per_unit, units_purchased } = req.body;

      const { data: updated, error } = await supabase
        .from('subscriptions')
        .update({
          custom_price_per_unit,
          units_purchased
        })
        .eq('id', subscriptionId)
        .select()
        .single();

      if (error) throw error;
      res.json({ success: true, subscription: updated });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async cancelSubscription(req, res) {
    try {
      const { subscriptionId } = req.params;
      const { immediate } = req.body;

      const { data: subscription, error } = await supabase
        .from('subscriptions')
        .select('stripe_subscription_id')
        .eq('id', subscriptionId)
        .single();

      if (error || !subscription) {
        return res.status(404).json({ error: 'Subscription not found' });
      }

      if (subscription.stripe_subscription_id) {
        await stripe.subscriptions.update(subscription.stripe_subscription_id, {
          cancel_at_period_end: !immediate
        });
      }

      await supabase
        .from('subscriptions')
        .update({
          status: immediate ? 'cancelled' : 'cancelling',
          end_date: immediate ? new Date().toISOString() : null
        })
        .eq('id', subscriptionId);

      res.json({ success: true, message: 'Subscription cancelled' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async handleWebhook(req, res) {
    const sig = req.headers['stripe-signature'];

    console.log('═══════════════════════════════════════════════');
    console.log('🔔 WEBHOOK RECEIVED AT:', new Date().toISOString());
    console.log('═══════════════════════════════════════════════');
    console.log('📋 Headers:', JSON.stringify(req.headers, null, 2));
    console.log('📋 Body type:', typeof req.body);
    console.log('📋 Is Buffer:', Buffer.isBuffer(req.body));
    console.log('📋 Body length:', req.body?.length || 0);

    if (!sig) {
      console.error('❌ Missing stripe-signature header');
      console.error('Available headers:', Object.keys(req.headers));
      return res.status(400).json({ error: 'Missing signature' });
    }

    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      console.error('❌ STRIPE_WEBHOOK_SECRET not configured');
      return res.status(500).json({ error: 'Webhook secret not configured' });
    }

    console.log('✅ Webhook secret configured:', process.env.STRIPE_WEBHOOK_SECRET.substring(0, 15) + '...');

    try {
      let event;

      // ✅ CRITICAL: Body must be raw Buffer for webhook verification
      if (Buffer.isBuffer(req.body)) {
        console.log('✅ Body is Buffer - constructing event...');
        event = stripe.webhooks.constructEvent(
          req.body,
          sig,
          process.env.STRIPE_WEBHOOK_SECRET
        );
      } else if (typeof req.body === 'string') {
        console.log('✅ Body is String - constructing event...');
        event = stripe.webhooks.constructEvent(
          req.body,
          sig,
          process.env.STRIPE_WEBHOOK_SECRET
        );
      } else {
        console.error('❌ Body is not raw - check middleware order!');
        console.error('Body type:', typeof req.body);
        console.error('Body sample:', JSON.stringify(req.body).substring(0, 200));
        return res.status(400).json({
          error: 'Webhook body must be raw. Check express middleware order.'
        });
      }

      console.log(`✅✅✅ WEBHOOK VERIFIED: ${event.type}`);
      console.log(`📦 Event ID: ${event.id}`);
      console.log(`📦 Event data:`, JSON.stringify(event.data.object, null, 2).substring(0, 500));

      await stripeService.handleWebhook(event);

      console.log('✅ Webhook processed successfully');
      console.log('═══════════════════════════════════════════════\n');
      res.json({ received: true });
    } catch (error) {
      console.error('❌❌❌ WEBHOOK ERROR:', error.message);
      console.error('❌ Full error:', error);
      console.error('═══════════════════════════════════════════════\n');
      res.status(400).json({ error: error.message });
    }
  }

  // Manual sync endpoint to update transaction from Stripe session
  async syncTransaction(req, res) {
    try {
      const { sessionId } = req.body;

      if (!sessionId) {
        return res.status(400).json({ error: 'sessionId is required' });
      }

      console.log('═══════════════════════════════════════════════');
      console.log('🔄 MANUAL SYNC STARTED');
      console.log('📋 Session ID:', sessionId);
      console.log('═══════════════════════════════════════════════');

      // Retrieve the full session from Stripe with ALL expansions
      const session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: [
          'payment_intent',
          'subscription',
          'subscription.latest_invoice',
          'subscription.latest_invoice.payment_intent',
          'line_items'
        ]
      });

      console.log('✅ Session retrieved from Stripe');
      console.log('📦 Session Details:');
      console.log('   - ID:', session.id);
      console.log('   - Mode:', session.mode);
      console.log('   - Payment Status:', session.payment_status);
      console.log('   - Amount Total:', session.amount_total);
      console.log('   - Currency:', session.currency);
      console.log('   - Customer:', session.customer);
      console.log('   - Payment Intent (direct):', session.payment_intent);
      console.log('   - Subscription:', session.subscription);

      // Find the transaction by sessionId
      const { data: transaction, error: findError } = await supabase
        .from('transactions')
        .select('*')
        .eq('sessionid', sessionId)
        .single();

      if (findError || !transaction) {
        console.error('❌ Transaction not found for session:', sessionId);
        return res.status(404).json({
          error: 'Transaction not found',
          sessionId: sessionId
        });
      }

      console.log('✅ Found transaction:', transaction.id);

      // Prepare update data
      const updateData = {
        status: session.payment_status === 'paid' ? 'completed' : session.payment_status
      };

      let paymentIntentId = null;
      let debugInfo = {
        attempts: [],
        sessionMode: session.mode,
        paymentStatus: session.payment_status
      };

      // METHOD 1: Check payment_intent directly on session
      if (session.payment_intent) {
        if (typeof session.payment_intent === 'string') {
          paymentIntentId = session.payment_intent;
          debugInfo.attempts.push({ method: 'session.payment_intent (string)', success: true, value: paymentIntentId });
          console.log('✅ Method 1: Found payment_intent on session (string):', paymentIntentId);
        } else if (session.payment_intent.id) {
          paymentIntentId = session.payment_intent.id;
          debugInfo.attempts.push({ method: 'session.payment_intent.id (object)', success: true, value: paymentIntentId });
          console.log('✅ Method 1: Found payment_intent on session (object):', paymentIntentId);
        }
      } else {
        debugInfo.attempts.push({ method: 'session.payment_intent', success: false, value: null });
        console.log('⚠️ Method 1: No payment_intent directly on session');
      }

      // METHOD 2: Get from subscription if mode is subscription
      if (!paymentIntentId && session.mode === 'subscription' && session.subscription) {
        console.log('🔍 Method 2: Trying to get from subscription...');

        try {
          const subscriptionId = typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription.id;

          console.log('   Subscription ID:', subscriptionId);

          // Retrieve subscription with expanded invoice and payment intent
          const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
            expand: ['latest_invoice', 'latest_invoice.payment_intent']
          });

          console.log('   Subscription status:', subscription.status);
          console.log('   Latest invoice:', subscription.latest_invoice?.id);

          if (subscription.latest_invoice) {
            const invoice = subscription.latest_invoice;
            console.log('   Invoice status:', invoice.status);
            console.log('   Invoice payment_intent:', invoice.payment_intent);

            if (invoice.payment_intent) {
              if (typeof invoice.payment_intent === 'string') {
                paymentIntentId = invoice.payment_intent;
                debugInfo.attempts.push({ method: 'subscription.latest_invoice.payment_intent (string)', success: true, value: paymentIntentId });
                console.log('✅ Method 2: Found payment_intent from invoice (string):', paymentIntentId);
              } else if (invoice.payment_intent.id) {
                paymentIntentId = invoice.payment_intent.id;
                debugInfo.attempts.push({ method: 'subscription.latest_invoice.payment_intent.id (object)', success: true, value: paymentIntentId });
                console.log('✅ Method 2: Found payment_intent from invoice (object):', paymentIntentId);
              }
            } else {
              debugInfo.attempts.push({ method: 'subscription.latest_invoice.payment_intent', success: false, value: null });
              console.log('⚠️ Method 2: Invoice has no payment_intent');
            }

            // Store invoice ID as well
            updateData.stripe_invoice_id = invoice.id;
          } else {
            debugInfo.attempts.push({ method: 'subscription.latest_invoice', success: false, value: null });
            console.log('⚠️ Method 2: Subscription has no latest_invoice');
          }
        } catch (subError) {
          debugInfo.attempts.push({ method: 'subscription retrieval', success: false, error: subError.message });
          console.error('❌ Method 2: Error fetching subscription:', subError.message);
        }
      }

      // METHOD 3: List payment intents for this customer and amount
      if (!paymentIntentId && session.customer) {
        console.log('🔍 Method 3: Searching payment intents by customer and amount...');

        try {
          const paymentIntents = await stripe.paymentIntents.list({
            customer: session.customer,
            limit: 10
          });

          console.log(`   Found ${paymentIntents.data.length} payment intents for customer`);

          // Find payment intent matching amount and recent timestamp
          const matchingPI = paymentIntents.data.find(pi => {
            const amountMatches = pi.amount === session.amount_total;
            const currencyMatches = pi.currency === session.currency;
            const isRecent = (Date.now() - pi.created * 1000) < 3600000; // within 1 hour
            const isSuccessful = pi.status === 'succeeded';

            console.log(`   Checking PI ${pi.id}: amount=${amountMatches}, currency=${currencyMatches}, recent=${isRecent}, success=${isSuccessful}`);

            return amountMatches && currencyMatches && isRecent && isSuccessful;
          });

          if (matchingPI) {
            paymentIntentId = matchingPI.id;
            debugInfo.attempts.push({ method: 'customer payment intents search', success: true, value: paymentIntentId });
            console.log('✅ Method 3: Found matching payment_intent:', paymentIntentId);
          } else {
            debugInfo.attempts.push({ method: 'customer payment intents search', success: false, value: 'no match' });
            console.log('⚠️ Method 3: No matching payment intent found');
          }
        } catch (piError) {
          debugInfo.attempts.push({ method: 'customer payment intents search', success: false, error: piError.message });
          console.error('❌ Method 3: Error searching payment intents:', piError.message);
        }
      }

      // Update payment intent ID if found
      if (paymentIntentId) {
        updateData.stripe_payment_intent_id = paymentIntentId;
        console.log('✅✅✅ PAYMENT INTENT FOUND:', paymentIntentId);
      } else {
        console.warn('⚠️⚠️⚠️ PAYMENT INTENT NOT FOUND - All methods failed');
        console.warn('This might be normal for subscription checkouts that are still processing');
      }

      // Update metadata with all Stripe IDs
      const metadata = transaction.metadata || {};
      metadata.stripePaymentIntentId = paymentIntentId || metadata.stripePaymentIntentId;
      metadata.stripeSubscriptionId = typeof session.subscription === 'string'
        ? session.subscription
        : (session.subscription?.id || metadata.stripeSubscriptionId);
      metadata.stripeCustomerId = session.customer || metadata.stripeCustomerId;
      metadata.manualSyncAt = new Date().toISOString();
      metadata.debugInfo = debugInfo;
      updateData.metadata = metadata;

      console.log('💾 Updating transaction with:', updateData);

      // Update transaction
      const { error: updateError } = await supabase
        .from('transactions')
        .update(updateData)
        .eq('id', transaction.id);

      if (updateError) {
        console.error('❌ Error updating transaction:', updateError);
        return res.status(500).json({ error: updateError.message });
      }

      console.log('✅ Transaction updated successfully');

      // Update subscription if applicable
      if (transaction.subscriptionid && session.payment_status === 'paid') {
        const stripeSubscriptionId = typeof session.subscription === 'string'
          ? session.subscription
          : session.subscription?.id;

        if (stripeSubscriptionId) {
          await supabase
            .from('subscriptions')
            .update({
              status: 'active',
              stripe_subscription_id: stripeSubscriptionId
            })
            .eq('id', transaction.subscriptionid);

          console.log('✅ Subscription updated to active');
        }
      }

      console.log('═══════════════════════════════════════════════');
      console.log('✅ SYNC COMPLETED SUCCESSFULLY');
      console.log('═══════════════════════════════════════════════\n');

      res.json({
        success: true,
        message: 'Transaction synced successfully',
        transaction: {
          id: transaction.id,
          status: updateData.status,
          stripe_payment_intent_id: paymentIntentId
        },
        debug: debugInfo
      });
    } catch (error) {
      console.error('❌❌❌ SYNC ERROR:', error);
      console.error('Full error:', error);
      res.status(500).json({
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }

  /**
   * Payment success page - Shows after successful Stripe checkout
   */
  async paymentSuccess(req, res) {
    const { session_id } = req.query;

    if (!session_id) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Payment Error</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
            .container { background: white; padding: 40px; border-radius: 8px; max-width: 500px; margin: 0 auto; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            h1 { color: #e74c3c; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>❌ Payment Error</h1>
            <p>No session ID provided.</p>
          </div>
        </body>
        </html>
      `);
    }

    try {
      // Retrieve session details
      const session = await stripe.checkout.sessions.retrieve(session_id);

      console.log('✅ Payment Success Page - Session:', session_id);
      console.log('✅ Payment Status:', session.payment_status);

      if (session.payment_status === 'paid') {
        return res.send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Payment Successful</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
                text-align: center;
                padding: 20px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                margin: 0;
              }
              .container {
                background: white;
                padding: 40px;
                border-radius: 12px;
                max-width: 500px;
                width: 100%;
                box-shadow: 0 10px 40px rgba(0,0,0,0.2);
              }
              h1 { color: #10b981; margin-bottom: 10px; font-size: 28px; }
              .checkmark { font-size: 64px; margin-bottom: 20px; }
              p { color: #64748b; line-height: 1.6; margin: 15px 0; }
              .info { background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0; }
              .info p { margin: 8px 0; font-size: 14px; }
              .close-btn {
                background: #10b981;
                color: white;
                border: none;
                padding: 12px 24px;
                border-radius: 6px;
                font-size: 16px;
                cursor: pointer;
                margin-top: 20px;
                font-weight: 600;
              }
              .close-btn:hover { background: #059669; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="checkmark">✅</div>
              <h1>Payment Successful!</h1>
              <p>Your subscription has been activated.</p>
              <div class="info">
                <p><strong>Session ID:</strong></p>
                <p style="font-size: 12px; word-break: break-all;">${session_id}</p>
              </div>
              <p style="color: #10b981; font-weight: 600;">You can now close this page and return to the app.</p>
              <button class="close-btn" onclick="window.close()">Close This Page</button>
            </div>
            <script>
              // Auto-close after 5 seconds
              setTimeout(() => {
                window.close();
                // If window.close() doesn't work (browser restriction), show message
                setTimeout(() => {
                  document.querySelector('.container').innerHTML =
                    '<h1 style="color: #10b981;">✅ Payment Complete</h1>' +
                    '<p>Please close this tab and return to your app.</p>';
                }, 500);
              }, 5000);
            </script>
          </body>
          </html>
        `);
      } else {
        return res.send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Payment Pending</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
              body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
              .container { background: white; padding: 40px; border-radius: 8px; max-width: 500px; margin: 0 auto; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
              h1 { color: #f59e0b; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>⏳ Payment Pending</h1>
              <p>Your payment is being processed.</p>
              <p>Status: ${session.payment_status}</p>
            </div>
          </body>
          </html>
        `);
      }
    } catch (error) {
      console.error('❌ Error retrieving session:', error);
      return res.status(500).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Error</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
            .container { background: white; padding: 40px; border-radius: 8px; max-width: 500px; margin: 0 auto; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            h1 { color: #e74c3c; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>❌ Error</h1>
            <p>Could not retrieve payment details.</p>
          </div>
        </body>
        </html>
      `);
    }
  }

  /**
   * Payment cancelled page - Shows when user cancels Stripe checkout
   */
  async paymentCancelled(req, res) {
    const { session_id } = req.query;

    console.log('⚠️ Payment Cancelled - Session:', session_id);

    return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Payment Cancelled</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
            text-align: center;
            padding: 20px;
            background: linear-gradient(135deg, #f59e0b 0%, #ef4444 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0;
          }
          .container {
            background: white;
            padding: 40px;
            border-radius: 12px;
            max-width: 500px;
            width: 100%;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
          }
          h1 { color: #f59e0b; margin-bottom: 10px; font-size: 28px; }
          .icon { font-size: 64px; margin-bottom: 20px; }
          p { color: #64748b; line-height: 1.6; margin: 15px 0; }
          .close-btn {
            background: #f59e0b;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 6px;
            font-size: 16px;
            cursor: pointer;
            margin-top: 20px;
            font-weight: 600;
          }
          .close-btn:hover { background: #d97706; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="icon">⚠️</div>
          <h1>Payment Cancelled</h1>
          <p>You cancelled the payment process.</p>
          <p>No charges have been made to your account.</p>
          <p style="color: #64748b; font-size: 14px; margin-top: 20px;">You can close this page and try again from the app.</p>
          <button class="close-btn" onclick="window.close()">Close This Page</button>
        </div>
        <script>
          // Auto-close after 3 seconds
          setTimeout(() => {
            window.close();
          }, 3000);
        </script>
      </body>
      </html>
    `);
  }
}

module.exports = new StripeController();