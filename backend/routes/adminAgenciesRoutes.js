const express = require('express');
const router = express.Router();
const supabase = require('../config/supabaseClient');

const SORT_FIELD_MAP = {
  created_at: 'created_at',
  created_date: 'created_date',
  updated_at: 'updated_at',
  business_name: 'business_name',
  agency_name: 'agency_name',
  email: 'email',
  status: 'status'
};

const DEFAULT_METRICS = () => ({
  territoryCount: 0,
  totalLeads: 0,
  convertedLeads: 0,
  contactedLeads: 0,
  responseHours: [],
  totalSpent: 0,
  conversionRate: 0,
  contactRate: 0,
  avgResponseTimeHours: 0
});

const resolveAgencyId = (record = {}) => record.agency_id || record.id || record.agencyId || null;

const clampLimit = (value, min = 1, max = 100) => {
  const numeric = Number.parseInt(value, 10);
  if (Number.isNaN(numeric)) return min;
  return Math.min(Math.max(numeric, min), max);
};

const sanitizeSortField = (value) => SORT_FIELD_MAP[value] || SORT_FIELD_MAP.created_date;

const parseBoolean = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return value.toLowerCase() === 'true';
  }
  return undefined;
};

const toNumber = (value) => {
  const numeric = Number.parseFloat(value);
  return Number.isFinite(numeric) ? numeric : 0;
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

const applyAgencyIdFilter = (query, agencyId) => query.or(`id.eq.${agencyId},agency_id.eq.${agencyId}`);

const computeAgencyMetrics = async (agencyIds = []) => {
  const metrics = {};
  agencyIds.forEach((id) => {
    metrics[id] = DEFAULT_METRICS();
  });

  if (!agencyIds.length) {
    return metrics;
  }

  // Query territories (this table exists)
  let territoriesResp;
  try {
    territoriesResp = await supabase
      .from('territories')
      .select('agency_id')
      .in('agency_id', agencyIds);
  } catch (e) {
    console.warn('Error fetching territories:', e.message);
    territoriesResp = { data: [], error: null };
  }

  // Query lead_assignments (might not exist)
  let assignmentsResp;
  try {
    assignmentsResp = await supabase
      .from('lead_assignments')
      .select('*')
      .in('agency_id', agencyIds);
    if (assignmentsResp.error && assignmentsResp.error.code === '42P01') {
      // Table doesn't exist, skip
      assignmentsResp = { data: [], error: null };
    }
  } catch (e) {
    console.warn('Error fetching lead_assignments:', e.message);
    assignmentsResp = { data: [], error: null };
  }

  // Query billing_history (might not exist)
  let billingResp;
  try {
    billingResp = await supabase
      .from('billing_history')
      .select('agency_id, total_amount, status')
      .in('agency_id', agencyIds);
    if (billingResp.error && billingResp.error.code === '42P01') {
      // Table doesn't exist, skip
      billingResp = { data: [], error: null };
    }
  } catch (e) {
    console.warn('Error fetching billing_history:', e.message);
    billingResp = { data: [], error: null };
  }

  // Only throw if territories query fails (it should exist)
  if (territoriesResp.error) throw territoriesResp.error;

  (territoriesResp.data || []).forEach((row) => {
    const id = resolveAgencyId(row);
    if (!id) return;
    metrics[id] = metrics[id] || DEFAULT_METRICS();
    metrics[id].territoryCount += 1;
  });

  (assignmentsResp.data || []).forEach((row) => {
    const id = resolveAgencyId(row);
    if (!id) return;
    metrics[id] = metrics[id] || DEFAULT_METRICS();

    metrics[id].totalLeads += 1;

    const status = row.status ? row.status.toString().toLowerCase() : '';
    if (['completed', 'converted', 'accepted'].includes(status)) {
      metrics[id].convertedLeads += 1;
    }

    const contactedAt = row.contacted_at || row.contactedAt || row.accepted_at || row.acceptedAt || null;
    if (contactedAt) {
      metrics[id].contactedLeads += 1;
      const createdAt = row.created_at || row.createdAt || null;
      const hours = diffInHours(createdAt, contactedAt);
      if (hours !== null) {
        metrics[id].responseHours.push(hours);
      }
    }
  });

  (billingResp.data || []).forEach((row) => {
    const id = resolveAgencyId(row);
    if (!id) return;
    metrics[id] = metrics[id] || DEFAULT_METRICS();

    const amount = toNumber(row.total_amount || row.totalAmount);
    const status = row.status ? row.status.toString().toUpperCase() : '';

    if (status === 'REFUNDED') {
      metrics[id].totalSpent -= amount;
    } else if (['COMPLETED', 'PAID'].includes(status)) {
      metrics[id].totalSpent += amount;
    }
  });

  Object.keys(metrics).forEach((id) => {
    const snapshot = metrics[id];
    if (snapshot.totalLeads > 0) {
      snapshot.conversionRate = Number(((snapshot.convertedLeads / snapshot.totalLeads) * 100).toFixed(2));
      snapshot.contactRate = Number(((snapshot.contactedLeads / snapshot.totalLeads) * 100).toFixed(2));
    }
    if (snapshot.responseHours.length > 0) {
      const total = snapshot.responseHours.reduce((sum, value) => sum + value, 0);
      snapshot.avgResponseTimeHours = Number((total / snapshot.responseHours.length).toFixed(2));
    }
  });

  return metrics;
};

const mapAgencyRecord = (record = {}, metrics = DEFAULT_METRICS()) => {
  const agencyId = resolveAgencyId(record);
  const metadata = record.metadata || {};
  const statusRaw = record.status || (record.is_active ? 'ACTIVE' : 'PENDING');
  const status = statusRaw ? statusRaw.toString().toUpperCase() : 'ACTIVE';
  const verified = record.verified !== undefined ? record.verified : metadata.is_verified;
  const verificationStatus = record.verification_status || (verified ? 'VERIFIED' : 'PENDING');

  const businessName = record.business_name
    || record.agency_name
    || record.name
    || metadata.business_name
    || metadata.agency_name
    || 'Unknown Agency';

  const createdAt = record.created_at || record.createdAt || record.created_date || null;
  const updatedAt = record.updated_at || record.updatedAt || null;

  const industry = record.industry
    || record.industry_type
    || metadata.industry
    || metadata.industry_type
    || null;

  const totalSpent = metrics.totalSpent || record.total_spent || 0;
  const conversionRate = metrics.conversionRate || record.conversion_rate || 0;

  return {
    id: agencyId,
    agency_id: agencyId,
    business_name: businessName,
    agency_name: businessName,
    email: record.email || metadata.email || null,
    phone_number: record.phone_number || metadata.phone_number || null,
    status,
    is_active: record.is_active !== undefined ? record.is_active : status === 'ACTIVE',
    industry,
    industry_type: industry,
    is_verified: Boolean(verified),
    verification_status: verificationStatus,
    total_spent: Number(totalSpent.toFixed(2)),
    total_revenue: Number(totalSpent.toFixed(2)),
    conversion_rate: Number(conversionRate),
    total_leads: metrics.totalLeads || 0,
    converted_leads: metrics.convertedLeads || 0,
    territory_count: metrics.territoryCount || 0,
    created_at: createdAt,
    created_date: createdAt,
    updated_at: updatedAt
  };
};

const fetchAgencyStats = async (agencyId) => {
  const metricsMap = await computeAgencyMetrics([agencyId]);
  const metrics = metricsMap[agencyId] || DEFAULT_METRICS();

  const usersResp = await supabase
    .from('users')
    .select('id')
    .eq('agency_id', agencyId);

  if (usersResp.error) throw usersResp.error;

  return {
    total_leads: metrics.totalLeads,
    converted_leads: metrics.convertedLeads,
    contacted_leads: metrics.contactedLeads,
    conversion_rate: metrics.conversionRate,
    contact_rate: metrics.contactRate,
    avg_response_time_hours: metrics.avgResponseTimeHours,
    territory_count: metrics.territoryCount,
    total_users: usersResp.data ? usersResp.data.length : 0
  };
};

const findOrCreateDefaultPlan = async () => {
  const lookup = await supabase
    .from('subscription_plans')
    .select('id, plan_name, base_price')
    .eq('is_active', true)
    .order('base_price', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (lookup.error) throw lookup.error;
  if (lookup.data) return lookup.data;

  const creation = await supabase
    .from('subscription_plans')
    .insert([
      {
        plan_name: 'Admin Default',
        description: 'Auto-created default plan',
        unit_type: 'zipcode',
        base_price: 0,
        base_cities_included: 5,
        is_active: true
      }
    ])
    .select('id, plan_name, base_price')
    .maybeSingle();

  if (creation.error) throw creation.error;
  return creation.data;
};

const mirrorAgencySubscription = async ({ agencyId, plan, monthlyPayment }) => {
  try {
    const now = new Date();
    const nextBilling = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    await supabase
      .from('agency_subscriptions')
      .insert([
        {
          agency_id: agencyId,
          plan_id: plan.id,
          status: 'active',
          zipcodes: [],
          cities: [],
          start_date: now.toISOString(),
          end_date: nextBilling.toISOString(),
          auto_renew: true,
          monthly_payment: monthlyPayment ?? plan.base_price ?? 0,
          trial_end_date: null,
          created_at: now.toISOString(),
          updated_at: now.toISOString(),
          metadata: { source: 'admin_auto_provision' }
        }
      ]);
  } catch (error) {
    console.warn('Warning: failed to mirror agency_subscriptions entry:', error.message);
  }
};

const fetchAgencyById = async (agencyId) => {
  const response = await applyAgencyIdFilter(
    supabase.from('agencies').select('*'),
    agencyId
  ).maybeSingle();

  if (response.error) throw response.error;
  return response.data;
};

router.get('/agencies', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 25,
      search = '',
      status = '',
      industry = '',
      sortBy = 'created_date',
      sortOrder = 'DESC'
    } = req.query;

    const currentPage = Math.max(Number.parseInt(page, 10) || 1, 1);
    const pageSize = clampLimit(limit);
    const offset = (currentPage - 1) * pageSize;
    const sortField = sanitizeSortField(sortBy.toString().toLowerCase());
    const ascending = sortOrder.toString().toUpperCase() === 'ASC';

    let query = supabase
      .from('agencies')
      .select('*', { count: 'exact' });

    if (search) {
      query = query.or([
        `business_name.ilike.%${search}%`,
        `agency_name.ilike.%${search}%`,
        `name.ilike.%${search}%`,
        `email.ilike.%${search}%`
      ].join(','));
    }

    if (status === 'active') {
      query = query.eq('is_active', true);
    } else if (status === 'inactive') {
      query = query.eq('is_active', false);
    } else if (status) {
      query = query.eq('status', status.toUpperCase());
    }

    if (industry) {
      query = query.or([
        `industry.eq.${industry}`,
        `industry_type.eq.${industry}`,
        `metadata->>industry.eq.${industry}`,
        `metadata->>industry_type.eq.${industry}`
      ].join(','));
    }

    const { data, count, error } = await query
      .order(sortField, { ascending })
      .range(offset, offset + pageSize - 1);

    if (error) throw error;

    const agencies = data || [];
    const agencyIds = agencies.map(resolveAgencyId).filter(Boolean);
    const metrics = await computeAgencyMetrics(agencyIds);

    const enriched = agencies.map((agency) => {
      const id = resolveAgencyId(agency);
      return mapAgencyRecord(agency, metrics[id] || DEFAULT_METRICS());
    });

    res.json({
      success: true,
      data: {
        agencies: enriched,
        pagination: {
          total: count ?? enriched.length,
          page: currentPage,
          limit: pageSize,
          totalPages: count ? Math.ceil(count / pageSize) : 1
        }
      }
    });
  } catch (error) {
    console.error('Error fetching agencies:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch agencies',
      error: error.message
    });
  }
});

