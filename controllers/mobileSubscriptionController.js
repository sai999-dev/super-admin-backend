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
      if (!baseUnits) {
        const n = (plan.plan_name || plan.name || '').toString().toLowerCase();
        if (n.includes('basic')) baseUnits = 3;
        else if (n.includes('premium')) baseUnits = 7;
        else if (n.includes('business')) baseUnits = 10;
        else baseUnits = 10;
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

      let result = {
        id: plan.id,
        name: canonicalName,
        description: plan.description || (plan.metadata && plan.metadata.description) || '',
        features,
        featuresText,
        pricePerUnit: toNumber(plan.price_per_unit ?? plan.base_price),
        baseUnits,
        minUnits: Math.max(1, minUnits),
        maxUnits: Math.max(1, maxUnits),
        billingCycle: plan.billing_cycle,
        trialDays: plan.trial_days,
        isActive: plan.is_active
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
        result.description = result.description || 'Starter plan for new agencies. Includes 3 service areas. Upgrade to Premium for 7 areas, priority notifications, phone support, and advanced analytics.';
        inject('Basic Plan — $99/month', [
          'Up to 3 service areas',
          'Unlimited lead access',
          'Email support',
          'Basic analytics',
          'Monthly area changes',
        ]);
      } else if ((!result.description || !result.featuresText) && (pn.includes('growth') || pn.includes('premium') || near(price, 199))) {
        result.description = result.description || 'Most popular plan. Includes 7 service areas. Upgrade to Business for 10 areas plus 24/7 support, premium analytics & reporting, CSV/Excel exports, and custom notifications.';
        inject('Premium Plan — $199/month (Most Popular)', [
          'Up to 7 service areas',
          'Priority lead notifications',
          'Phone & email support',
          'Advanced analytics',
          'Lead scoring system',
          'Monthly area changes',
        ]);
      } else if ((!result.description || !result.featuresText) && (pn.includes('professional') || pn.includes('business') || near(price, 299))) {
        result.description = result.description || 'Scale plan for growing agencies. Includes 10 service areas with top-tier support, analytics & reporting, exports, and custom notifications.';
        inject('Business Plan — $299/month', [
          'Up to 10 service areas',
          'Exclusive lead access',
          '24/7 priority support',
          'Premium analytics & reporting',
          'Lead export (CSV/Excel)',
          'Custom notifications',
          'Bi-weekly area changes',
        ]);
      }

      return result;
    });

    // Stable sort by base price if available
    plans.sort((a,b) => (a.pricePerUnit ?? 0) - (b.pricePerUnit ?? 0));

    res.status(200).json({
      success: true,
      data: { plans }
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
