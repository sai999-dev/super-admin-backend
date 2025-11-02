/**
 * Mobile Subscription Purchase Routes
 * Handles subscription purchases from mobile app with payment processing
 */

const express = require('express');
const supabase = require('../config/supabaseClient');
const { Subscription } = require('../models');
const router = express.Router();
const { authenticateAgency } = require('../middleware/agencyAuth');

/**
 * POST /api/mobile/subscription/purchase
 * Purchase a subscription plan (with fake/test payment)
 * This endpoint creates subscriptions in both 'subscriptions' and 'agency_subscriptions' tables
 */
router.post('/subscription/purchase', authenticateAgency, async (req, res) => {
  try {
    const agencyId = req.agency.id;
    const {
      plan_id,
      payment_method_id, // fake/test card ID
      zipcodes = [],
      cities = []
    } = req.body;

    // Validation
    if (!plan_id) {
      return res.status(400).json({
        success: false,
        message: 'Plan ID is required'
      });
    }

    // Verify plan exists
    const { data: plan, error: planError } = await supabase
      .from('subscription_plans')
      .select('id, name, plan_name, price_per_unit, base_price')
      .eq('id', plan_id)
      .eq('is_active', true)
      .single();

    if (planError || !plan) {
      return res.status(404).json({
        success: false,
        message: 'Subscription plan not found or inactive'
      });
    }

    // Get agency info to normalize ID and verify existence
    const { data: agency, error: agencyError } = await supabase
      .from('agencies')
      .select('agency_id, id')
      .or(`id.eq.${agencyId},agency_id.eq.${agencyId}`)
      .maybeSingle();

    if (agencyError || !agency) {
      return res.status(404).json({
        success: false,
        message: 'Agency not found. Cannot create subscription for non-existent agency.'
      });
    }

    const normalizedAgencyId = agency.agency_id || agency.id;
    
    if (!normalizedAgencyId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid agency ID format'
      });
    }

    const now = new Date();
    const trialEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 days
    const nextBilling = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    // Create subscription in 'subscriptions' table
    const { data: subscriptionData, error: subError } = await supabase
      .from('subscriptions')
      .insert([
        {
          agency_id: normalizedAgencyId,
          plan_id: plan_id,
          status: 'active',
          start_date: now.toISOString(),
          trial_end_date: trialEnd.toISOString(),
          next_billing_date: nextBilling.toISOString(),
          auto_renew: true,
          metadata: { payment_method_id, purchased_via: 'mobile_app' }
        }
      ])
      .select()
      .single();

    if (subError) {
      console.error('Error creating subscription:', subError);
      return res.status(500).json({
        success: false,
        message: 'Failed to create subscription',
        error: subError.message
      });
    }

    // Mirror to agency_subscriptions for admin portal visibility
    const { data: agencySubData, error: agencySubError } = await supabase
      .from('agency_subscriptions')
      .insert([
        {
          agency_id: normalizedAgencyId,
          plan_id: plan_id,
          status: 'active',
          start_date: now.toISOString(),
          end_date: nextBilling.toISOString(),
          trial_end_date: trialEnd.toISOString(),
          auto_renew: true,
          monthly_payment: plan.base_price,
          zipcodes: Array.isArray(zipcodes) ? zipcodes : [],
          cities: Array.isArray(cities) ? cities : []
        }
      ])
      .select(`
        *,
        agencies!inner(agency_id, agency_name, business_name, name),
        subscription_plans!inner(plan_name, base_price)
      `)
      .single();

    if (agencySubError) {
      console.warn('Warning: Failed to create agency_subscriptions entry:', agencySubError.message);
      // Don't fail the request, subscription was created
    }

    // Mirror into Sequelize-managed subscriptions so admin APIs stay in sync
    try {
      if (Subscription) {
        const effectivePlanPrice = plan.price_per_unit ?? plan.base_price ?? 0;

        await Subscription.upsert({
          id: subscriptionData.id,
          agencyId: normalizedAgencyId,
          planId: plan_id,
          status: subscriptionData.status || 'active',
          currentUnits: subscriptionData.current_units || (Array.isArray(zipcodes) ? zipcodes.length : 0),
          maxUnits: subscriptionData.max_units || null,
          customPricePerUnit: subscriptionData.custom_price_per_unit || null,
          billingCycle: subscriptionData.billing_cycle || 'monthly',
          startDate: subscriptionData.start_date ? new Date(subscriptionData.start_date) : now,
          trialEndDate: subscriptionData.trial_end_date ? new Date(subscriptionData.trial_end_date) : trialEnd,
          nextBillingDate: subscriptionData.next_billing_date ? new Date(subscriptionData.next_billing_date) : nextBilling,
          autoRenew: subscriptionData.auto_renew ?? true,
          metadata: {
            ...subscriptionData.metadata,
            payment_method_id,
            purchased_via: 'mobile_app',
            supabase_synced_at: new Date().toISOString()
          }
        });

        // Ensure current_units reflects active territories when provided
        if (Array.isArray(zipcodes) && zipcodes.length > 0) {
          await Subscription.update(
            { currentUnits: zipcodes.length },
            { where: { id: subscriptionData.id, currentUnits: 0 } }
          );
        }
      }
    } catch (syncError) {
      console.warn('Warning: Failed to sync subscription into Sequelize:', syncError.message);
    }

    // Create payment record (for billing history)
    try {
      await supabase
        .from('payments')
        .insert([
          {
            agency_id: normalizedAgencyId,
            subscription_id: subscriptionData.id,
            amount: plan.base_price,
            payment_method: payment_method_id ? 'card' : 'test',
            status: 'completed',
            payment_date: now.toISOString(),
            transaction_id: `TXN-${Date.now()}-${normalizedAgencyId}`,
            metadata: { payment_method_id, plan_name: plan.plan_name }
          }
        ]);
    } catch (paymentError) {
      console.warn('Warning: Failed to create payment record:', paymentError.message);
    }

    res.status(201).json({
      success: true,
      message: 'Subscription purchased successfully',
      data: {
        subscription: {
          id: subscriptionData.id,
          plan_name: plan.plan_name || plan.name,
          status: subscriptionData.status,
          start_date: subscriptionData.start_date,
          trial_end_date: subscriptionData.trial_end_date,
          next_billing_date: subscriptionData.next_billing_date,
          monthly_payment: plan.base_price ?? plan.price_per_unit ?? 0
        }
      }
    });

  } catch (error) {
    console.error('Error in purchase subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to purchase subscription',
      error: error.message
    });
  }
});

