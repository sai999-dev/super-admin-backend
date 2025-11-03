const express = require('express');
const router = express.Router();
const supabase = require('../config/supabaseClient');
const { authenticateAdmin } = require('../middleware/adminAuth');

// Apply admin authentication to all routes
router.use(authenticateAdmin);

const SORT_FIELD_MAP = {
  created_at: 'created_at',
  updated_at: 'updated_at',
  start_date: 'start_date',
  end_date: 'end_date',
  renewal_date: 'end_date',
  monthly_payment: 'monthly_payment',
  status: 'status'
};

const DEFAULT_SUBSCRIPTION_METRICS = () => ({
  territoryCount: 0,
  leadCount: 0,
  convertedLeadCount: 0,
  contactedLeadCount: 0,
  responseTimeTotal: 0,
  responseTimeSamples: 0,
  avgResponseHours: 0,
  conversionRate: 0,
  contactRate: 0,
  totalPaid: 0,
  totalRefunded: 0,
  netRevenue: 0,
  monthlyRecurringRevenue: 0,
  lastPaymentAt: null
});

const clampLimit = (value, min = 1, max = 100) => {
  const numeric = Number.parseInt(value, 10);
  if (Number.isNaN(numeric)) return min;
  return Math.min(Math.max(numeric, min), max);
};

const sanitizeSortField = (value) => SORT_FIELD_MAP[value] || SORT_FIELD_MAP.created_at;

const sanitizeSearchTerm = (value = '') => value
  .toString()
  .replace(/[%_]/g, (match) => `\\${match}`)
  .replace(/[\r\n]+/g, ' ')
  .replace(/,/g, ' ')
  .trim();

const parseBoolean = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return value.trim().toLowerCase() === 'true';
  }
  return undefined;
};

const toNumber = (value, fallback = 0) => {
  const numeric = Number.parseFloat(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const safeRound = (value, digits = 2) => {
  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric)) return 0;
  const factor = 10 ** digits;
  return Math.round(numeric * factor) / factor;
};

const diffInHours = (start, end) => {
  const startDate = start ? new Date(start) : null;
  const endDate = end ? new Date(end) : null;
  if (!startDate || !endDate || Number.isNaN(startDate.valueOf()) || Number.isNaN(endDate.valueOf())) {
    return null;
  }
  const diffMs = endDate.getTime() - startDate.getTime();
  if (diffMs < 0) return null;
  return diffMs / (1000 * 60 * 60);
};

const resolveSubscriptionId = (record = {}) => record.subscription_id || record.subscriptionId || record.id || record.agency_subscription_id || null;

const resolveAgencyId = (record = {}) => record.agency_id || record.agencyId || record.id || null;

const resolvePlanId = (record = {}) => record.plan_id || record.planId || record.id || null;

const applySubscriptionIdFilter = (query, subscriptionId) => query.or(`id.eq.${subscriptionId},subscription_id.eq.${subscriptionId}`);

