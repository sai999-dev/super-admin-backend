/**
 * Mobile Subscription Controller
 * Handles agency subscription-related requests for the mobile app using Supabase
 */

const supabase = require('../config/supabaseClient');

const ACTIVE_SUBSCRIPTION_STATUSES = ['trial', 'active', 'suspended'];
const BILLING_ELIGIBLE_STATUSES = ['trial', 'active'];

const toNumber = (value, fallback = 0) => {
  const numeric = Number.parseFloat(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const safeRound = (value, digits = 2) => {
  const numeric = toNumber(value);
  const factor = 10 ** digits;
  return Math.round(numeric * factor) / factor;
};

const safeDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date;
};

const diffInDays = (laterDate, earlierDate = new Date()) => {
  const end = safeDate(laterDate);
  const start = safeDate(earlierDate);
  if (!end || !start) return null;
  const diffMs = end.getTime() - start.getTime();
  return diffMs >= 0 ? Math.ceil(diffMs / (1000 * 60 * 60 * 24)) : null;
};

const parseIntOr = (value, fallback = 0) => {
  const numeric = Number.parseInt(value, 10);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
};

const fetchSubscriptionRecord = async (agencyId, statuses) => {
  const response = await supabase
    .from('subscriptions')
    .select('*')
    .eq('agency_id', agencyId)
    .in('status', statuses)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (response.error) throw response.error;
  return response.data || null;
};

const fetchPlanById = async (planId) => {
  if (!planId) return null;
  const response = await supabase
    .from('subscription_plans')
    .select('*')
    .eq('id', planId)
    .maybeSingle();

  if (response.error) throw response.error;
  return response.data || null;
};

const fetchTerritoriesBySubscription = async (subscriptionId) => {
  if (!subscriptionId) return [];
  const response = await supabase
    .from('territories')
    .select('*')
    .eq('subscription_id', subscriptionId)
    .is('deleted_at', null)
    .order('priority', { ascending: false })
    .order('created_at', { ascending: true });

  if (response.error) throw response.error;
  return response.data || [];
};

const buildPlanLookup = async (planIds = []) => {
  if (!planIds.length) return new Map();
  const response = await supabase
    .from('subscription_plans')
    .select('*')
    .in('id', planIds);

  if (response.error) throw response.error;

  const map = new Map();
  (response.data || []).forEach((plan) => {
    map.set(plan.id, plan);
  });
  return map;
};

/**
 * GET /api/mobile/subscription/status
 * Get agency subscription status and territories
 */
exports.getSubscriptionStatus = async (req, res) => {
  try {
    const agencyId = req.agency.id;
    const subscription = await fetchSubscriptionRecord(agencyId, ACTIVE_SUBSCRIPTION_STATUSES);

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'No active subscription found for this agency'
      });
    }

    const [plan, territories] = await Promise.all([
      fetchPlanById(subscription.plan_id),
      fetchTerritoriesBySubscription(subscription.id)
    ]);

    const activeTerritories = territories.filter((territory) => territory.is_active !== false);
    const units = subscription.current_units ?? activeTerritories.length;
    const effectivePrice = subscription.custom_price_per_unit
      ?? plan?.price_per_unit
      ?? plan?.base_price
      ?? 0;
    const monthlyPrice = safeRound(effectivePrice * units);
    const daysUntilRenewal = diffInDays(subscription.next_billing_date);

    res.status(200).json({
      success: true,
      data: {
        subscription: {
          id: subscription.id,
          status: subscription.status,
          planName: plan?.name || plan?.plan_name || null,
          currentUnits: subscription.current_units ?? null,
          territoriesAssigned: activeTerritories.length,
          nextBillingDate: subscription.next_billing_date,
          trialEndDate: subscription.trial_end_date,
          autoRenew: subscription.auto_renew !== false,
          monthlyPrice,
          daysUntilRenewal
        },
        territories: territories.map((territory) => ({
          id: territory.id,
          type: territory.type,
          value: territory.value,
          state: territory.state,
          city: territory.city,
          zipcode: territory.zipcode,
          isActive: territory.is_active !== false,
          priority: territory.priority,
          addedDate: territory.created_at
        })),
        agency: {
          id: agencyId
        }
      }
    });
  } catch (error) {
    console.error('Error in getSubscriptionStatus:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
  }
};

