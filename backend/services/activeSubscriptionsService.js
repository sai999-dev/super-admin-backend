/**
 * Active Subscriptions Service
 * Business logic for active subscription management and analytics
 */

const supabase = require('../config/supabaseClient');

const toNumber = (value, fallback = 0) => {
  const numeric = Number.parseFloat(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const safeDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date;
};

const addDays = (date, days) => {
  const base = safeDate(date) || new Date();
  const next = new Date(base);
  next.setDate(base.getDate() + days);
  return next;
};

const startOfMonth = (date = new Date()) => {
  const start = new Date(date);
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  return start;
};

const getDateRangeBounds = (dateRange) => {
  if (!dateRange || dateRange === 'all') return null;

  const now = new Date();
  const start = new Date(now);

  switch (dateRange) {
    case 'last7days':
      start.setDate(now.getDate() - 7);
      break;
    case 'last30days':
      start.setDate(now.getDate() - 30);
      break;
    case 'last90days':
      start.setDate(now.getDate() - 90);
      break;
    case 'thisMonth':
      start.setDate(1);
      break;
    case 'lastMonth':
      start.setMonth(now.getMonth() - 1);
      start.setDate(1);
      break;
    case 'thisYear':
      start.setMonth(0);
      start.setDate(1);
      break;
    default:
      return null;
  }

  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  return { start, end };
};

const applyActiveSubscriptionFilters = (query, filters = {}) => {
  const {
    agencyId,
    agencyIds,
    planId,
    status,
    dateRange,
    startDate,
    endDate,
    subscriptionId
  } = filters;

  let nextQuery = query;

  if (agencyId) {
    nextQuery = nextQuery.eq('agency_id', agencyId);
  } else if (Array.isArray(agencyIds) && agencyIds.length > 0) {
    const uniqueIds = Array.from(new Set(agencyIds.filter(Boolean)));
    if (uniqueIds.length) {
      nextQuery = nextQuery.in('agency_id', uniqueIds);
    }
  }

  if (planId) {
    nextQuery = nextQuery.eq('plan_id', planId);
  }

  if (status) {
    const normalized = String(status).toLowerCase();
    nextQuery = nextQuery.eq('status', normalized);
  }

  if (subscriptionId) {
    nextQuery = nextQuery.eq('subscription_id', subscriptionId);
  }

  const bounds = getDateRangeBounds(dateRange);
  if (bounds?.start) {
    nextQuery = nextQuery.gte('start_date', bounds.start.toISOString());
  }
  if (bounds?.end) {
    nextQuery = nextQuery.lte('start_date', bounds.end.toISOString());
  }

  const explicitStart = safeDate(startDate);
  if (explicitStart) {
    nextQuery = nextQuery.gte('start_date', explicitStart.toISOString());
  }

  const explicitEnd = safeDate(endDate);
  if (explicitEnd) {
    nextQuery = nextQuery.lte('start_date', explicitEnd.toISOString());
  }

  return nextQuery;
};

const fetchCount = async (filters = {}, { gte = {}, lte = {} } = {}) => {
  // Use 'subscriptions' table instead of non-existent 'active_subscriptions' table
  let query = supabase
    .from('subscriptions')
    .select('id', { count: 'exact', head: true })
    .in('status', ['trial', 'active']); // Match active subscriptions only

  query = applyActiveSubscriptionFilters(query, filters);

  Object.entries(gte).forEach(([field, value]) => {
    if (value !== undefined && value !== null) {
      query = query.gte(field, value);
    }
  });

  Object.entries(lte).forEach(([field, value]) => {
    if (value !== undefined && value !== null) {
      query = query.lte(field, value);
    }
  });

  const { error, count } = await query;
  if (error) throw error;
  return count || 0;
};

const fetchPlanLookup = async (planIds = []) => {
  const uniqueIds = Array.from(new Set(planIds.filter(Boolean)));
  if (!uniqueIds.length) return new Map();

  const { data, error } = await supabase
    .from('subscription_plans')
    .select('id, plan_name')
    .in('id', uniqueIds);

  if (error) throw error;

  const result = new Map();
  (data || []).forEach((plan) => {
    result.set(plan.id, plan.plan_name || 'Unknown Plan');
  });

  return result;
};

// Fetch pricing (base_price) and names for plans
const fetchPlanPricing = async (planIds = []) => {
  const uniqueIds = Array.from(new Set(planIds.filter(Boolean)));
  const result = new Map();
  if (!uniqueIds.length) return result;

  const { data, error } = await supabase
    .from('subscription_plans')
    .select('id, plan_name, base_price')
    .in('id', uniqueIds);

  if (error) throw error;

  (data || []).forEach((row) => {
    result.set(row.id, {
      name: row.plan_name || 'Unknown Plan',
      price: toNumber(row.base_price, 0)
    });
  });
  return result;
};

/**
 * Get active subscriptions summary for dashboard
 */
const getActiveSubscriptionsSummary = async (filters = {}) => {
  try {
    const { dateRange = 'all', agencyId, planId } = filters;
    const baseFilters = { dateRange, agencyId, planId };

  const totalSubscriptions = await fetchCount(baseFilters);
  const activeSubscriptions = await fetchCount({ ...baseFilters, status: 'active' });

    const nowIso = new Date().toISOString();
    const thirtyDaysIso = addDays(new Date(), 30).toISOString();
    const expiringSoon = await fetchCount(
      { ...baseFilters, status: 'active' },
      { gte: { end_date: nowIso }, lte: { end_date: thirtyDaysIso } }
    );

    // Simplify: some schemas may not have cancellation_date; report 0 for now
    const cancelledThisMonth = 0;

    // Calculate revenue from subscriptions - need to join with plans for pricing
    // For revenue, fetch plan_id and current_units for active/trial subscriptions
    const { data: revenueRows, error: revenueError } = await applyActiveSubscriptionFilters(
      supabase
        .from('subscriptions')
        .select('plan_id, current_units')
        .in('status', ['trial', 'active']),
      baseFilters
    );

    if (revenueError) throw revenueError;

    const planIdsForRevenue = (revenueRows || []).map((r) => r.plan_id).filter(Boolean);
    const planPricing = await fetchPlanPricing(planIdsForRevenue);

    let totalMonthlyRevenue = 0;
    (revenueRows || []).forEach((row) => {
      const price = planPricing.get(row.plan_id)?.price || 0;
      const units = toNumber(row.current_units, 0);
      totalMonthlyRevenue += price * units;
    });

    const revenueMetrics = {
      totalMonthlyRevenue,
      totalRevenue: totalMonthlyRevenue,
      averageMonthlyCost: (revenueRows?.length || 0) ? totalMonthlyRevenue / revenueRows.length : 0
    };

    const { data: statusRows, error: statusError } = await applyActiveSubscriptionFilters(
      supabase
        .from('subscriptions')
        .select('id, status')
        .in('status', ['trial', 'active']),
      baseFilters
    );

    if (statusError) throw statusError;

    const statusBreakdownMap = new Map();
    (statusRows || []).forEach((row) => {
      const key = row.status || 'UNKNOWN';
      const current = statusBreakdownMap.get(key) || 0;
      statusBreakdownMap.set(key, current + 1);
    });

    const statusBreakdown = Array.from(statusBreakdownMap.entries()).map(([statusKey, count]) => ({
      status: statusKey,
      count
    }));

    const { data: planRows, error: planError } = await applyActiveSubscriptionFilters(
      supabase
        .from('subscriptions')
        .select('plan_id, current_units')
        .in('status', ['trial', 'active']),
      baseFilters
    );

    if (planError) throw planError;

    const planMetrics = new Map();
    (planRows || []).forEach((row) => {
      if (!row.plan_id) return;
      const entry = planMetrics.get(row.plan_id) || { count: 0, revenue: 0 };
      entry.count += 1;
      const unitPrice = planPricing.get(row.plan_id)?.price || 0;
      entry.revenue += unitPrice * toNumber(row.current_units, 0);
      planMetrics.set(row.plan_id, entry);
    });

    const planNames = await fetchPlanLookup(Array.from(planMetrics.keys()));

    const planBreakdown = Array.from(planMetrics.entries()).map(([planId, metrics]) => ({
      planId,
      planName: planNames.get(planId) || 'Unknown Plan',
      count: metrics.count,
      revenue: metrics.revenue
    }));

    return {
      totalSubscriptions,
      activeSubscriptions,
      expiringSoon,
      cancelledThisMonth,
      revenueMetrics,
      statusBreakdown,
      planBreakdown
    };
  } catch (error) {
    console.error('Error getting active subscriptions summary:', error);
    throw error;
  }
};

/**
 * Calculate totals for active subscriptions
 */
const calculateActiveSubscriptionsTotals = async (filters = {}) => {
  try {
    const { data, count, error } = await applyActiveSubscriptionFilters(
      supabase
        .from('subscriptions')
        .select('id', { count: 'exact' })
        .in('status', ['trial', 'active']),
      filters
    );

    if (error) throw error;

    const totalRecords = count || 0;
    const totalMonthlyRevenue = 0;
    const averageMonthlyCost = 0;

    return {
      totalRecords,
      totalMonthlyRevenue,
      averageMonthlyCost
    };
  } catch (error) {
    console.error('Error calculating active subscriptions totals:', error);
    throw error;
  }
};

/**
 * Get date range filter
 */
const getDateRangeFilter = (dateRange) => {
  const bounds = getDateRangeBounds(dateRange);
  if (!bounds) return {};
  return {
    start_date: {
      gte: bounds.start,
      lte: bounds.end
    }
  };
};

/**
 * Calculate total cost based on billing cycle
 */
const calculateTotalCost = (monthlyCost, billingCycle, startDate, endDate) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const months = Math.ceil((end - start) / (1000 * 60 * 60 * 24 * 30)); // Approximate months
  
  let multiplier = 1;
  switch (billingCycle) {
    case 'QUARTERLY':
      multiplier = 3;
      break;
    case 'YEARLY':
      multiplier = 12;
      break;
    default:
      multiplier = 1;
  }
  
  return monthlyCost * months * multiplier;
};