// Aggregates subscription metrics across territories, leads, and billing history.
const computeSubscriptionMetrics = async (subscriptions = []) => {
  const metrics = {};
  const subscriptionAgencyMap = new Map();

  subscriptions.forEach((subscription) => {
    const subscriptionId = resolveSubscriptionId(subscription);
    if (!subscriptionId) return;
    metrics[subscriptionId] = DEFAULT_SUBSCRIPTION_METRICS();
    metrics[subscriptionId].monthlyRecurringRevenue = toNumber(
      subscription.monthly_payment
        || subscription.monthlyPayment
        || subscription.subscription_plans?.base_price
        || subscription.subscription_plans?.price_per_unit
        || subscription.metadata?.monthly_payment
        || 0
    );
    subscriptionAgencyMap.set(subscriptionId, resolveAgencyId(subscription));
  });

  const subscriptionIds = Object.keys(metrics);
  if (!subscriptionIds.length) {
    return metrics;
  }

  const agencyIds = Array.from(new Set(Array.from(subscriptionAgencyMap.values()).filter(Boolean)));

  const [territoriesResp, billingResp, leadsResp] = await Promise.all([
    supabase
      .from('territories')
      .select('subscription_id')
      .in('subscription_id', subscriptionIds),
    supabase
      .from('billing_history')
      .select('subscription_id, total_amount, amount, status, created_at, updated_at, paid_at, completed_at')
      .in('subscription_id', subscriptionIds),
    agencyIds.length
      ? supabase
          .from('lead_assignments')
          .select('*')
          .in('agency_id', agencyIds)
      : { data: [], error: null }
  ]);

  if (territoriesResp.error) throw territoriesResp.error;
  if (billingResp.error) throw billingResp.error;
  if (leadsResp.error) throw leadsResp.error;

  (territoriesResp.data || []).forEach((row) => {
    const subscriptionId = resolveSubscriptionId(row);
    if (!subscriptionId) return;
    metrics[subscriptionId] = metrics[subscriptionId] || DEFAULT_SUBSCRIPTION_METRICS();
    metrics[subscriptionId].territoryCount += 1;
  });

  (leadsResp.data || []).forEach((lead) => {
    const leadSubscriptionId = resolveSubscriptionId(lead)
      || lead.metadata?.subscription_id
      || lead.metadata?.subscriptionId
      || null;

    let targetSubscriptionId = leadSubscriptionId;
    if (!targetSubscriptionId) {
      const leadAgencyId = resolveAgencyId(lead);
      if (leadAgencyId) {
        const candidates = Array.from(subscriptionAgencyMap.entries())
          .filter(([, agencyId]) => agencyId === leadAgencyId)
          .map(([subscriptionId]) => subscriptionId);
        if (candidates.length === 1) {
          targetSubscriptionId = candidates[0];
        }
      }
    }

    if (!targetSubscriptionId || !metrics[targetSubscriptionId]) return;

    metrics[targetSubscriptionId].leadCount += 1;

    const leadStatus = (lead.status || '').toString().toLowerCase();
    if (['accepted', 'completed', 'converted'].includes(leadStatus)) {
      metrics[targetSubscriptionId].convertedLeadCount += 1;
    }

    const contactedAt = lead.contacted_at
      || lead.accepted_at
      || lead.acceptedAt
      || lead.metadata?.contacted_at
      || null;

    if (contactedAt) {
      metrics[targetSubscriptionId].contactedLeadCount += 1;
      const createdAt = lead.created_at || lead.createdAt || null;
      const responseHours = diffInHours(createdAt, contactedAt);
      if (responseHours !== null) {
        metrics[targetSubscriptionId].responseTimeTotal += responseHours;
        metrics[targetSubscriptionId].responseTimeSamples += 1;
      }
    }
  });

  (billingResp.data || []).forEach((row) => {
    const subscriptionId = resolveSubscriptionId(row);
    if (!subscriptionId || !metrics[subscriptionId]) return;
    const amount = toNumber(row.total_amount ?? row.amount, 0);
    const status = (row.status || '').toString().toUpperCase();

    if (['PAID', 'COMPLETED', 'SUCCESS'].includes(status)) {
      metrics[subscriptionId].totalPaid += amount;
      metrics[subscriptionId].netRevenue += amount;
      const paidAt = row.paid_at || row.completed_at || row.created_at || row.updated_at || null;
      if (paidAt) {
        const candidate = new Date(paidAt);
        if (!Number.isNaN(candidate.valueOf())) {
          const current = metrics[subscriptionId].lastPaymentAt ? new Date(metrics[subscriptionId].lastPaymentAt) : null;
          if (!current || candidate.getTime() > current.getTime()) {
            metrics[subscriptionId].lastPaymentAt = candidate.toISOString();
          }
        }
      }
    }

    if (['REFUND', 'REFUNDED'].includes(status)) {
      metrics[subscriptionId].totalRefunded += amount;
      metrics[subscriptionId].netRevenue -= amount;
    }
  });

  Object.keys(metrics).forEach((subscriptionId) => {
    const snapshot = metrics[subscriptionId];
    if (!snapshot) return;

    if (snapshot.responseTimeSamples > 0) {
      snapshot.avgResponseHours = safeRound(snapshot.responseTimeTotal / snapshot.responseTimeSamples);
    } else {
      snapshot.avgResponseHours = 0;
    }

    if (snapshot.leadCount > 0) {
      snapshot.conversionRate = safeRound((snapshot.convertedLeadCount / snapshot.leadCount) * 100);
      snapshot.contactRate = safeRound((snapshot.contactedLeadCount / snapshot.leadCount) * 100);
    } else {
      snapshot.conversionRate = 0;
      snapshot.contactRate = 0;
    }

    snapshot.totalPaid = safeRound(snapshot.totalPaid);
    snapshot.totalRefunded = safeRound(snapshot.totalRefunded);
    snapshot.netRevenue = safeRound(snapshot.netRevenue);
    snapshot.monthlyRecurringRevenue = safeRound(snapshot.monthlyRecurringRevenue);

    delete snapshot.responseTimeTotal;
    delete snapshot.responseTimeSamples;
  });

  return metrics;
};