/**
 * GET /api/mobile/subscription/plans
 * Get available subscription plans for agencies
 */
exports.getAvailablePlans = async (req, res) => {
  try {
    const { isActive = 'true' } = req.query;
    const activeFilter = isActive.toString().toLowerCase() === 'true';

    const response = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('is_active', activeFilter)
      // Order by safe columns that exist across environments
      .order('created_at', { ascending: true });

    if (response.error) throw response.error;

  const plans = (response.data || []).map((plan) => {
      // Normalize units for Flutter: ensure positive numbers
      let baseUnits = toNumber(plan.base_units ?? plan.min_units ?? 0);
      const pricePerUnit = toNumber(plan.price_per_unit ?? plan.base_price);
      
      // Override baseUnits based on price (correct values)
      // $99 = 3 zipcodes, $199 = 7 zipcodes, $299 = 10 zipcodes, $399 = 15 zipcodes
      if (pricePerUnit > 0) {
        if (Math.abs(pricePerUnit - 99) < 5) baseUnits = 3;  // $99 plan = 3 zipcodes
        else if (Math.abs(pricePerUnit - 199) < 5) baseUnits = 7;  // $199 plan = 7 zipcodes
        else if (Math.abs(pricePerUnit - 299) < 5) baseUnits = 10;  // $299 plan = 10 zipcodes
        else if (Math.abs(pricePerUnit - 399) < 5) baseUnits = 15;  // $399 plan = 15 zipcodes
      }
      
      // Fallback to name if price doesn't match
      if (!baseUnits || baseUnits === 0) {
        const n = (plan.plan_name || plan.name || '').toString().toLowerCase();
        if (n.includes('basic')) baseUnits = 3;
        else if (n.includes('premium')) baseUnits = 7;
        else if (n.includes('business')) baseUnits = 10;
        else if (n.includes('enterprise')) baseUnits = 15;
        else baseUnits = 3; // Default to 3 instead of 10
      }
      const minUnits = toNumber(plan.min_units ?? baseUnits);
      // If max_units is null/0, allow at least baseUnits; otherwise use provided
      const maxUnits = toNumber(plan.max_units ?? baseUnits);

      // Normalize features: array preferred, string -> split by newline, object kept
      let features = plan.features;
      let featuresText = '';
      if (Array.isArray(features)) {
        // keep array and also provide exact text form
        featuresText = features.join('\n');
      } else if (typeof features === 'string') {
        featuresText = features;
        features = features.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      } else if (features && typeof features === 'object') {
        // keep object form and provide key:value lines
        featuresText = Object.entries(features).map(([k,v]) => `${k}: ${v}`).join('\n');
      } else {
        features = [];
        featuresText = '';
      }

      // Canonicalize plan names for clients
      const rawName = (plan.name || plan.plan_name || '').toString();
      const rawLc = rawName.toLowerCase();
      const canonicalName = rawLc.includes('growth') ? 'Premium Plan'
        : rawLc.includes('professional') ? 'Business Plan'
        : rawLc.includes('premium') ? 'Premium Plan'
        : rawLc.includes('business') ? 'Business Plan'
        : rawLc.includes('basic') ? 'Basic Plan'
        : (rawName || 'Basic Plan');

      // Calculate monthly price (base_price is the monthly price)
      const monthlyPrice = toNumber(plan.base_price ?? plan.price_per_unit ?? 0);
      
      let result = {
        id: plan.id,
        name: canonicalName,
        plan_name: plan.plan_name || plan.name || canonicalName,
        description: plan.description || (plan.metadata && plan.metadata.description) || '',
        features,
        featuresText,
        // Pricing fields - Flutter compatible
        price: monthlyPrice,
        monthlyPrice: monthlyPrice,
        pricePerUnit: toNumber(plan.price_per_unit ?? plan.base_price),
        basePrice: monthlyPrice,
        // Units fields
        baseUnits,
        minUnits: Math.max(1, minUnits),
        maxUnits: Math.max(1, maxUnits),
        // Billing fields
        billingCycle: plan.billing_cycle || 'monthly',
        trialDays: plan.trial_days ?? plan.trial_period_days ?? 0,
        // Status fields
        isActive: plan.is_active !== undefined ? plan.is_active : true,
        is_active: plan.is_active !== undefined ? plan.is_active : true,
        // Additional fields
        unitType: plan.unit_type || 'zipcode',
        unit_type: plan.unit_type || 'zipcode',
        sortOrder: plan.sort_order ?? 0,
        sort_order: plan.sort_order ?? 0,
        // Metadata
        metadata: plan.metadata || {},
        created_at: plan.created_at,
        updated_at: plan.updated_at
      };

      // Fallback injection of exact text if DB doesn't carry description/features
      const pn = (plan.plan_name || plan.name || '').toString().toLowerCase();
      const price = result.pricePerUnit || 0;
      const near = (p, target, tol=25) => Math.abs((p||0) - target) <= tol;
      const inject = (desc, arr) => {
        result.description = result.description || desc;
        if (!Array.isArray(result.features) || result.features.length === 0) {
          result.features = arr.slice();
          result.featuresText = arr.join('\n');
        }
      };

      if ((!result.description || !result.featuresText) && (pn.includes('basic') || near(price, 99))) {
        result.description = result.description || 'Starter plan for new agencies. Includes 3 zipcodes. Upgrade to Premium for 7 zipcodes, priority notifications, phone support, and advanced analytics.';
        inject('Basic Plan — $99/month', [
          '3 zipcodes included',
          'Unlimited lead access',
          'Email support',
          'Basic analytics',
          'Monthly area changes',
        ]);
      } else if ((!result.description || !result.featuresText) && (pn.includes('growth') || pn.includes('premium') || near(price, 199))) {
        result.description = result.description || 'Most popular plan. Includes 7 zipcodes. Upgrade to Business for 10 zipcodes plus 24/7 support, premium analytics & reporting, CSV/Excel exports, and custom notifications.';
        inject('Premium Plan — $199/month (Most Popular)', [
          '7 zipcodes included',
          'Priority lead notifications',
          'Phone & email support',
          'Advanced analytics',
          'Lead scoring system',
          'Monthly area changes',
        ]);
      } else if ((!result.description || !result.featuresText) && (pn.includes('professional') || pn.includes('business') || near(price, 299))) {
        result.description = result.description || 'Scale plan for growing agencies. Includes 10 zipcodes with top-tier support, analytics & reporting, exports, and custom notifications.';
        inject('Business Plan — $299/month', [
          '10 zipcodes included',
          'Exclusive lead access',
          '24/7 priority support',
          'Premium analytics & reporting',
          'Lead export (CSV/Excel)',
          'Custom notifications',
          'Bi-weekly area changes',
        ]);
      } else if ((!result.description || !result.featuresText) && (pn.includes('enterprise') || near(price, 399))) {
        result.description = result.description || 'Enterprise plan for large agencies. Includes 15 zipcodes with white-glove onboarding, custom integrations, and 24/7 priority support.';
        inject('Enterprise Plan — $399/month', [
          '15 zipcodes included',
          'Everything in Business',
          'White-glove onboarding',
          'Custom integrations',
          '24/7 priority support',
        ]);
      }

      return result;
    });

    // Sort by sort_order first, then by price
    plans.sort((a, b) => {
      const orderA = a.sortOrder || a.sort_order || 999;
      const orderB = b.sortOrder || b.sort_order || 999;
      if (orderA !== orderB) return orderA - orderB;
      return (a.price || a.monthlyPrice || a.pricePerUnit || 0) - (b.price || b.monthlyPrice || b.pricePerUnit || 0);
    });

    res.status(200).json({
      success: true,
      data: { plans },
      message: 'Subscription plans retrieved successfully'
    });
  } catch (error) {
    console.error('Error in getAvailablePlans:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
  }
};

/**
 * GET /api/mobile/billing/history
 * Get billing history for the agency
 */
exports.getBillingHistory = async (req, res) => {
  try {
    const agencyId = req.agency.id;
    const page = parseIntOr(req.query.page, 1) || 1;
    const limit = parseIntOr(req.query.limit, 20) || 20;
    const offset = (page - 1) * limit;

    const response = await supabase
      .from('billing_history')
      .select('*', { count: 'exact' })
      .eq('agency_id', agencyId)
      .order('billing_date', { ascending: false })
      .range(offset, offset + limit - 1);

    if (response.error) throw response.error;

    const billingEntries = response.data || [];
    const planIds = Array.from(new Set(billingEntries.map((entry) => entry.plan_id).filter(Boolean)));
    const planLookup = await buildPlanLookup(planIds);

    const billingHistory = billingEntries.map((entry) => {
      const plan = planLookup.get(entry.plan_id) || {};
      return {
        id: entry.id,
        planName: plan.name || plan.plan_name || 'Unknown Plan',
        amount: safeRound(entry.total_amount ?? entry.amount),
        status: entry.status,
        billingDate: entry.billing_date,
        nextBillingDate: entry.due_date
      };
    });

    res.status(200).json({
      success: true,
      data: {
        billingHistory,
        pagination: {
          page,
          limit,
          total: response.count ?? billingHistory.length
        }
      }
    });
  } catch (error) {
    console.error('Error in getBillingHistory:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
  }
};

/**
 * GET /api/mobile/billing/upcoming
 * Get upcoming billing information
 */
exports.getUpcomingBilling = async (req, res) => {
  try {
    const agencyId = req.agency.id;
    const subscription = await fetchSubscriptionRecord(agencyId, BILLING_ELIGIBLE_STATUSES);

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'No active subscription found'
      });
    }

    const plan = await fetchPlanById(subscription.plan_id);
    const territoriesResp = await supabase
      .from('territories')
      .select('id', { count: 'exact', head: true })
      .eq('agency_id', agencyId)
      .is('deleted_at', null)
      .eq('is_active', true);

    if (territoriesResp.error) throw territoriesResp.error;

    const activeCount = territoriesResp.count || 0;
    const unitPrice = subscription.custom_price_per_unit
      ?? plan?.price_per_unit
      ?? plan?.base_price
      ?? 0;
    const nextBillingAmount = safeRound(unitPrice * activeCount);
    const daysUntilBilling = diffInDays(subscription.next_billing_date);

    res.status(200).json({
      success: true,
      data: {
        subscription: {
          id: subscription.id,
          planName: plan?.name || plan?.plan_name || null,
          nextBillingDate: subscription.next_billing_date,
          daysUntilBilling,
          nextBillingAmount,
          territoryCount: activeCount,
          unitPrice: safeRound(unitPrice),
          autoRenew: subscription.auto_renew !== false
        }
      }
    });
  } catch (error) {
    console.error('Error in getUpcomingBilling:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
  }
};