router.get('/agencies/:agencyId', async (req, res) => {
  try {
    const { agencyId } = req.params;
    const agency = await fetchAgencyById(agencyId);

    if (!agency) {
      return res.status(404).json({
        success: false,
        message: 'Agency not found'
      });
    }

    const mappedId = resolveAgencyId(agency);
    const metrics = await computeAgencyMetrics([mappedId]);
    const stats = await fetchAgencyStats(mappedId);

    res.json({
      success: true,
      data: {
        ...mapAgencyRecord(agency, metrics[mappedId] || DEFAULT_METRICS()),
        stats
      }
    });
  } catch (error) {
    console.error('Error fetching agency details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch agency details',
      error: error.message
    });
  }
});

router.post('/agencies', async (req, res) => {
  try {
    const {
      business_name,
      agency_name,
      email,
      password,
      phone_number,
      industry_type,
      industry,
      is_verified,
      is_active
    } = req.body;

    const desiredName = business_name || agency_name;

    if (!desiredName) {
      return res.status(400).json({
        success: false,
        message: 'Agency name is required'
      });
    }

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    const existing = await supabase
      .from('agencies')
      .select('id')
      .ilike('email', email)
      .maybeSingle();

    if (existing.error) throw existing.error;
    if (existing.data) {
      return res.status(400).json({
        success: false,
        message: 'An agency with this email already exists'
      });
    }

    const now = new Date();
    const metadata = {
      industry: industry_type || industry || null,
      source: 'admin_portal',
      phone_number,
      temp_password_set: Boolean(password)
    };

    const status = parseBoolean(is_active) === false ? 'PENDING' : 'ACTIVE';
    const verified = parseBoolean(is_verified) === true;

    const creation = await supabase
      .from('agencies')
      .insert([
        {
          business_name: desiredName,
          agency_name: desiredName,
          name: desiredName,
          email,
          phone_number,
          industry: industry_type || industry || null,
          status,
          verification_status: verified ? 'VERIFIED' : 'PENDING',
          is_active: parseBoolean(is_active) !== false,
          created_date: now.toISOString().split('T')[0],
          created_at: now.toISOString(),
          updated_at: now.toISOString(),
          metadata
        }
      ])
      .select('*')
      .single();

    if (creation.error) throw creation.error;

    const newAgency = creation.data;
    const newAgencyId = resolveAgencyId(newAgency);

    let defaultPlan;
    try {
      defaultPlan = await findOrCreateDefaultPlan();
    } catch (planError) {
      console.warn('Warning: could not resolve default plan:', planError.message);
    }

    if (defaultPlan) {
      await mirrorAgencySubscription({
        agencyId: newAgencyId,
        plan: defaultPlan,
        monthlyPayment: 0
      });
    }

    res.status(201).json({
      success: true,
      message: 'Agency created successfully',
      data: mapAgencyRecord(newAgency)
    });
  } catch (error) {
    console.error('Error creating agency:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create agency',
      error: error.message
    });
  }
});