const mapSubscriptionRecord = (subscription, metricsSnapshot = DEFAULT_SUBSCRIPTION_METRICS(), agencyRecord = {}, planRecord = {}) => {
  const subscriptionId = resolveSubscriptionId(subscription);
  const agencyId = resolveAgencyId(subscription) || resolveAgencyId(agencyRecord);
  const planId = resolvePlanId(subscription) || resolvePlanId(planRecord);

  const agencyName = agencyRecord.business_name
    || agencyRecord.agency_name
    || agencyRecord.name
    || subscription.agency_name
    || subscription.name
    || subscription.metadata?.agency_name
    || 'Unknown Agency';

  const planName = planRecord.plan_name
    || planRecord.name
    || subscription.plan_name
    || subscription.metadata?.plan_name
    || 'Unknown Plan';

  const monthlyPayment = safeRound(
    subscription.monthly_payment
      ?? subscription.monthlyPayment
      ?? planRecord.base_price
      ?? planRecord.price_per_unit
      ?? metricsSnapshot.monthlyRecurringRevenue
  );

  const autoRenew = parseBoolean(subscription.auto_renew);
  const billingCycle = subscription.billing_cycle
    || subscription.billingCycle
    || planRecord.billing_cycle
    || 'monthly';

  const startDate = subscription.start_date
    || subscription.startDate
    || subscription.created_at
    || null;

  const endDate = subscription.end_date
    || subscription.endDate
    || subscription.renewal_date
    || subscription.next_billing_date
    || null;

  const trialEndDate = subscription.trial_end_date
    || subscription.trialEndDate
    || null;

  const metadata = typeof subscription.metadata === 'object' && subscription.metadata !== null && !Array.isArray(subscription.metadata)
    ? subscription.metadata
    : {};

  const zipcodes = Array.isArray(subscription.zipcodes) ? subscription.zipcodes : [];
  const cities = Array.isArray(subscription.cities) ? subscription.cities : [];

  const territoriesAllowed = subscription.max_territories
    || subscription.maxTerritories
    || metadata.max_territories
    || planRecord.max_territories
    || planRecord.max_units
    || null;

  const currentUnits = subscription.current_units
    || metadata.current_units
    || metricsSnapshot.territoryCount;

  return {
    id: subscriptionId,
    subscription_id: subscriptionId,
    agency_id: agencyId,
    plan_id: planId,
    status: (subscription.status || 'active').toString().toUpperCase(),
    start_date: startDate,
    end_date: endDate,
    renewal_date: endDate,
    billing_cycle: billingCycle,
    auto_renew: autoRenew !== false,
    trial_end_date: trialEndDate,
    monthly_payment: monthlyPayment,
    zipcodes,
    cities,
    metadata,
    agency: {
      id: agencyId,
      name: agencyName,
      email: agencyRecord.email || metadata.agency_email || null,
      phone_number: agencyRecord.phone_number || metadata.phone_number || null,
      status: agencyRecord.status || null
    },
    plan: {
      id: planId,
      name: planName,
      base_price: safeRound(planRecord.base_price ?? planRecord.price_per_unit ?? monthlyPayment),
      unit_type: planRecord.unit_type || subscription.unit_type || metadata.unit_type || null,
      billing_cycle: planRecord.billing_cycle || billingCycle,
      max_units: planRecord.max_units || planRecord.max_territories || null
    },
    usage: {
      current_units: currentUnits,
      max_units: territoriesAllowed,
      territory_count: metricsSnapshot.territoryCount
    },
    metrics: {
      territory_count: metricsSnapshot.territoryCount,
      lead_count: metricsSnapshot.leadCount,
      converted_lead_count: metricsSnapshot.convertedLeadCount,
      contact_rate: metricsSnapshot.contactRate,
      conversion_rate: metricsSnapshot.conversionRate,
      avg_response_time_hours: metricsSnapshot.avgResponseHours,
      monthly_recurring_revenue: metricsSnapshot.monthlyRecurringRevenue
    },
    billing: {
      total_paid: metricsSnapshot.totalPaid,
      total_refunded: metricsSnapshot.totalRefunded,
      net_revenue: metricsSnapshot.netRevenue,
      last_payment_at: metricsSnapshot.lastPaymentAt
    },
    created_at: subscription.created_at || null,
    updated_at: subscription.updated_at || null
  };
};