/**
 * Add territories to active subscription
 */
const addTerritoriesToActiveSubscription = async (activeSubscriptionId, territories = []) => {
  try {
    if (!territories || territories.length === 0) {
      return { inserted: 0 };
    }

    const timestamp = new Date().toISOString();
    
    // Get agency_id for the territory (territories table requires both subscription_id and agency_id)
    const { data: subData } = await supabase
      .from('subscriptions')
      .select('agency_id')
      .eq('id', activeSubscriptionId)
      .maybeSingle();
    
    const payload = territories.map((territory) => ({
      subscription_id: activeSubscriptionId, // Use subscription_id, not active_subscription_id
      agency_id: subData?.agency_id || null, // Territories table requires agency_id too
      type: territory.type || null,
      value: territory.value != null ? String(territory.value) : null,
      state: territory.state || null,
      county: territory.county || null,
      city: territory.city || null,
      zipcode: territory.zipcode != null ? String(territory.zipcode) : null,
      priority: territory.priority != null ? Number.parseInt(territory.priority, 10) : null,
      is_active: territory.isActive !== false,
      metadata: territory.metadata || null,
      created_at: timestamp,
      updated_at: timestamp
    }));

    const { error: insertError } = await supabase
      .from('territories')
      .insert(payload);

    if (insertError) throw insertError;

    // Territories link via subscription_id (not active_subscription_id)
    const { count, error: countError } = await supabase
      .from('territories')
      .select('id', { count: 'exact', head: true })
      .eq('subscription_id', activeSubscriptionId);

    if (countError) throw countError;

    const { error: updateError } = await supabase
      .from('subscriptions')
      .update({ current_units: count || 0, updated_at: timestamp })
      .eq('id', activeSubscriptionId);

    if (updateError) throw updateError;

    return { inserted: payload.length, activeCount: count || 0 };
  } catch (error) {
    console.error('Error adding territories to active subscription:', error);
    throw error;
  }
};

