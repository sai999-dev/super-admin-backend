/**
 * Active Subscriptions Controller
 * Handles active subscription management, tracking, and analytics
 */

const supabase = require('../config/supabaseClient');
const activeSubscriptionsService = require('../services/activeSubscriptionsService');
const featureFlags = require('../config/featureFlags');

const SORTABLE_FIELDS = {
  start_date: 'start_date',
  end_date: 'end_date',
  status: 'status',
  monthly_cost: 'monthly_cost',
  total_cost: 'total_cost',
  created_at: 'created_at',
  updated_at: 'updated_at'
};

const clampLimit = (value, min = 1, max = 100) => {
  const numeric = Number.parseInt(value, 10);
  if (!Number.isFinite(numeric)) return min;
  return Math.min(Math.max(numeric, min), max);
};

const parsePositiveInt = (value, fallback = 1) => {
  const numeric = Number.parseInt(value, 10);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
};

const toNumber = (value, fallback = 0) => {
  if (value === null || value === undefined) return fallback;
  const numeric = Number.parseFloat(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const safeDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date;
};

const sanitizeSearchTerm = (value = '') => value
  .toString()
  .trim()
  .replace(/[%_]/g, (match) => `\\${match}`);

const mapAgency = (agency = {}) => ({
  id: agency.id || null,
  businessName: agency.business_name || agency.agency_name || agency.businessName || null,
  email: agency.email || null,
  phone: agency.phone || null,
  accountStatus: agency.account_status || agency.accountStatus || null,
  address: agency.address || null
});

const mapPlan = (plan = {}) => ({
  id: plan.id || null,
  name: plan.name || plan.plan_name || null,
  unitType: plan.unit_type || plan.unitType || null,
  pricePerUnit: toNumber(plan.price_per_unit ?? plan.base_price, null),
  maxUnits: plan.max_units ?? plan.maxUnits ?? null,
  features: plan.features || null
});

const mapSubscription = (subscription = {}) => ({
  id: subscription.id || null,
  status: subscription.status || null,
  billingCycle: subscription.billing_cycle || subscription.billingCycle || null,
  autoRenew: subscription.auto_renew !== undefined && subscription.auto_renew !== null
    ? subscription.auto_renew !== false
    : subscription.autoRenew !== undefined && subscription.autoRenew !== null
      ? subscription.autoRenew !== false
      : null,
  notes: subscription.notes || null
});

const mapTerritory = (territory = {}) => ({
  id: territory.id || null,
  type: territory.type || null,
  value: territory.value || null,
  state: territory.state || null,
  county: territory.county || null,
  city: territory.city || null,
  zipcode: territory.zipcode || null,
  priority: territory.priority ?? null,
  isActive: territory.is_active !== false,
  createdAt: territory.created_at || null,
  updatedAt: territory.updated_at || null
});

const mapUser = (user = {}) => ({
  id: user.id || null,
  firstName: user.first_name || user.firstName || null,
  lastName: user.last_name || user.lastName || null,
  email: user.email || null
});

const mapActiveSubscriptionRecord = (record = {}, options = {}) => {
  const includeTerritories = options.includeTerritories ?? false;
  const includeUsers = options.includeUsers ?? false;
  const includeMetadata = options.includeMetadata ?? false;

  const territories = Array.isArray(record.territories) ? record.territories : [];

  const shaped = {
    id: record.id || null,
    agencyId: record.agency_id ?? record.agencyId ?? null,
    planId: record.plan_id ?? record.planId ?? null,
    subscriptionId: record.subscription_id ?? record.subscriptionId ?? null,
    startDate: record.start_date || record.startDate || null,
    endDate: record.end_date || record.endDate || null,
    status: record.status || null,
    monthlyCost: toNumber(record.monthly_cost ?? record.monthlyCost, null),
    totalCost: toNumber(record.total_cost ?? record.totalCost, null),
    billingCycle: record.billing_cycle || record.billingCycle || null,
    autoRenew: record.auto_renew !== undefined && record.auto_renew !== null
      ? record.auto_renew !== false
      : record.autoRenew !== undefined && record.autoRenew !== null
        ? record.autoRenew !== false
        : null,
    notes: record.notes || null,
    territoryCount: record.territory_count ?? record.territoryCount ?? territories.length,
    paymentStatus: record.payment_status || record.paymentStatus || null,
    lastPaymentDate: record.last_payment_date || record.lastPaymentDate || null,
    nextPaymentDate: record.next_payment_date || record.nextPaymentDate || null,
    cancellationReason: record.cancellation_reason || record.cancellationReason || null,
    cancellationDate: record.cancellation_date || record.cancellationDate || null,
    createdAt: record.created_at || record.createdAt || null,
    updatedAt: record.updated_at || record.updatedAt || null,
    agency: record.agency ? mapAgency(record.agency) : null,
    plan: record.plan ? mapPlan(record.plan) : null,
    subscription: record.subscription ? mapSubscription(record.subscription) : null
  };

  if (includeTerritories) {
    shaped.territories = territories.map(mapTerritory);
  }

  if (includeUsers) {
    if (record.created_by_user || record.createdByUser) {
      shaped.createdBy = mapUser(record.created_by_user || record.createdByUser);
    }
    if (record.updated_by_user || record.updatedByUser) {
      shaped.updatedBy = mapUser(record.updated_by_user || record.updatedByUser);
    }
  }

  if (includeMetadata) {
    shaped.metadata = record.metadata || null;
  }

  return shaped;
};

const fetchActiveSubscriptionWithRelations = async (id) => {
  // Fetch base subscription
  let subRes;
  if (featureFlags.shouldUseNestedSelects()) {
    subRes = await supabase
      .from('subscriptions')
      .select(`
        *,
        agency:agencies(id, agency_name, email),
        plan:subscription_plans(id, plan_name, base_price)
      `)
      .eq('id', id)
      .in('status', ['trial', 'active'])
      .maybeSingle();
    // If nested failed due to missing relation discovery, fall back
    if (subRes.error && (subRes.error.code === 'PGRST200' || /relation|foreign key|not exist/i.test(subRes.error.message))) {
      subRes = null;
    }
  }
  if (!subRes) {
    subRes = await supabase
      .from('subscriptions')
      .select('*')
      .eq('id', id)
      .in('status', ['trial', 'active'])
      .maybeSingle();
  }

  if (subRes.error) throw subRes.error;
  const record = subRes.data;
  if (!record) return null;

  // If nested fields already present, skip extra lookups
  let agency = record.agency || null;
  let plan = record.plan || null;

  // Fetch agency and plan in parallel if missing
  const [agencyRes, planRes, terrRes] = await Promise.all([
    agency ? { data: agency } : (record.agency_id
      ? supabase.from('agencies').select('id, agency_name, email').eq('id', record.agency_id).maybeSingle()
      : { data: null }),
    plan ? { data: plan } : (record.plan_id
      ? supabase.from('subscription_plans').select('id, plan_name, base_price').eq('id', record.plan_id).maybeSingle()
      : { data: null }),
    supabase.from('territories').select('*').eq('is_active', true).eq('subscription_id', record.id)
  ]);

  if (agencyRes.error) throw agencyRes.error;
  if (planRes.error) throw planRes.error;
  if (terrRes.error) throw terrRes.error;

  return {
    ...record,
    agency: agencyRes.data || null,
    plan: planRes.data || null,
    territories: terrRes.data || []
  };
};

const fetchUserById = async (id) => {
  if (!id) return null;
  const response = await supabase
    .from('users')
    .select('id, first_name, last_name, email')
    .eq('id', id)
    .maybeSingle();

  if (response.error) throw response.error;
  return response.data || null;
};

const findAgenciesBySearch = async (search) => {
  const sanitized = sanitizeSearchTerm(search);
  const response = await supabase
    .from('agencies')
    .select('id')
    .or(`business_name.ilike.%${sanitized}%,email.ilike.%${sanitized}%`);

  if (response.error) throw response.error;
  return (response.data || []).map((agency) => agency.id);
};

/**
 * GET /api/admin/active-subscriptions/summary
 * Get active subscriptions summary for dashboard
 */
exports.getSummary = async (req, res) => {
  try {
    const {
      dateRange = 'all',
      agencyId,
      planId
    } = req.query;

    const summary = await activeSubscriptionsService.getActiveSubscriptionsSummary({
      dateRange,
      agencyId,
      planId
    });

    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    console.error('Error getting active subscriptions summary:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch active subscriptions summary',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * GET /api/admin/active-subscriptions
 * Get paginated active subscriptions with filters
 */
exports.getActiveSubscriptions = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 25,
      sortBy = 'start_date',
      sortOrder = 'DESC',
      status,
      agencyId,
      planId,
      search,
      dateRange = 'all'
    } = req.query;

    const currentPage = parsePositiveInt(page, 1);
    const pageSize = clampLimit(limit, 5, 100);
    const offset = (currentPage - 1) * pageSize;

    const filters = {
      status,
      agencyId,
      planId,
      dateRange
    };

    if (search) {
      const agencyIds = await findAgenciesBySearch(search);
      if (agencyIds.length === 0) {
        return res.json({
          success: true,
          data: {
            activeSubscriptions: [],
            pagination: {
              currentPage,
              totalPages: 0,
              totalRecords: 0,
              limit: pageSize
            },
            totals: {
              totalRecords: 0,
              totalMonthlyRevenue: 0,
              averageMonthlyCost: 0
            }
          }
        });
      }
      filters.agencyIds = agencyIds;
    }

    const sortColumn = SORTABLE_FIELDS[sortBy] || SORTABLE_FIELDS.start_date;
    const ascending = String(sortOrder).toUpperCase() !== 'DESC';

    // Use 'subscriptions' table with optional nested relationships (if feature flag enabled)
    const useNested = featureFlags.shouldUseNestedSelects();
    let query;
    if (useNested) {
      query = supabase
        .from('subscriptions')
        .select(`
          *,
          agency:agencies(id, agency_name, email),
          plan:subscription_plans(id, plan_name, base_price)
        `, { count: 'exact' })
        .in('status', ['trial', 'active']);
    } else {
      query = supabase
        .from('subscriptions')
        .select('*', { count: 'exact' })
        .in('status', ['trial', 'active']);
    }

    query = activeSubscriptionsService.applyActiveSubscriptionFilters(query, filters);

    let { data, error, count } = await query
      .order(sortColumn, { ascending })
      .range(offset, offset + pageSize - 1);

    if (error && featureFlags.shouldUseNestedSelects() && (error.code === 'PGRST200' || /relation|foreign key|not exist/i.test(error.message))) {
      // Fallback to non-nested select transparently
      query = supabase
        .from('subscriptions')
        .select('*', { count: 'exact' })
        .in('status', ['trial', 'active']);
      query = activeSubscriptionsService.applyActiveSubscriptionFilters(query, filters);
      ({ data, error, count } = await query
        .order(sortColumn, { ascending })
        .range(offset, offset + pageSize - 1));
    }

    if (error) throw error;

    // When nested is enabled and relationships are discovered, the records may already include agency/plan
    // Otherwise, batch fetch agencies and plans for the page
    let agencyMap = new Map();
    let planMap = new Map();

    if (!useNested || !data?.[0]?.agency || !data?.[0]?.plan) {
      const agencyIds = Array.from(new Set((data || []).map(r => r.agency_id).filter(Boolean)));
      const planIds = Array.from(new Set((data || []).map(r => r.plan_id).filter(Boolean)));

      const [agenciesRes, plansRes] = await Promise.all([
        agencyIds.length
          ? supabase.from('agencies').select('id, agency_name, email').in('id', agencyIds)
          : { data: [] },
        planIds.length
          ? supabase.from('subscription_plans').select('id, plan_name, base_price').in('id', planIds)
          : { data: [] }
      ]);

      if (agenciesRes.error) throw agenciesRes.error;
      if (plansRes.error) throw plansRes.error;

      agencyMap = new Map((agenciesRes.data || []).map(a => [a.id, a]));
      planMap = new Map((plansRes.data || []).map(p => [p.id, p]));
    }

    // Fetch territories separately for each subscription (kept for now)
    const activeSubscriptions = await Promise.all((data || []).map(async (record) => {
      let territories = [];
      try {
        const { data: territoryData } = await supabase
          .from('territories')
          .select('*')
          .eq('is_active', true)
          .eq('subscription_id', record.id);
        territories = territoryData || [];
      } catch (terrError) {
        console.warn('Warning: Failed to fetch territories:', terrError.message);
      }

      const recordWithJoins = {
        ...record,
        agency: record.agency || agencyMap.get(record.agency_id) || null,
        plan: record.plan || planMap.get(record.plan_id) || null,
        territories
      };
      return mapActiveSubscriptionRecord(recordWithJoins, { includeTerritories: true });
    }));

    const totals = await activeSubscriptionsService.calculateActiveSubscriptionsTotals(filters);

    const totalRecords = count || 0;
    const totalPages = totalRecords ? Math.ceil(totalRecords / pageSize) : 0;

    res.json({
      success: true,
      data: {
        activeSubscriptions,
        pagination: {
          currentPage,
          totalPages,
          totalRecords,
          limit: pageSize
        },
        totals
      }
    });
  } catch (error) {
    console.error('Error getting active subscriptions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch active subscriptions',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * GET /api/admin/active-subscriptions/:id
 * Get single active subscription details
 */
exports.getActiveSubscriptionDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const record = await fetchActiveSubscriptionWithRelations(id);

    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Active subscription not found'
      });
    }

    const [createdByUser, updatedByUser] = await Promise.all([
      fetchUserById(record.created_by || record.createdBy),
      fetchUserById(record.updated_by || record.updatedBy)
    ]);

    const shaped = mapActiveSubscriptionRecord({
      ...record,
      created_by_user: createdByUser,
      updated_by_user: updatedByUser
    }, { includeTerritories: true, includeUsers: true, includeMetadata: true });

    res.json({
      success: true,
      data: shaped
    });
  } catch (error) {
    console.error('Error getting active subscription details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch active subscription details',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * POST /api/admin/active-subscriptions
 * Create new active subscription
 */
exports.createActiveSubscription = async (req, res) => {
  try {
    const {
      agencyId,
      planId,
      subscriptionId,
      startDate,
      endDate,
      monthlyCost,
      billingCycle,
      autoRenew,
      notes,
      territories
    } = req.body;

    // Validate required fields
    if (!agencyId || !planId || !subscriptionId || !startDate || !endDate || !monthlyCost) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    // Calculate total cost
    const totalCost = activeSubscriptionsService.calculateTotalCost(monthlyCost, billingCycle, startDate, endDate);

    const timestamp = new Date().toISOString();

    const insertPayload = {
      agency_id: agencyId,
      plan_id: planId,
      subscription_id: subscriptionId,
      start_date: new Date(startDate).toISOString(),
      end_date: new Date(endDate).toISOString(),
      monthly_cost: toNumber(monthlyCost, 0),
      total_cost: toNumber(totalCost, 0),
      billing_cycle: billingCycle || 'MONTHLY',
      auto_renew: autoRenew !== false,
      notes: notes || null,
      status: 'ACTIVE',
      created_by: req.user?.id || null,
      updated_by: req.user?.id || null,
      created_at: timestamp,
      updated_at: timestamp
    };

    // Use subscriptions table instead of active_subscriptions (which may not exist)
    // Also create corresponding entry in agency_subscriptions for admin portal visibility
    // Derive safe defaults for optional fields
    const statusVal = 'active';
    const territoryCount = Array.isArray(territories) ? territories.length : 0;
    const trialEndDate = null;
    const nextBillingDate = endDate || null;

    const { data: inserted, error } = await supabase
      .from('subscriptions')
      .insert([{
        agency_id: agencyId,
        plan_id: planId,
        status: statusVal,
        start_date: startDate || new Date().toISOString(),
        end_date: endDate || null,
        trial_end_date: trialEndDate,
        next_billing_date: nextBillingDate,
        auto_renew: autoRenew !== false,
        notes: notes,
        current_units: territoryCount || 0
      }])
      .select('id')
      .maybeSingle();
    
    // Mirror to agency_subscriptions for admin portal
    if (inserted && !error) {
      const { data: planInfo } = await supabase
        .from('subscription_plans')
        .select('base_price')
        .eq('id', planId)
        .maybeSingle();
      
      await supabase
        .from('agency_subscriptions')
        .insert([{
          agency_id: agencyId,
          plan_id: planId,
          status: 'active',
          start_date: startDate || new Date().toISOString(),
          end_date: endDate || nextBillingDate,
          trial_end_date: trialEndDate,
          auto_renew: autoRenew !== false,
          monthly_payment: monthlyCost || planInfo?.base_price || 0
        }])
        .select('id')
        .maybeSingle();
    }

    if (error) throw error;

    if (territories && territories.length > 0) {
      await activeSubscriptionsService.addTerritoriesToActiveSubscription(inserted.id, territories);
    }

    const record = await fetchActiveSubscriptionWithRelations(inserted.id);

    res.status(201).json({
      success: true,
      message: 'Active subscription created successfully',
      data: mapActiveSubscriptionRecord(record, { includeTerritories: true })
    });
  } catch (error) {
    console.error('Error creating active subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create active subscription',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * PUT /api/admin/active-subscriptions/:id
 * Update active subscription
 */
exports.updateActiveSubscription = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      endDate,
      status,
      monthlyCost,
      autoRenew,
      notes,
      territories
    } = req.body;

    const existingResponse = await supabase
      .from('subscriptions')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (existingResponse.error) throw existingResponse.error;

    const activeSubscription = existingResponse.data;
    if (!activeSubscription) {
      return res.status(404).json({
        success: false,
        message: 'Active subscription not found'
      });
    }

    // Update fields
    const updateData = {
      updated_by: req.user?.id || null,
      updated_at: new Date().toISOString()
    };

    if (endDate) updateData.end_date = new Date(endDate).toISOString();
    if (status) updateData.status = status;
    if (monthlyCost) {
      updateData.monthly_cost = toNumber(monthlyCost, activeSubscription.monthly_cost);
      updateData.total_cost = activeSubscriptionsService.calculateTotalCost(
        toNumber(monthlyCost, activeSubscription.monthly_cost),
        activeSubscription.billing_cycle,
        activeSubscription.start_date,
        endDate || activeSubscription.end_date
      );
    }
    if (autoRenew !== undefined) updateData.auto_renew = Boolean(autoRenew);
    if (notes !== undefined) updateData.notes = notes;

    // Update subscriptions table and sync to agency_subscriptions
    const { error: updateError } = await supabase
      .from('subscriptions')
      .update({
        end_date: updateData.end_date || null,
        status: updateData.status?.toLowerCase() || null,
        auto_renew: updateData.auto_renew,
        notes: updateData.notes,
        cancelled_at: updateData.status === 'CANCELLED' ? new Date().toISOString() : null,
        cancellation_reason: updateData.status === 'CANCELLED' ? updateData.notes : null
      })
      .eq('id', id);

    if (updateError) throw updateError;

    // Update territories if provided
    if (territories) {
      await activeSubscriptionsService.updateTerritoriesForActiveSubscription(id, territories);
    }

    const record = await fetchActiveSubscriptionWithRelations(id);

    res.json({
      success: true,
      message: 'Active subscription updated successfully',
      data: mapActiveSubscriptionRecord(record, { includeTerritories: true })
    });
  } catch (error) {
    console.error('Error updating active subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update active subscription',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * DELETE /api/admin/active-subscriptions/:id
 * Cancel active subscription
 */
exports.cancelActiveSubscription = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const response = await supabase
      .from('subscriptions')
      .select('id, agency_id')
      .eq('id', id)
      .maybeSingle();

    if (response.error) throw response.error;

    if (!response.data) {
      return res.status(404).json({
        success: false,
        message: 'Active subscription not found'
      });
    }

    // Step 1: Deactivate/delete territories first (before canceling subscription)
    // This prevents FK violation when subscription is cancelled/deleted
    const { error: territoryError } = await supabase
      .from('territories')
      .update({ is_active: false })
      .eq('subscription_id', id);
    
    if (territoryError) {
      console.warn('Warning: Could not deactivate territories:', territoryError.message);
      // Continue anyway - territories may not exist
    }

    // Step 2: Update subscriptions table
    const { error } = await supabase
      .from('subscriptions')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancellation_reason: reason || null,
        current_units: 0 // Reset territory count
      })
      .eq('id', id);
    
    // Step 3: Also update agency_subscriptions if it exists
    if (response.data.agency_id) {
      await supabase
        .from('agency_subscriptions')
        .update({
          status: 'cancelled',
          cancellation_date: new Date().toISOString(),
          cancellation_reason: reason || null
        })
        .eq('agency_id', response.data.agency_id)
        .eq('subscription_id', id);
    }

    if (error) throw error;

    res.json({
      success: true,
      message: 'Active subscription cancelled successfully'
    });
  } catch (error) {
    console.error('Error cancelling active subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel active subscription',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * POST /api/admin/active-subscriptions/:id/renew
 * Renew active subscription
 */
exports.renewActiveSubscription = async (req, res) => {
  try {
    const { id } = req.params;
    const { newEndDate, notes } = req.body;

    const response = await supabase
      .from('subscriptions')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (response.error) throw response.error;

    const activeSubscription = response.data;
    if (!activeSubscription) {
      return res.status(404).json({
        success: false,
        message: 'Active subscription not found'
      });
    }

    const renewalBase = safeDate(newEndDate || activeSubscription.end_date) || new Date();
    const renewalDate = new Date(renewalBase);
    renewalDate.setFullYear(renewalDate.getFullYear() + 1); // Extend by 1 year

    const { error } = await supabase
      .from('subscriptions')
      .update({
        end_date: renewalDate.toISOString(),
        status: 'active',
        next_billing_date: renewalDate.toISOString(),
        notes: notes || activeSubscription.notes || null
      })
      .eq('id', id);

    if (error) throw error;

    const record = await fetchActiveSubscriptionWithRelations(id);

    res.json({
      success: true,
      message: 'Active subscription renewed successfully',
      data: mapActiveSubscriptionRecord(record, { includeTerritories: true })
    });
  } catch (error) {
    console.error('Error renewing active subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to renew active subscription',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * POST /api/admin/active-subscriptions/export
 * Export active subscriptions data
 */
exports.exportActiveSubscriptions = async (req, res) => {
  try {
    const {
      dateRange = 'all',
      status,
      agencyId,
      planId,
      format = 'csv'
    } = req.body;

    const filters = { dateRange, status, agencyId, planId };

    let query;
    if (featureFlags.shouldUseNestedSelects()) {
      query = supabase
        .from('subscriptions')
        .select(`
          *,
          agency:agencies(id, agency_name, email),
          plan:subscription_plans(id, plan_name, base_price)
        `)
        .in('status', ['trial', 'active'])
        .order('start_date', { ascending: false });
    } else {
      query = supabase
        .from('subscriptions')
        .select('*')
        .in('status', ['trial', 'active'])
        .order('start_date', { ascending: false });
    }

    query = activeSubscriptionsService.applyActiveSubscriptionFilters(query, filters);

    let { data, error } = await query;
    if (error && featureFlags.shouldUseNestedSelects() && (error.code === 'PGRST200' || /relation|foreign key|not exist/i.test(error.message))) {
      // Fallback to non-nested
      query = supabase
        .from('subscriptions')
        .select('*')
        .in('status', ['trial', 'active'])
        .order('start_date', { ascending: false });
      query = activeSubscriptionsService.applyActiveSubscriptionFilters(query, filters);
      ({ data, error } = await query);
    }

    if (error) throw error;

    // Batch fetch for export
    const agencyIds = Array.from(new Set((data || []).map(r => r.agency_id).filter(Boolean)));
    const planIds = Array.from(new Set((data || []).map(r => r.plan_id).filter(Boolean)));

    const [agenciesRes, plansRes] = await Promise.all([
      agencyIds.length
        ? supabase.from('agencies').select('id, agency_name, email').in('id', agencyIds)
        : { data: [] },
      planIds.length
        ? supabase.from('subscription_plans').select('id, plan_name').in('id', planIds)
        : { data: [] }
    ]);

    if (agenciesRes.error) throw agenciesRes.error;
    if (plansRes.error) throw plansRes.error;

    const agencyMap = new Map((agenciesRes.data || []).map(a => [a.id, a]));
    const planMap = new Map((plansRes.data || []).map(p => [p.id, p]));

    const shaped = (data || []).map((record) => {
      const recordWithJoins = {
        ...record,
        agency: record.agency || agencyMap.get(record.agency_id) || null,
        plan: record.plan || planMap.get(record.plan_id) || null
      };
      return mapActiveSubscriptionRecord(recordWithJoins, { includeTerritories: false });
    });

    let exportData;
    let contentType;
    let filename;

    if (format === 'csv') {
      exportData = await activeSubscriptionsService.exportToCSV(shaped);
      contentType = 'text/csv';
      filename = `active-subscriptions-${new Date().toISOString().split('T')[0]}.csv`;
    } else if (format === 'json') {
      exportData = JSON.stringify(shaped, null, 2);
      contentType = 'application/json';
      filename = `active-subscriptions-${new Date().toISOString().split('T')[0]}.json`;
    } else {
      return res.status(400).json({
        success: false,
        message: 'Unsupported export format'
      });
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(exportData);
  } catch (error) {
    console.error('Error exporting active subscriptions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export active subscriptions',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};