const buildLookupMaps = async (subscriptions = []) => {
  const agencyIds = Array.from(new Set(subscriptions.map(resolveAgencyId).filter(Boolean)));
  const planIds = Array.from(new Set(subscriptions.map(resolvePlanId).filter(Boolean)));

  const [agenciesResp, plansResp] = await Promise.all([
    agencyIds.length
      ? supabase.from('agencies').select('*').in('id', agencyIds)
      : { data: [], error: null },
    planIds.length
      ? supabase.from('subscription_plans').select('*').in('id', planIds)
      : { data: [], error: null }
  ]);

  if (agenciesResp.error) throw agenciesResp.error;
  if (plansResp.error) throw plansResp.error;

  const agenciesMap = new Map();
  (agenciesResp.data || []).forEach((agency) => {
    const agencyId = resolveAgencyId(agency);
    if (agencyId) agenciesMap.set(agencyId, agency);
  });

  const plansMap = new Map();
  (plansResp.data || []).forEach((plan) => {
    const planId = resolvePlanId(plan);
    if (planId) plansMap.set(planId, plan);
  });

  return { agenciesMap, plansMap };
};

const fetchSubscriptionById = async (subscriptionId) => {
  const { data, error } = await applySubscriptionIdFilter(
    supabase.from('agency_subscriptions').select('*'),
    subscriptionId
  ).maybeSingle();

  if (error) throw error;
  return data || null;
};

const fetchAgenciesForSearch = async (searchTerm) => {
  const sanitized = sanitizeSearchTerm(searchTerm);
  if (!sanitized) return new Set();

  const likeTerm = `%${sanitized}%`;
  const { data, error } = await supabase
    .from('agencies')
    .select('id, agency_id, business_name, agency_name, name, email')
    .or([
      `business_name.ilike.${likeTerm}`,
      `agency_name.ilike.${likeTerm}`,
      `name.ilike.${likeTerm}`,
      `email.ilike.${likeTerm}`
    ].join(','));

  if (error) throw error;

  const result = new Set();
  (data || []).forEach((agency) => {
    const agencyId = resolveAgencyId(agency);
    if (agencyId) result.add(agencyId);
  });

  return result;
};

router.get('/agency-subscriptions', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 25,
      sortBy = 'created_at',
      sortOrder = 'DESC',
      status,
      agencyId,
      planId,
      autoRenew,
      search
    } = req.query;

    const currentPage = Math.max(Number.parseInt(page, 10) || 1, 1);
    const pageSize = clampLimit(limit);
    const offset = (currentPage - 1) * pageSize;
    const sortField = sanitizeSortField(sortBy.toString().toLowerCase());
    const ascending = sortOrder.toString().toUpperCase() === 'ASC';

    let agencyFilterIds = null;
    if (search) {
      agencyFilterIds = await fetchAgenciesForSearch(search);
      if (agencyFilterIds.size === 0) {
        return res.json({
          success: true,
          data: {
            subscriptions: [],
            pagination: {
              total: 0,
              page: currentPage,
              limit: pageSize,
              totalPages: 0
            }
          }
        });
      }
    }

    let query = supabase
      .from('agency_subscriptions')
      .select('*', { count: 'exact' });

    if (agencyFilterIds && agencyFilterIds.size) {
      query = query.in('agency_id', Array.from(agencyFilterIds));
    }

    if (status) {
      query = query.eq('status', status.toString().toLowerCase());
    }

    if (agencyId) {
      query = query.eq('agency_id', agencyId);
    }

    if (planId) {
      query = query.eq('plan_id', planId);
    }

    if (autoRenew !== undefined) {
      query = query.eq('auto_renew', parseBoolean(autoRenew) !== false);
    }

    const { data, error, count } = await query
      .order(sortField, { ascending })
      .range(offset, offset + pageSize - 1);

    if (error) throw error;

    const subscriptions = data || [];
    if (!subscriptions.length) {
      return res.json({
        success: true,
        data: {
          subscriptions: [],
          pagination: {
            total: count ?? 0,
            page: currentPage,
            limit: pageSize,
            totalPages: count ? Math.ceil(count / pageSize) : 0
          }
        }
      });
    }

    const metricsMap = await computeSubscriptionMetrics(subscriptions);
    const { agenciesMap, plansMap } = await buildLookupMaps(subscriptions);

    const normalized = subscriptions.map((subscription) => {
      const subscriptionId = resolveSubscriptionId(subscription);
      const agency = agenciesMap.get(resolveAgencyId(subscription)) || {};
      const plan = plansMap.get(resolvePlanId(subscription)) || {};
      return mapSubscriptionRecord(
        subscription,
        metricsMap[subscriptionId] || DEFAULT_SUBSCRIPTION_METRICS(),
        agency,
        plan
      );
    });

    res.json({
      success: true,
      data: {
        subscriptions: normalized,
        pagination: {
          total: count ?? normalized.length,
          page: currentPage,
          limit: pageSize,
          totalPages: count ? Math.ceil(count / pageSize) : 1
        }
      }
    });
  } catch (error) {
    console.error('Error fetching agency subscriptions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch agency subscriptions',
      error: error.message
    });
  }
});