router.put('/agencies/:agencyId', async (req, res) => {
  try {
    const { agencyId } = req.params;
    const {
      business_name,
      agency_name,
      email,
      phone_number,
      industry_type,
      industry,
      is_verified,
      is_active
    } = req.body;

    const existing = await fetchAgencyById(agencyId);

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Agency not found'
      });
    }

    const metadata = {
      ...(existing.metadata || {}),
      industry: industry_type || industry || existing.metadata?.industry || null,
      phone_number: phone_number || existing.metadata?.phone_number
    };

    const updates = {
      updated_at: new Date().toISOString(),
      metadata
    };

    const desiredName = business_name || agency_name;
    if (desiredName) {
      updates.business_name = desiredName;
      updates.agency_name = desiredName;
      updates.name = desiredName;
    }
    if (email) updates.email = email;
    if (phone_number !== undefined) updates.phone_number = phone_number;
    if (industry_type || industry) updates.industry = industry_type || industry;

    if (is_verified !== undefined) {
      const verified = parseBoolean(is_verified);
      updates.verification_status = verified ? 'VERIFIED' : 'PENDING';
    }

    if (is_active !== undefined) {
      const active = parseBoolean(is_active) !== false;
      updates.is_active = active;
      updates.status = active ? 'ACTIVE' : 'PENDING';
    }

    const updateResp = await applyAgencyIdFilter(
      supabase.from('agencies').update(updates).select('*'),
      agencyId
    ).single();

    if (updateResp.error) throw updateResp.error;

    const metrics = await computeAgencyMetrics([resolveAgencyId(updateResp.data)]);

    res.json({
      success: true,
      message: 'Agency updated successfully',
      data: mapAgencyRecord(updateResp.data, metrics[resolveAgencyId(updateResp.data)] || DEFAULT_METRICS())
    });
  } catch (error) {
    console.error('Error updating agency:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update agency',
      error: error.message
    });
  }
});