/**
 * POST /api/mobile/subscription/subscribe
 * Subscribe to a plan
 */
exports.subscribe = async (req, res) => {
  try {
    const agencyId = req.agency.id;
    const { plan_id, payment_method_id } = req.body;

    if (!plan_id) {
      return res.status(400).json({
        success: false,
        message: 'Plan ID is required'
      });
    }

    // Check if already has active subscription
    const existing = await fetchSubscriptionRecord(agencyId, ACTIVE_SUBSCRIPTION_STATUSES);
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'Agency already has an active subscription'
      });
    }

    // Get plan
    const plan = await fetchPlanById(plan_id);
    if (!plan || !plan.is_active) {
      return res.status(404).json({
        success: false,
        message: 'Plan not found or inactive'
      });
    }

    // Create subscription
    const now = new Date();
    const nextBilling = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const { data: subscription, error } = await supabase
      .from('subscriptions')
      .insert({
        agency_id: agencyId,
        plan_id,
        status: 'active',
        start_date: now.toISOString(),
        next_billing_date: nextBilling.toISOString(),
        auto_renew: true,
        metadata: { payment_method_id }
      })
      .select()
      .single();

    if (error) throw error;

    // Create transaction record
    await supabase.from('transactions').insert({
      agency_id: agencyId,
      subscription_id: subscription.id,
      amount: plan.base_price || plan.price_per_unit || 0,
      status: 'completed',
      transaction_date: now.toISOString()
    });

    res.status(201).json({
      success: true,
      subscription: {
        id: subscription.id,
        plan_id: subscription.plan_id,
        status: subscription.status,
        start_date: subscription.start_date,
        next_billing_date: subscription.next_billing_date
      }
    });
  } catch (error) {
    console.error('Error subscribing:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to subscribe',
      error: error.message
    });
  }
};