router.get('/agency-subscriptions/:subscriptionId', async (req, res) => {
  try {
    const { subscriptionId } = req.params;
    const subscription = await fetchSubscriptionById(subscriptionId);

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'Agency subscription not found'
      });
    }

    const resolvedId = resolveSubscriptionId(subscription);
    const metricsMap = await computeSubscriptionMetrics([subscription]);
    const { agenciesMap, plansMap } = await buildLookupMaps([subscription]);

    const territoriesResp = await supabase
      .from('territories')
      .select('*')
      .eq('subscription_id', resolvedId);

    if (territoriesResp.error) throw territoriesResp.error;

    res.json({
      success: true,
      data: {
        ...mapSubscriptionRecord(
          subscription,
          metricsMap[resolvedId] || DEFAULT_SUBSCRIPTION_METRICS(),
          agenciesMap.get(resolveAgencyId(subscription)) || {},
          plansMap.get(resolvePlanId(subscription)) || {}
        ),
        territories: territoriesResp.data || []
      }
    });
  } catch (error) {
    console.error('Error fetching agency subscription details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch agency subscription details',
      error: error.message
    });
  }
});

router.post('/agency-subscriptions', async (req, res) => {
  try {
    const {
      agencyId,
      planId,
      status = 'active',
      startDate,
      endDate,
      autoRenew = true,
      trialEndDate,
      monthlyPayment,
      zipcodes = [],
      cities = [],
      metadata = {}
    } = req.body;

    if (!agencyId || !planId) {
      return res.status(400).json({
        success: false,
        message: 'agencyId and planId are required'
      });
    }

    const agencyResp = await supabase
      .from('agencies')
      .select('*')
      .or(`id.eq.${agencyId},agency_id.eq.${agencyId}`)
      .maybeSingle();

    if (agencyResp.error) throw agencyResp.error;
    if (!agencyResp.data) {
      return res.status(400).json({
        success: false,
        message: 'Agency not found'
      });
    }

    const planResp = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('id', planId)
      .maybeSingle();

    if (planResp.error) throw planResp.error;
    if (!planResp.data) {
      return res.status(400).json({
        success: false,
        message: 'Subscription plan not found'
      });
    }

    const now = new Date();
    const start = startDate ? new Date(startDate) : now;
    const end = endDate ? new Date(endDate) : new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);
    const trialEnd = trialEndDate ? new Date(trialEndDate) : null;

    if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid start or end date'
      });
    }

    if (end.getTime() <= start.getTime()) {
      return res.status(400).json({
        success: false,
        message: 'End date must be after start date'
      });
    }

    const monthlyCost = monthlyPayment !== undefined && monthlyPayment !== null
      ? safeRound(monthlyPayment)
      : safeRound(planResp.data.base_price ?? planResp.data.price_per_unit ?? 0);

    const payload = {
      agency_id: agencyId,
      plan_id: planId,
      status: status.toString().toLowerCase(),
      auto_renew: parseBoolean(autoRenew) !== false,
      start_date: start.toISOString(),
      end_date: end.toISOString(),
      trial_end_date: trialEnd ? trialEnd.toISOString() : null,
      monthly_payment: monthlyCost,
      zipcodes: Array.isArray(zipcodes) ? zipcodes : [],
      cities: Array.isArray(cities) ? cities : [],
      metadata: {
        ...(typeof metadata === 'object' && metadata !== null ? metadata : {}),
        created_via: 'admin_portal',
        created_at: now.toISOString()
      },
      created_at: now.toISOString(),
      updated_at: now.toISOString()
    };

    const insertResp = await supabase
      .from('agency_subscriptions')
      .insert([payload])
      .select('*')
      .single();

    if (insertResp.error) throw insertResp.error;

    const subscription = insertResp.data;
    const metricsMap = await computeSubscriptionMetrics([subscription]);

    res.status(201).json({
      success: true,
      message: 'Agency subscription created successfully',
      data: mapSubscriptionRecord(
        subscription,
        metricsMap[resolveSubscriptionId(subscription)] || DEFAULT_SUBSCRIPTION_METRICS(),
        agencyResp.data,
        planResp.data
      )
    });
  } catch (error) {
    console.error('Error creating agency subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create agency subscription',
      error: error.message
    });
  }
});