router.put('/agencies/:agencyId/status', async (req, res) => {
  try {
    const { agencyId } = req.params;
    const { is_active, reason } = req.body;

    if (is_active === undefined) {
      return res.status(400).json({
        success: false,
        message: 'is_active field is required'
      });
    }

    const active = parseBoolean(is_active) !== false;

    const updateResp = await applyAgencyIdFilter(
      supabase
        .from('agencies')
        .update({
          status: active ? 'ACTIVE' : 'PENDING',
          is_active: active,
          updated_at: new Date().toISOString()
        })
        .select('*'),
      agencyId
    ).single();

    if (updateResp.error) throw updateResp.error;
    if (!updateResp.data) {
      return res.status(404).json({
        success: false,
        message: 'Agency not found'
      });
    }

    const agencyKey = resolveAgencyId(updateResp.data);

    await supabase
      .from('users')
      .update({ is_active: active })
      .eq('agency_id', agencyKey);

    await supabase
      .from('audit_logs')
      .insert([
        {
          actor_id: req.user?.id || 'system',
          actor_email: req.user?.email || 'system',
          action: active ? 'ACTIVATE_AGENCY' : 'SUSPEND_AGENCY',
          resource_type: 'AGENCY',
          resource_id: agencyKey,
          metadata: { reason: reason || 'No reason provided' },
          created_at: new Date().toISOString()
        }
      ]);

    res.json({
      success: true,
      message: `Agency ${active ? 'activated' : 'suspended'} successfully`,
      data: mapAgencyRecord(updateResp.data)
    });
  } catch (error) {
    console.error('Error updating agency status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update agency status',
      error: error.message
    });
  }
});

router.get('/agencies/:agencyId/stats', async (req, res) => {
  try {
    const { agencyId } = req.params;
    const stats = await fetchAgencyStats(agencyId);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching agency stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch agency statistics',
      error: error.message
    });
  }
});

router.delete('/agencies/:agencyId', async (req, res) => {
  try {
    const { agencyId } = req.params;

    const existing = await fetchAgencyById(agencyId);

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Agency not found'
      });
    }

    const updateResp = await applyAgencyIdFilter(
      supabase
        .from('agencies')
        .update({
          status: 'DELETED',
          is_active: false,
          updated_at: new Date().toISOString()
        })
        .select('*'),
      agencyId
    ).single();

    if (updateResp.error) throw updateResp.error;

    res.json({
      success: true,
      message: 'Agency deleted successfully',
      data: {
        id: resolveAgencyId(updateResp.data),
        agency_id: resolveAgencyId(updateResp.data),
        business_name: updateResp.data.business_name || updateResp.data.agency_name,
        email: updateResp.data.email
      }
    });
  } catch (error) {
    console.error('Error deleting agency:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete agency',
      error: error.message
    });
  }
});

module.exports = router;