module.exports = router;

/**
 * DEV-ONLY: Public test checkout to unblock Flutter during onboarding
 * Enable by setting ALLOW_PUBLIC_TEST_CHECKOUT=true
 * POST /api/mobile/subscription/test-checkout
 * body: { agency_id, plan_id, zipcodes?, cities? }
 */
if (process.env.ALLOW_PUBLIC_TEST_CHECKOUT === 'true') {
  router.post('/subscription/test-checkout', async (req, res) => {
    try {
      const { agency_id, plan_id, zipcodes = [], cities = [] } = req.body || {};
      if (!agency_id || !plan_id) {
        return res.status(400).json({ success: false, message: 'agency_id and plan_id are required' });
      }

      // Verify plan exists and active
      const { data: plan, error: planError } = await supabase
        .from('subscription_plans')
        .select('id, plan_name, base_price, price_per_unit, is_active')
        .eq('id', plan_id)
        .maybeSingle();
      if (planError || !plan || plan.is_active === false) {
        return res.status(404).json({ success: false, message: 'Subscription plan not found or inactive' });
      }

      // Resolve agency id
      const { data: agency, error: agencyError } = await supabase
        .from('agencies')
        .select('agency_id, id')
        .or(`id.eq.${agency_id},agency_id.eq.${agency_id}`)
        .maybeSingle();
      if (agencyError || !agency) {
        return res.status(404).json({ success: false, message: 'Agency not found' });
      }
      const normalizedAgencyId = agency.agency_id || agency.id;

      const now = new Date();
      const trialEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
      const nextBilling = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      // Create subscription
      const { data: subscriptionData, error: subError } = await supabase
        .from('subscriptions')
        .insert([
          {
            agency_id: normalizedAgencyId,
            plan_id: plan_id,
            status: 'active',
            start_date: now.toISOString(),
            trial_end_date: trialEnd.toISOString(),
            next_billing_date: nextBilling.toISOString(),
            auto_renew: true,
            metadata: { payment_method_id: 'test', purchased_via: 'public_test_checkout' }
          }
        ])
        .select('id, status, start_date, trial_end_date, next_billing_date')
        .single();
      if (subError) {
        return res.status(500).json({ success: false, message: 'Failed to create subscription', error: subError.message });
      }

      // Mirror into agency_subscriptions
      await supabase
        .from('agency_subscriptions')
        .insert([
          {
            agency_id: normalizedAgencyId,
            plan_id: plan_id,
            status: 'active',
            start_date: now.toISOString(),
            end_date: nextBilling.toISOString(),
            trial_end_date: trialEnd.toISOString(),
            auto_renew: true,
            monthly_payment: plan.base_price ?? plan.price_per_unit ?? 0,
            zipcodes: Array.isArray(zipcodes) ? zipcodes : [],
            cities: Array.isArray(cities) ? cities : []
          }
        ]);

      // Payment record
      await supabase
        .from('payments')
        .insert([
          {
            agency_id: normalizedAgencyId,
            subscription_id: subscriptionData.id,
            amount: plan.base_price ?? plan.price_per_unit ?? 0,
            payment_method: 'test',
            status: 'completed',
            payment_date: now.toISOString(),
            transaction_id: `TXN-${Date.now()}-${normalizedAgencyId}`,
            metadata: { plan_name: plan.plan_name }
          }
        ]);

      return res.status(201).json({
        success: true,
        message: 'Test checkout successful',
        data: {
          subscription: {
            id: subscriptionData.id,
            plan_name: plan.plan_name,
            status: subscriptionData.status,
            start_date: subscriptionData.start_date,
            trial_end_date: subscriptionData.trial_end_date,
            next_billing_date: subscriptionData.next_billing_date,
            monthly_payment: plan.base_price ?? plan.price_per_unit ?? 0
          }
        }
      });
    } catch (error) {
      console.error('Error in public test checkout:', error);
      return res.status(500).json({ success: false, message: 'Failed test checkout', error: error.message });
    }
  });
}