router.put('/agency-subscriptions/:subscriptionId', async (req, res) => {
  try {
    const { subscriptionId } = req.params;
    const existing = await fetchSubscriptionById(subscriptionId);

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Agency subscription not found'
      });
    }

    const {
      status,
      startDate,
      endDate,
      renewalDate,
      autoRenew,
      trialEndDate,
      monthlyPayment,
      zipcodes,
      cities,
      metadata,
      planId,
      agencyId
    } = req.body;

    const updates = {
      updated_at: new Date().toISOString()
    };

    if (status !== undefined) {
      updates.status = status.toString().toLowerCase();
    }

    if (startDate) {
      const parsed = new Date(startDate);
      if (Number.isNaN(parsed.valueOf())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid start date'
        });
      }
      updates.start_date = parsed.toISOString();
    }

    const endSource = endDate || renewalDate;
    if (endSource) {
      const parsed = new Date(endSource);
      if (Number.isNaN(parsed.valueOf())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid end date'
        });
      }
      updates.end_date = parsed.toISOString();
    }

    if (autoRenew !== undefined) {
      updates.auto_renew = parseBoolean(autoRenew) !== false;
    }

    if (trialEndDate !== undefined) {
      if (trialEndDate === null || trialEndDate === '') {
        updates.trial_end_date = null;
      } else {
        const parsed = new Date(trialEndDate);
        if (Number.isNaN(parsed.valueOf())) {
          return res.status(400).json({
            success: false,
            message: 'Invalid trial end date'
          });
        }
        updates.trial_end_date = parsed.toISOString();
      }
    }

    if (monthlyPayment !== undefined) {
      updates.monthly_payment = safeRound(monthlyPayment);
    }

    if (zipcodes !== undefined) {
      updates.zipcodes = Array.isArray(zipcodes) ? zipcodes : [];
    }

    if (cities !== undefined) {
      updates.cities = Array.isArray(cities) ? cities : [];
    }

    if (metadata !== undefined) {
      if (typeof metadata === 'object' && metadata !== null && !Array.isArray(metadata)) {
        updates.metadata = {
          ...(existing.metadata || {}),
          ...metadata
        };
      } else {
        return res.status(400).json({
          success: false,
          message: 'Metadata must be an object'
        });
      }
    }

    if (planId) {
      updates.plan_id = planId;
    }

    if (agencyId) {
      updates.agency_id = agencyId;
    }

    if (Object.keys(updates).length === 1) {
      return res.status(400).json({
        success: false,
        message: 'No updates provided'
      });
    }

    const updateResp = await applySubscriptionIdFilter(
      supabase
        .from('agency_subscriptions')
        .update(updates)
        .select('*'),
      subscriptionId
    ).single();

    if (updateResp.error) throw updateResp.error;

    const updated = updateResp.data;
    const metricsMap = await computeSubscriptionMetrics([updated]);
    const { agenciesMap, plansMap } = await buildLookupMaps([updated]);

    res.json({
      success: true,
      message: 'Agency subscription updated successfully',
      data: mapSubscriptionRecord(
        updated,
        metricsMap[resolveSubscriptionId(updated)] || DEFAULT_SUBSCRIPTION_METRICS(),
        agenciesMap.get(resolveAgencyId(updated)) || {},
        plansMap.get(resolvePlanId(updated)) || {}
      )
    });
  } catch (error) {
    console.error('Error updating agency subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update agency subscription',
      error: error.message
    });
  }
});