/**
 * PUT /api/mobile/subscription/upgrade
 * Upgrade to higher tier plan
 */
exports.upgrade = async (req, res) => {
  try {
    const agencyId = req.agency.id;
    const { plan_id, prorated = true } = req.body;

    if (!plan_id) {
      return res.status(400).json({
        success: false,
        message: 'Plan ID is required'
      });
    }

    const subscription = await fetchSubscriptionRecord(agencyId, ACTIVE_SUBSCRIPTION_STATUSES);
    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'No active subscription found'
      });
    }

    const currentPlan = await fetchPlanById(subscription.plan_id);
    const newPlan = await fetchPlanById(plan_id);

    if (!newPlan || !newPlan.is_active) {
      return res.status(404).json({
        success: false,
        message: 'New plan not found or inactive'
      });
    }

    // Validate it's a higher tier (check price)
    const currentPrice = currentPlan?.base_price || currentPlan?.price_per_unit || 0;
    const newPrice = newPlan.base_price || newPlan.price_per_unit || 0;

    if (newPrice <= currentPrice) {
      return res.status(400).json({
        success: false,
        message: 'New plan must be a higher tier than current plan'
      });
    }

    // Calculate prorated amount if requested
    let proratedAmount = 0;
    if (prorated) {
      const daysRemaining = diffInDays(subscription.next_billing_date);
      const dailyRate = (newPrice - currentPrice) / 30;
      proratedAmount = safeRound(dailyRate * (daysRemaining || 0));
    }

    // Update subscription
    const { data: updated, error } = await supabase
      .from('subscriptions')
      .update({
        plan_id,
        updated_at: new Date().toISOString()
      })
      .eq('id', subscription.id)
      .select()
      .single();

    if (error) throw error;

    // Create transaction for prorated difference
    if (proratedAmount > 0) {
      await supabase.from('transactions').insert({
        agency_id: agencyId,
        subscription_id: updated.id,
        amount: proratedAmount,
        status: 'completed',
        transaction_date: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      subscription: updated
    });
  } catch (error) {
    console.error('Error upgrading subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upgrade subscription',
      error: error.message
    });
  }
};

