const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

class StripeService {
  /**
   * Create Stripe customer for agency
   */
  async createStripeCustomer(agency) {
    const customer = await stripe.customers.create({
      email: agency.email,
      name: agency.name,
      metadata: { agencyId: agency.id }
    });

    await agency.update({ stripeCustomerId: customer.id });
    return customer;
  }

  /**
   * Create Stripe subscription
   */
  async createSubscription(subscriptionId) {
    const subscription = await Subscription.findByPk(subscriptionId, {
      include: [{ association: 'agency' }, { association: 'plan' }]
    });

    let stripeCustomerId = subscription.agency.stripeCustomerId;
    if (!stripeCustomerId) {
      const customer = await this.createStripeCustomer(subscription.agency);
      stripeCustomerId = customer.id;
    }

    const unitPrice = subscription.customPricePerUnit || subscription.plan.pricePerUnit;
    const quantity = subscription.unitsPurchased || 1;
    const amount = Math.round(unitPrice * quantity * 100);

    const stripeSubscription = await stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [{
        price_data: {
          currency: 'usd',
          unit_amount: amount,
          recurring: { interval: subscription.billingCycle }
        },
        quantity: 1
      }],
      trial_end: subscription.trialEnd ? Math.floor(subscription.trialEnd.getTime() / 1000) : undefined,
      metadata: {
        subscriptionId: subscription.id,
        agencyId: subscription.agencyId,
        planId: subscription.planId
      }
    });

    await subscription.update({
      stripeSubscriptionId: stripeSubscription.id,
      status: 'active',
      currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000),
      currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
      nextBillingDate: new Date(stripeSubscription.current_period_end * 1000)
    });

    return stripeSubscription;
  }

  /**
   * Update subscription (units/price changes)
   */
  async updateSubscription(subscriptionId, updateData) {
    const subscription = await Subscription.findByPk(subscriptionId, {
      include: [{ association: 'plan' }]
    });

    if (!subscription.stripeSubscriptionId) {
      throw new Error('Stripe subscription not found');
    }

    const stripeSubscription = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);
    const unitPrice = updateData.customPricePerUnit || subscription.plan.pricePerUnit;
    const quantity = updateData.unitsPurchased || subscription.unitsPurchased || 1;
    const amount = Math.round(unitPrice * quantity * 100);

    await stripe.subscriptionItems.update(stripeSubscription.items.data[0].id, {
      price_data: {
        currency: 'usd',
        unit_amount: amount,
        recurring: { interval: subscription.billingCycle }
      }
    });

    await subscription.update(updateData);
    return subscription;
  }

  /**
   * Cancel Stripe subscription
   */
  async cancelSubscription(subscriptionId, immediate = false) {
    const subscription = await Subscription.findByPk(subscriptionId);

    if (!subscription.stripeSubscriptionId) {
      throw new Error('Stripe subscription not found');
    }

    await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: !immediate
    });

    await subscription.update({
      status: immediate ? 'cancelled' : 'cancelling',
      endDate: immediate ? new Date() : subscription.currentPeriodEnd
    });
  }

  /**
   * Handle Stripe webhooks
   */
  async handleWebhook(event) {
    const { type, data } = event;

    console.log(`🔔 Webhook event: ${type}`);

    try {
      switch (type) {
        case 'checkout.session.completed':
          await this.handleCheckoutSessionCompleted(data.object);
          break;

        case 'charge.succeeded':
          await this.handleChargeSucceeded(data.object);
          break;

        case 'invoice.payment_succeeded':
          await this.handleInvoicePaymentSucceeded(data.object);
          break;

        case 'customer.subscription.updated':
          await this.handleSubscriptionUpdated(data.object);
          break;

        case 'customer.subscription.deleted':
          await this.handleSubscriptionDeleted(data.object);
          break;

        case 'invoice.payment_failed':
          await this.handlePaymentFailed(data.object);
          break;

        default:
          console.log(`⚠️ Unhandled event type: ${type}`);
      }

      console.log(`✅ Webhook ${type} processed successfully`);
    } catch (error) {
      console.error(`❌ Webhook error for ${type}:`, error);
      throw error;
    }
  }

  /**
   * Handle subscription updated webhook
   */
  async handleSubscriptionUpdated(stripeSubscription) {
    const { data: subscription, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('stripe_subscription_id', stripeSubscription.id)
      .single();

    if (error || !subscription) return;

    await supabase
      .from('subscriptions')
      .update({
        status: stripeSubscription.status,
        current_period_start: new Date(stripeSubscription.current_period_start * 1000).toISOString(),
        current_period_end: new Date(stripeSubscription.current_period_end * 1000).toISOString(),
        next_billing_date: new Date(stripeSubscription.current_period_end * 1000).toISOString()
      })
      .eq('id', subscription.id);
  }

  /**
   * Handle subscription deleted webhook
   */
  async handleSubscriptionDeleted(stripeSubscription) {
    const { data: subscription, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('stripe_subscription_id', stripeSubscription.id)
      .single();

    if (error || !subscription) return;

    await supabase
      .from('subscriptions')
      .update({
        status: 'cancelled',
        end_date: new Date().toISOString()
      })
      .eq('id', subscription.id);
  }

  /**
   * Handle payment succeeded webhook
   */
  async handlePaymentSucceeded(invoice) {
    const { data: subscription, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('stripe_subscription_id', invoice.subscription)
      .single();

    if (error || !subscription) return;

    await supabase
      .from('subscriptions')
      .update({
        last_billing_date: new Date().toISOString(),
        next_billing_date: new Date((invoice.period_end + 86400) * 1000).toISOString()
      })
      .eq('id', subscription.id);
  }

  /**
   * Handle payment failed webhook
   */
  async handlePaymentFailed(invoice) {
    const { data: subscription, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('stripe_subscription_id', invoice.subscription)
      .single();

    if (error || !subscription) return;

    const failedAttempts = (subscription.metadata?.failedAttempts || 0) + 1;

    await supabase
      .from('subscriptions')
      .update({
        status: 'payment_failed',
        metadata: { ...subscription.metadata, failedAttempts }
      })
      .eq('id', subscription.id);
  }

  /**
   * Handle checkout session completed webhook
   * This is the primary event for subscription checkout sessions
   */
  async handleCheckoutSessionCompleted(session) {
    console.log('✅ Checkout session completed:', session.id);
    console.log('Payment Status:', session.payment_status);
    console.log('Payment Intent:', session.payment_intent);
    console.log('Subscription:', session.subscription);

    // Retrieve the full session object with expansion to get payment_intent
    let fullSession = session;
    try {
      if (!session.payment_intent && session.id) {
        console.log('🔍 Retrieving full session object with expansion...');
        fullSession = await stripe.checkout.sessions.retrieve(session.id, {
          expand: ['payment_intent', 'subscription.latest_invoice.payment_intent']
        });
        console.log('✅ Retrieved session - Payment Intent:', fullSession.payment_intent);
      }
    } catch (retrieveError) {
      console.warn('⚠️ Could not retrieve full session:', retrieveError.message);
      // Continue with the original session object
    }

    // Find transaction by sessionid (this is the key identifier we stored)
    const { data: transaction, error: findError } = await supabase
      .from('transactions')
      .select('*')
      .eq('sessionid', fullSession.id)
      .single();

    if (findError || !transaction) {
      console.error('❌ Transaction not found for session:', fullSession.id);
      console.error('Find error:', findError);
      return;
    }

    console.log('✅ Found transaction:', transaction.id);
    console.log('Current transaction status:', transaction.status);

    // Only update to completed if payment was successful
    if (fullSession.payment_status === 'paid') {
      const updateData = {
        status: 'completed'
      };

      // Get payment intent ID - try multiple sources
      let paymentIntentId = fullSession.payment_intent;
      
      // Extract payment intent ID if it's an object
      if (paymentIntentId && typeof paymentIntentId === 'object') {
        paymentIntentId = paymentIntentId.id;
      }
      
      // If payment intent is not directly on session, try to get it from subscription's latest invoice
      if (!paymentIntentId && fullSession.subscription) {
        try {
          console.log('🔍 Payment intent not on session, fetching from subscription...');
          const subscriptionId = typeof fullSession.subscription === 'string' 
            ? fullSession.subscription 
            : fullSession.subscription.id;
          
          const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
            expand: ['latest_invoice.payment_intent']
          });
          
          if (subscription.latest_invoice) {
            const invoice = typeof subscription.latest_invoice === 'string' 
              ? await stripe.invoices.retrieve(subscription.latest_invoice, {
                  expand: ['payment_intent']
                })
              : subscription.latest_invoice;
            
            if (invoice.payment_intent) {
              paymentIntentId = typeof invoice.payment_intent === 'string' 
                ? invoice.payment_intent 
                : invoice.payment_intent.id;
              console.log('✅ Found payment intent from subscription invoice:', paymentIntentId);
            }
          }
        } catch (subError) {
          console.warn('⚠️ Could not fetch payment intent from subscription:', subError.message);
        }
      }

      // Update payment intent ID if we found it
      if (paymentIntentId) {
        updateData.stripe_payment_intent_id = paymentIntentId;
        console.log('✅ Setting stripe_payment_intent_id:', paymentIntentId);
      } else {
        console.warn('⚠️ Payment intent ID not found in session or subscription - will be set by invoice.payment_succeeded webhook');
      }

      // Update metadata with payment completion info
      const metadata = transaction.metadata || {};
      metadata.stripePaymentIntentId = paymentIntentId || metadata.stripePaymentIntentId;
      metadata.stripeSubscriptionId = typeof fullSession.subscription === 'string' 
        ? fullSession.subscription 
        : (fullSession.subscription?.id || metadata.stripeSubscriptionId);
      metadata.paymentCompletedAt = new Date().toISOString();
      updateData.metadata = metadata;

      const { error } = await supabase
        .from('transactions')
        .update(updateData)
        .eq('id', transaction.id);

      if (error) {
        console.error('❌ Error updating transaction:', error);
        console.error('Error details:', JSON.stringify(error, null, 2));
        return;
      }

      console.log('✅ Transaction updated to completed:', transaction.id);
      if (paymentIntentId) {
        console.log('✅ Payment intent ID saved:', paymentIntentId);
      }

      // Update subscription status if transaction has subscription ID
      if (transaction.subscriptionid) {
        const stripeSubscriptionId = typeof fullSession.subscription === 'string' 
          ? fullSession.subscription 
          : fullSession.subscription?.id;
        
        const { error: subError } = await supabase
          .from('subscriptions')
          .update({
            status: 'active',
            stripe_subscription_id: stripeSubscriptionId || null
          })
          .eq('id', transaction.subscriptionid);

        if (subError) {
          console.error('❌ Error updating subscription:', subError);
        } else {
          console.log('✅ Subscription updated to active');
        }
      }
    } else {
      console.log(`⚠️ Payment status is ${fullSession.payment_status}, not updating transaction`);
    }
  }

  /**
   * Handle charge succeeded webhook
   */
  async handleChargeSucceeded(charge) {
    console.log('✅ Charge succeeded:', charge.id);
    console.log('Payment Intent:', charge.payment_intent);

    // Find transaction by stripe_payment_intent_id
    let { data: transaction, error: findError } = await supabase
      .from('transactions')
      .select('*')
      .eq('stripe_payment_intent_id', charge.payment_intent)
      .single();

    // If not found by payment intent, try to find by charge ID
    if (findError || !transaction) {
      console.log('⚠️ Transaction not found by payment_intent, trying charge_id...');
      const { data: txByCharge, error: chargeError } = await supabase
        .from('transactions')
        .select('*')
        .eq('stripe_charge_id', charge.id)
        .single();
      
      if (!chargeError && txByCharge) {
        transaction = txByCharge;
        findError = null;
      }
    }

    if (findError || !transaction) {
      console.error('❌ Transaction not found for payment_intent:', charge.payment_intent);
      return;
    }

    // Only update if status is still pending
    if (transaction.status === 'pending') {
      const updateData = {
        status: 'completed',
        stripe_charge_id: charge.id,
        stripe_payment_intent_id: charge.payment_intent || transaction.stripe_payment_intent_id
      };

      // Update metadata
      const metadata = transaction.metadata || {};
      metadata.stripeChargeId = charge.id;
      metadata.paymentCompletedAt = new Date().toISOString();
      updateData.metadata = metadata;

      const { error } = await supabase
        .from('transactions')
        .update(updateData)
        .eq('id', transaction.id);

      if (error) {
        console.error('❌ Error updating transaction:', error);
        return;
      }

      console.log('✅ Transaction updated to completed:', transaction.id);
    } else {
      console.log(`ℹ️ Transaction ${transaction.id} already has status: ${transaction.status}`);
    }
  }

  /**
   * Handle invoice payment succeeded webhook
   */
  async handleInvoicePaymentSucceeded(invoice) {
    console.log('═══════════════════════════════════════════════');
    console.log('✅✅✅ INVOICE PAYMENT SUCCEEDED WEBHOOK');
    console.log('═══════════════════════════════════════════════');
    console.log('📋 Invoice ID:', invoice.id);
    console.log('📋 Payment Intent:', invoice.payment_intent);
    console.log('📋 Subscription:', invoice.subscription);
    console.log('📋 Amount Paid:', invoice.amount_paid / 100, invoice.currency?.toUpperCase());
    console.log('📋 Customer:', invoice.customer);

    // Extract payment intent ID
    const paymentIntentId = typeof invoice.payment_intent === 'string'
      ? invoice.payment_intent
      : invoice.payment_intent?.id;

    console.log('💳 Extracted Payment Intent ID:', paymentIntentId);

    // Find transaction by stripe_payment_intent_id first
    let { data: transaction, error: findError } = await supabase
      .from('transactions')
      .select('*')
      .eq('stripe_payment_intent_id', paymentIntentId)
      .single();

    // If not found by payment intent, try to find by Stripe subscription ID (match our internal subscription)
    if ((findError || !transaction) && invoice.subscription) {
      console.log('⚠️ Transaction not found by payment_intent, trying to find by Stripe subscription ID...');
      
      // First, find our internal subscription that matches the Stripe subscription ID
      let { data: internalSubscription, error: subFindError } = await supabase
        .from('subscriptions')
        .select('id')
        .eq('stripe_subscription_id', invoice.subscription)
        .single();
      
      // If not found, try to update a subscription that might match (recently created, pending status)
      if (subFindError || !internalSubscription) {
        console.log('⚠️ Subscription not found by stripe_subscription_id, trying to find and update pending subscription...');
        // Get all pending subscriptions created in the last hour
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const { data: pendingSubs, error: pendingError } = await supabase
          .from('subscriptions')
          .select('id')
          .eq('status', 'pending')
          .gte('created_at', oneHourAgo)
          .order('created_at', { ascending: false })
          .limit(5);
        
        if (!pendingError && pendingSubs && pendingSubs.length > 0) {
          // Update the first pending subscription with the Stripe subscription ID
          // This assumes the most recent pending subscription is the one we want
          const { data: updatedSub, error: updateError } = await supabase
            .from('subscriptions')
            .update({ stripe_subscription_id: invoice.subscription })
            .eq('id', pendingSubs[0].id)
            .select()
            .single();
          
          if (!updateError && updatedSub) {
            internalSubscription = updatedSub;
            subFindError = null;
            console.log('✅ Updated subscription with Stripe subscription ID:', updatedSub.id);
          }
        }
      }
      
      if (!subFindError && internalSubscription) {
        // Now find transaction by our internal subscription ID
      const { data: txBySub, error: subError } = await supabase
        .from('transactions')
        .select('*')
          .eq('subscriptionid', internalSubscription.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      if (!subError && txBySub) {
        transaction = txBySub;
        findError = null;
          console.log('✅ Found transaction by internal subscription ID');
        }
      }
    }

    // If still not found, try to find by any pending transaction and check metadata manually
    if ((findError || !transaction) && invoice.subscription) {
      console.log('⚠️ Trying to find transaction by checking all pending transactions...');
      const { data: allPending, error: allError } = await supabase
        .from('transactions')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(10);
      
      if (!allError && allPending) {
        // Find transaction where metadata.stripeSubscriptionId matches
        const matchingTx = allPending.find(tx => {
          const metadata = tx.metadata || {};
          return metadata.stripeSubscriptionId === invoice.subscription;
        });
        
        if (matchingTx) {
          transaction = matchingTx;
          findError = null;
          console.log('✅ Found transaction by metadata subscription ID');
        }
      }
    }

    if (findError || !transaction) {
      console.error('❌❌❌ TRANSACTION NOT FOUND');
      console.error('❌ Invoice ID:', invoice.id);
      console.error('❌ Payment Intent:', paymentIntentId);
      console.error('❌ Stripe Subscription:', invoice.subscription);
      console.error('❌ Find Error:', findError);
      console.log('═══════════════════════════════════════════════\n');
      return;
    }

    console.log('✅✅✅ TRANSACTION FOUND!');
    console.log('📝 Transaction ID:', transaction.id);
    console.log('📝 Current Status:', transaction.status);
    console.log('📝 Session ID:', transaction.sessionid);
    console.log('📝 Current Payment Intent:', transaction.stripe_payment_intent_id);
    console.log('📝 Current Invoice:', transaction.stripe_invoice_id);

    // Update transaction with payment intent ID (even if already completed)
    const updateData = {
      stripe_invoice_id: invoice.id,
      stripe_payment_intent_id: paymentIntentId || transaction.stripe_payment_intent_id
    };

    // Only update status if still pending
    if (transaction.status === 'pending') {
      updateData.status = 'completed';
    }

      // Update metadata
      const metadata = transaction.metadata || {};
      metadata.stripeInvoiceId = invoice.id;
      metadata.stripeSubscriptionId = invoice.subscription || metadata.stripeSubscriptionId;
      metadata.paymentCompletedAt = new Date().toISOString();
      updateData.metadata = metadata;

      // Update transaction
      console.log('💾 Updating transaction with data:', JSON.stringify(updateData, null, 2));

      const { error: txError } = await supabase
        .from('transactions')
        .update(updateData)
        .eq('id', transaction.id);

      if (txError) {
        console.error('❌❌❌ ERROR UPDATING TRANSACTION');
        console.error('❌ Error:', txError);
        console.log('═══════════════════════════════════════════════\n');
        return;
      }

    console.log('✅✅✅ TRANSACTION UPDATED SUCCESSFULLY!');
    console.log('✅ Transaction ID:', transaction.id);
    console.log('✅ Payment Intent ID:', paymentIntentId);
    console.log('✅ Invoice ID:', invoice.id);
    if (transaction.status === 'pending') {
      console.log('✅ Status changed from pending → completed');
    }

    // Update subscription if transaction has subscription ID
    if (transaction.subscriptionid) {
      const { error: subError } = await supabase
        .from('subscriptions')
        .update({
          status: 'active',
          stripe_subscription_id: invoice.subscription || null,
          current_period_start: new Date(invoice.period_start * 1000).toISOString(),
          current_period_end: new Date(invoice.period_end * 1000).toISOString()
        })
        .eq('id', transaction.subscriptionid);

      if (subError) {
        console.error('❌ Error updating subscription:', subError);
      } else {
        console.log('✅ Subscription updated to active');
      }
    }

    console.log('═══════════════════════════════════════════════');
    console.log('✅ INVOICE PAYMENT WEBHOOK COMPLETED');
    console.log('═══════════════════════════════════════════════\n');
  }
}

module.exports = new StripeService();