router.put('/agency-subscriptions/:subscriptionId/status', async (req, res) => {
  try {
    const { subscriptionId } = req.params;
    const { status, autoRenew, reason } = req.body;

    if (status === undefined && autoRenew === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Provide status or autoRenew to update'
      });
    }

    const existing = await fetchSubscriptionById(subscriptionId);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Agency subscription not found'
      });
    }

    const now = new Date().toISOString();
    const updates = {
      updated_at: now
    };

    if (status !== undefined) {
      updates.status = status.toString().toLowerCase();
    }

    if (autoRenew !== undefined) {
      updates.auto_renew = parseBoolean(autoRenew) !== false;
    }

    if (reason) {
      const history = Array.isArray(existing.metadata?.status_history)
        ? existing.metadata.status_history
        : [];
      updates.metadata = {
        ...(existing.metadata || {}),
        status_history: [
          ...history,
          {
            applied_at: now,
            status: updates.status || existing.status,
            auto_renew: updates.auto_renew ?? existing.auto_renew,
            reason
          }
        ]
      };
    }

    const updateResp = await applySubscriptionIdFilter(
      supabase
        .from('agency_subscriptions')
        .update(updates)
        .select('*'),
      subscriptionId
    ).single();

    if (updateResp.error) throw updateResp.error;

    const updated = updateResp.data;
    const metricsMap = await computeSubscriptionMetrics([updated]);
    const { agenciesMap, plansMap } = await buildLookupMaps([updated]);

    res.json({
      success: true,
      message: 'Agency subscription status updated successfully',
      data: mapSubscriptionRecord(
        updated,
        metricsMap[resolveSubscriptionId(updated)] || DEFAULT_SUBSCRIPTION_METRICS(),
        agenciesMap.get(resolveAgencyId(updated)) || {},
        plansMap.get(resolvePlanId(updated)) || {}
      )
    });
  } catch (error) {
    console.error('Error updating agency subscription status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update agency subscription status',
      error: error.message
    });
  }
});

router.delete('/agency-subscriptions/:subscriptionId', async (req, res) => {
  try {
    const { subscriptionId } = req.params;
    const { hard = 'false', reason } = req.query;

    const existing = await fetchSubscriptionById(subscriptionId);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Agency subscription not found'
      });
    }

    if (parseBoolean(hard) === true) {
      const deleteResp = await applySubscriptionIdFilter(
        supabase
          .from('agency_subscriptions')
          .delete()
          .select('*'),
        subscriptionId
      ).single();

      if (deleteResp.error) throw deleteResp.error;

      return res.json({
        success: true,
        message: 'Agency subscription removed permanently',
        data: {
          id: resolveSubscriptionId(deleteResp.data),
          agency_id: resolveAgencyId(deleteResp.data),
          plan_id: resolvePlanId(deleteResp.data)
        }
      });
    }

    const now = new Date().toISOString();
    const metadata = {
      ...(existing.metadata || {}),
      cancellation: {
        reason: reason || 'Cancelled via admin portal',
        cancelled_at: now
      }
    };

    const updateResp = await applySubscriptionIdFilter(
      supabase
        .from('agency_subscriptions')
        .update({
          status: 'cancelled',
          auto_renew: false,
          metadata,
          updated_at: now
        })
        .select('*'),
      subscriptionId
    ).single();

    if (updateResp.error) throw updateResp.error;

    const updated = updateResp.data;
    const metricsMap = await computeSubscriptionMetrics([updated]);
    const { agenciesMap, plansMap } = await buildLookupMaps([updated]);

    res.json({
      success: true,
      message: 'Agency subscription cancelled',
      data: mapSubscriptionRecord(
        updated,
        metricsMap[resolveSubscriptionId(updated)] || DEFAULT_SUBSCRIPTION_METRICS(),
        agenciesMap.get(resolveAgencyId(updated)) || {},
        plansMap.get(resolvePlanId(updated)) || {}
      )
    });
  } catch (error) {
    console.error('Error deleting agency subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete agency subscription',
      error: error.message
    });
  }
});

module.exports = router;