/**
 * PUT /api/mobile/subscription/downgrade
 * Downgrade to lower tier plan
 */
exports.downgrade = async (req, res) => {
  try {
    const agencyId = req.agency.id;
    const { plan_id, immediate = false } = req.body;

    if (!plan_id) {
      return res.status(400).json({
        success: false,
        message: 'Plan ID is required'
      });
    }

    const subscription = await fetchSubscriptionRecord(agencyId, ACTIVE_SUBSCRIPTION_STATUSES);
    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'No active subscription found'
      });
    }

    const currentPlan = await fetchPlanById(subscription.plan_id);
    const newPlan = await fetchPlanById(plan_id);

    if (!newPlan || !newPlan.is_active) {
      return res.status(404).json({
        success: false,
        message: 'New plan not found or inactive'
      });
    }

    // Validate it's a lower tier
    const currentPrice = currentPlan?.base_price || currentPlan?.price_per_unit || 0;
    const newPrice = newPlan.base_price || newPlan.price_per_unit || 0;

    if (newPrice >= currentPrice) {
      return res.status(400).json({
        success: false,
        message: 'New plan must be a lower tier than current plan'
      });
    }

    if (immediate) {
      // Downgrade immediately with prorated refund
      const daysRemaining = diffInDays(subscription.next_billing_date);
      const dailyRate = (currentPrice - newPrice) / 30;
      const refundAmount = safeRound(dailyRate * (daysRemaining || 0));

      const { data: updated, error } = await supabase
        .from('subscriptions')
        .update({
          plan_id,
          updated_at: new Date().toISOString()
        })
        .eq('id', subscription.id)
        .select()
        .single();

      if (error) throw error;

      // Create refund transaction
      if (refundAmount > 0) {
        await supabase.from('transactions').insert({
          agency_id: agencyId,
          subscription_id: updated.id,
          amount: -refundAmount,
          status: 'refunded',
          transaction_date: new Date().toISOString()
        });
      }

      return res.json({
        success: true,
        subscription: updated,
        refund_amount: refundAmount
      });
    } else {
      // Schedule downgrade at end of billing period
      const { data: updated, error } = await supabase
        .from('subscriptions')
        .update({
          plan_id,
          metadata: {
            ...(subscription.metadata || {}),
            downgrade_scheduled: true,
            scheduled_plan_id: plan_id
          },
          updated_at: new Date().toISOString()
        })
        .eq('id', subscription.id)
        .select()
        .single();

      if (error) throw error;

      return res.json({
        success: true,
        message: 'Downgrade scheduled for end of billing period',
        subscription: updated
      });
    }
  } catch (error) {
    console.error('Error downgrading subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to downgrade subscription',
      error: error.message
    });
  }
};