/**
 * Update territories for active subscription
 */
const updateTerritoriesForActiveSubscription = async (activeSubscriptionId, territories) => {
  try {
    // Territories link via subscription_id
    const { error: deleteError } = await supabase
      .from('territories')
      .delete()
      .eq('subscription_id', activeSubscriptionId);

    if (deleteError) throw deleteError;

    if (territories && territories.length > 0) {
      return addTerritoriesToActiveSubscription(activeSubscriptionId, territories);
    }

    const timestamp = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('subscriptions')
      .update({ current_units: 0, updated_at: timestamp })
      .eq('id', activeSubscriptionId);

    if (updateError) throw updateError;
    return { inserted: 0, activeCount: 0 };
  } catch (error) {
    console.error('Error updating territories for active subscription:', error);
    throw error;
  }
};

/**
 * Export active subscriptions to CSV
 */
const exportToCSV = async (activeSubscriptions) => {
  try {
    const headers = [
      'Agency Name',
      'Plan Name',
      'Start Date',
      'End Date',
      'Status',
      'Monthly Cost',
      'Total Cost',
      'Billing Cycle',
      'Auto Renew',
      'Territory Count',
      'Payment Status',
      'Last Payment Date',
      'Next Payment Date',
      'Notes'
    ];

    const normalizeDate = (value) => {
      const parsed = safeDate(value);
      return parsed ? parsed.toISOString().split('T')[0] : '';
    };

    const rows = activeSubscriptions.map((subscription) => [
      subscription.agency?.businessName || '',
      subscription.plan?.name || '',
      normalizeDate(subscription.startDate),
      normalizeDate(subscription.endDate),
      subscription.status || '',
      toNumber(subscription.monthlyCost, 0),
      toNumber(subscription.totalCost, 0),
      subscription.billingCycle || '',
      subscription.autoRenew ? 'Yes' : 'No',
      subscription.territoryCount ?? 0,
      subscription.paymentStatus || '',
      normalizeDate(subscription.lastPaymentDate),
      normalizeDate(subscription.nextPaymentDate),
      subscription.notes || ''
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(field => `"${field}"`).join(','))
      .join('\n');

    return csvContent;
  } catch (error) {
    console.error('Error exporting to CSV:', error);
    throw error;
  }
};

/**
 * Get expiring subscriptions
 */
const getExpiringSubscriptions = async (days = 30) => {
  try {
    const nowIso = new Date().toISOString();
    const futureIso = addDays(new Date(), days).toISOString();

    const { data, error } = await supabase
      .from('subscriptions')
      .select(`
        id,
        agency_id,
        plan_id,
        start_date,
        end_date,
        status,
        monthly_cost,
        total_cost,
        billing_cycle,
        auto_renew,
        agency:agencies(business_name, email, phone),
        plan:subscription_plans(name, plan_name)
      `)
      .eq('status', 'ACTIVE')
      .gte('end_date', nowIso)
      .lte('end_date', futureIso)
      .order('end_date', { ascending: true });

    if (error) throw error;

    return data || [];
  } catch (error) {
    console.error('Error getting expiring subscriptions:', error);
    throw error;
  }
};

/**
 * Get subscription analytics
 */
const getSubscriptionAnalytics = async (filters = {}) => {
  try {
    const { dateRange = 'last30days', groupBy = 'month' } = filters;
    const bounds = getDateRangeBounds(dateRange) || {
      start: addDays(new Date(), -30),
      end: new Date()
    };

    let query = supabase
      .from('subscriptions')
      .select('start_date, monthly_cost')
      .eq('status', 'ACTIVE');

    if (bounds.start) {
      query = query.gte('start_date', bounds.start.toISOString());
    }
    if (bounds.end) {
      query = query.lte('start_date', bounds.end.toISOString());
    }

  const { data, error } = await query;
    if (error) throw error;

    const formatPeriod = (value) => {
      const date = safeDate(value);
      if (!date) return 'Unknown';
      switch (groupBy) {
        case 'day':
          return date.toISOString().slice(0, 10);
        case 'week': {
          const temp = new Date(date.getTime());
          const dayNumber = (date.getUTCDay() || 7);
          temp.setUTCDate(temp.getUTCDate() + 4 - dayNumber);
          const yearStart = new Date(Date.UTC(temp.getUTCFullYear(), 0, 1));
          const weekNumber = Math.ceil((((temp - yearStart) / 86400000) + 1) / 7);
          return `${temp.getUTCFullYear()}-W${weekNumber.toString().padStart(2, '0')}`;
        }
        default:
          return `${date.getUTCFullYear()}-${(date.getUTCMonth() + 1).toString().padStart(2, '0')}`;
      }
    };

    const analyticsMap = new Map();
    (data || []).forEach((row) => {
      const period = formatPeriod(row.start_date);
      const monthlyRevenue = toNumber(row.monthly_cost, 0);
      const entry = analyticsMap.get(period) || {
        period,
        subscriptionCount: 0,
        monthlyRevenue: 0,
        averageCost: 0
      };
      entry.subscriptionCount += 1;
      entry.monthlyRevenue += monthlyRevenue;
      analyticsMap.set(period, entry);
    });

    const analytics = Array.from(analyticsMap.values()).map((entry) => ({
      ...entry,
      averageCost: entry.subscriptionCount ? entry.monthlyRevenue / entry.subscriptionCount : 0
    }));

    analytics.sort((a, b) => a.period.localeCompare(b.period));
    return analytics;
  } catch (error) {
    console.error('Error getting subscription analytics:', error);
    throw error;
  }
};

/**
 * Update subscription status based on dates
 */
const updateSubscriptionStatuses = async () => {
  try {
    const now = new Date();
    const nowIso = now.toISOString();
    const soonIso = addDays(now, 30).toISOString();
    const timestamp = nowIso;

    const { error: expireError } = await supabase
      .from('subscriptions')
      .update({ status: 'expired', updated_at: timestamp })
      .eq('status', 'active')
      .lt('end_date', nowIso);

    if (expireError) throw expireError;

    const { error: expiringError } = await supabase
      .from('subscriptions')
      .update({ status: 'expiring', updated_at: timestamp })
      .eq('status', 'active')
      .gte('end_date', nowIso)
      .lte('end_date', soonIso);

    if (expiringError) throw expiringError;

    return true;
  } catch (error) {
    console.error('Error updating subscription statuses:', error);
    throw error;
  }
};

module.exports = {
  getActiveSubscriptionsSummary,
  calculateActiveSubscriptionsTotals,
  getDateRangeFilter,
  calculateTotalCost,
  addTerritoriesToActiveSubscription,
  updateTerritoriesForActiveSubscription,
  exportToCSV,
  getExpiringSubscriptions,
  getSubscriptionAnalytics,
  updateSubscriptionStatuses,
  applyActiveSubscriptionFilters
};