/**
 * POST /api/mobile/subscription/cancel
 * Cancel subscription
 */
exports.cancel = async (req, res) => {
  try {
    const agencyId = req.agency.id;
    const { reason, immediate = false } = req.body;

    const subscription = await fetchSubscriptionRecord(agencyId, ACTIVE_SUBSCRIPTION_STATUSES);
    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'No active subscription found'
      });
    }

    if (immediate) {
      // Cancel immediately
      const { data: updated, error } = await supabase
        .from('subscriptions')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancellation_reason: reason || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', subscription.id)
        .select()
        .single();

      if (error) throw error;

      return res.json({
        success: true,
        message: 'Subscription cancelled immediately',
        subscription: updated
      });
    } else {
      // Cancel at end of billing period
      const { data: updated, error } = await supabase
        .from('subscriptions')
        .update({
          status: 'cancelled',
          cancellation_reason: reason || null,
          metadata: {
            ...(subscription.metadata || {}),
            cancel_at_period_end: true
          },
          updated_at: new Date().toISOString()
        })
        .eq('id', subscription.id)
        .select()
        .single();

      if (error) throw error;

      // TODO: Send cancellation confirmation email

      return res.json({
        success: true,
        message: 'Subscription will be cancelled at end of billing period',
        subscription: updated
      });
    }
  } catch (error) {
    console.error('Error cancelling subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel subscription',
      error: error.message
    });
  }
};

/**
 * GET /api/mobile/subscription/invoices
 * Get billing history/invoices
 */
exports.getInvoices = async (req, res) => {
  try {
    const agencyId = req.agency.id;
    const page = parseIntOr(req.query.page, 1);
    const limit = parseIntOr(req.query.limit, 20);
    const offset = (page - 1) * limit;

    const { data: transactions, error, count } = await supabase
      .from('transactions')
      .select('*, subscriptions(plan_id)', { count: 'exact' })
      .eq('agency_id', agencyId)
      .order('transaction_date', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    // Get plan details
    const planIds = Array.from(new Set(
      transactions.map(t => t.subscriptions?.plan_id).filter(Boolean)
    ));
    const planLookup = await buildPlanLookup(planIds);

    const invoices = (transactions || []).map(t => ({
      id: t.id,
      amount: safeRound(t.amount),
      status: t.status,
      transaction_date: t.transaction_date,
      invoice_number: t.invoice_number || `INV-${t.id}`,
      plan_id: t.subscriptions?.plan_id,
      plan_name: planLookup.get(t.subscriptions?.plan_id)?.plan_name || 'Unknown'
    }));

    res.json({
      success: true,
      invoices,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching invoices:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch invoices',
      error: error.message
    });
  }
};

/**
 * PUT /api/mobile/payment-method
 * Update payment method
 */
exports.updatePaymentMethod = async (req, res) => {
  try {
    const agencyId = req.agency.id;
    const { payment_method_id } = req.body;

    if (!payment_method_id) {
      return res.status(400).json({
        success: false,
        message: 'Payment method ID is required'
      });
    }

    const subscription = await fetchSubscriptionRecord(agencyId, ACTIVE_SUBSCRIPTION_STATUSES);
    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'No active subscription found'
      });
    }

    const { data: updated, error } = await supabase
      .from('subscriptions')
      .update({
        metadata: {
          ...(subscription.metadata || {}),
          payment_method_id
        },
        updated_at: new Date().toISOString()
      })
      .eq('id', subscription.id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: 'Payment method updated successfully',
      subscription: updated
    });
  } catch (error) {
    console.error('Error updating payment method:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update payment method',
      error: error.message
    });
  }
};