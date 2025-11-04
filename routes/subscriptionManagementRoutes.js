/**
 * Subscription Management Routes
 * Handles Active Subscriptions and Billing & Payments API endpoints
 */

const express = require('express');
const supabase = require('../config/supabaseClient');
const router = express.Router();

// Use admin authentication middleware
const { authenticateAdmin } = require('../middleware/adminAuth');

// Apply authentication to all routes
router.use(authenticateAdmin);

/**
 * GET /api/subscriptions/active
 * Get all agencies with currently active subscriptions
 */
router.get('/subscriptions/active', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search = '',
      planType = '',
      startDate = '',
      endDate = ''
    } = req.query;

    const offset = (page - 1) * limit;

    // Build query - use manual joins to avoid PostgREST relationship issues
    let query = supabase
      .from('subscriptions')
      .select('*', { count: 'exact' })
      .in('status', ['active', 'trial', 'ACTIVE', 'TRIAL']); // Support both lowercase and uppercase

    // Apply filters
    if (startDate) {
      query = query.gte('start_date', startDate);
    }

    if (endDate) {
      query = query.lte('end_date', endDate);
    }

    // Get paginated results
    const { data: subscriptions, error: subError, count } = await query
      .range(offset, offset + limit - 1)
      .order('created_at', { ascending: false });

    if (subError) throw subError;

    // Fetch agencies and plans separately to avoid nested select issues
    const agencyIds = [...new Set((subscriptions || []).map(s => s.agency_id).filter(Boolean))];
    const planIds = [...new Set((subscriptions || []).map(s => s.plan_id).filter(Boolean))];
    const subscriptionIds = [...new Set((subscriptions || []).map(s => s.id).filter(Boolean))];

    const [agenciesResp, plansResp, territoriesResp] = await Promise.all([
      agencyIds.length > 0
        ? supabase.from('agencies').select('id, agency_name, business_name, name, email').in('id', agencyIds)
        : { data: [], error: null },
      planIds.length > 0
        ? supabase.from('subscription_plans').select('id, plan_name, name, base_price').in('id', planIds)
        : { data: [], error: null },
      subscriptionIds.length > 0
        ? supabase.from('territories').select('subscription_id, agency_id').eq('is_active', true).in('subscription_id', subscriptionIds)
        : { data: [], error: null }
    ]);

    if (agenciesResp.error) throw agenciesResp.error;
    if (plansResp.error) throw plansResp.error;
    if (territoriesResp.error) {
      console.warn('Error fetching territories (non-fatal):', territoriesResp.error);
      territoriesResp.data = [];
      territoriesResp.error = null;
    }

    // Build lookup maps
    const agenciesMap = {};
    (agenciesResp.data || []).forEach(agency => {
      agenciesMap[agency.id] = agency;
    });

    const plansMap = {};
    (plansResp.data || []).forEach(plan => {
      plansMap[plan.id] = plan;
    });

    // Count territories per subscription
    const territoriesCount = {};
    if (territoriesResp && territoriesResp.data) {
      (territoriesResp.data || []).forEach(territory => {
        const subId = territory.subscription_id;
        if (subId) {
          territoriesCount[subId] = (territoriesCount[subId] || 0) + 1;
        }
      });
    }

    // Apply search filter after fetching (since we're doing manual joins)
    let filteredSubscriptions = subscriptions || [];
    if (search) {
      const searchLower = search.toLowerCase();
      filteredSubscriptions = filteredSubscriptions.filter(sub => {
        const agency = agenciesMap[sub.agency_id];
        if (!agency) return false;
        const agencyName = (agency.agency_name || agency.business_name || agency.name || '').toLowerCase();
        const agencyEmail = (agency.email || '').toLowerCase();
        return agencyName.includes(searchLower) || agencyEmail.includes(searchLower);
      });
    }

    if (planType) {
      filteredSubscriptions = filteredSubscriptions.filter(sub => {
        const plan = plansMap[sub.plan_id];
        if (!plan) return false;
        const planName = (plan.plan_name || plan.name || '').toLowerCase();
        return planName.includes(planType.toLowerCase());
      });
    }

    // Transform data for frontend
    const transformedData = filteredSubscriptions.map(subscription => {
      const agency = agenciesMap[subscription.agency_id];
      const plan = plansMap[subscription.plan_id];
      return {
        id: subscription.id,
        agencyId: subscription.agency_id,
        planId: subscription.plan_id,
        agencyName: agency ? (agency.agency_name || agency.business_name || agency.name || 'Unknown Agency') : 'Unknown Agency',
        agencyEmail: agency ? (agency.email || '') : '',
        subscriptionPlan: plan ? (plan.plan_name || plan.name || 'Unknown Plan') : 'Unknown Plan',
        startDate: subscription.start_date,
        endDate: subscription.end_date,
        trialEndDate: subscription.trial_end_date,
        nextBillingDate: subscription.next_billing_date,
        status: subscription.status,
        citiesTerritories: territoriesCount[subscription.id] || 0,
        monthlyPayment: plan ? (plan.base_price || 0) : 0,
        currentUnits: subscription.current_units || 0,
        autoRenew: subscription.auto_renew !== false,
        createdAt: subscription.created_at,
        updatedAt: subscription.updated_at
      };
    });

    res.status(200).json({
      success: true,
      data: transformedData,
      total: filteredSubscriptions.length || count || 0,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil((filteredSubscriptions.length || count || 0) / parseInt(limit))
    });

  } catch (error) {
    console.error('Error fetching active subscriptions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch active subscriptions',
      error: error.message
    });
  }
});

/**
 * GET /api/billing/payments
 * Get payment transactions and billing history
 */
router.get('/billing/payments', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search = '',
      status = '',
      paymentMethod = '',
      startDate = '',
      endDate = ''
    } = req.query;

    const offset = (page - 1) * limit;

    // Build query
    let query = supabase
      .from('payments')
      .select(`
        *,
        agencies!inner(name, email)
      `)
      .order('payment_date', { ascending: false });

    // Apply filters
    if (search) {
      query = query.ilike('agencies.name', `%${search}%`);
    }

    if (status) {
      query = query.eq('status', status);
    }

    if (paymentMethod) {
      query = query.eq('payment_method', paymentMethod);
    }

    if (startDate) {
      query = query.gte('payment_date', startDate);
    }

    if (endDate) {
      query = query.lte('payment_date', endDate);
    }

    // Get total count for pagination
    const { count } = await query.select('*', { count: 'exact', head: true });

    // Get paginated results
    const { data, error } = await query
      .range(offset, offset + limit - 1);

    if (error) throw error;

    // Transform data for frontend
    const transformedData = (data || []).map(payment => ({
      id: payment.id,
      agencyName: payment.agencies?.name || 'Unknown Agency',
      agencyEmail: payment.agencies?.email || '',
      transactionId: payment.transaction_id || payment.id,
      paymentDate: payment.payment_date,
      amount: payment.amount,
      paymentMethod: payment.payment_method || 'Unknown',
      invoiceNumber: payment.invoice_number || `INV-${payment.id}`,
      status: payment.status || 'Unknown',
      createdAt: payment.created_at,
      updatedAt: payment.updated_at
    }));

    res.status(200).json({
      success: true,
      data: transformedData,
      total: count || 0,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil((count || 0) / limit)
    });

  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payments',
      error: error.message
    });
  }
});

/**
 * GET /api/billing/payments/export
 * Export payments to CSV
 */
router.get('/billing/payments/export', async (req, res) => {
  try {
    const {
      search = '',
      status = '',
      paymentMethod = '',
      startDate = '',
      endDate = ''
    } = req.query;

    // Build query (no pagination for export)
    let query = supabase
      .from('payments')
      .select(`
        *,
        agencies!inner(name, email)
      `)
      .order('payment_date', { ascending: false });

    // Apply filters
    if (search) {
      query = query.ilike('agencies.name', `%${search}%`);
    }

    if (status) {
      query = query.eq('status', status);
    }

    if (paymentMethod) {
      query = query.eq('payment_method', paymentMethod);
    }

    if (startDate) {
      query = query.gte('payment_date', startDate);
    }

    if (endDate) {
      query = query.lte('payment_date', endDate);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Transform data for CSV
    const csvData = (data || []).map(payment => ({
      'Agency Name': payment.agencies?.name || 'Unknown Agency',
      'Transaction ID': payment.transaction_id || payment.id,
      'Payment Date': payment.payment_date,
      'Amount': payment.amount,
      'Payment Method': payment.payment_method || 'Unknown',
      'Invoice Number': payment.invoice_number || `INV-${payment.id}`,
      'Status': payment.status || 'Unknown'
    }));

    // Convert to CSV
    if (csvData.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No data to export',
        csv: 'Agency Name,Transaction ID,Payment Date,Amount,Payment Method,Invoice Number,Status\n'
      });
    }

    const headers = Object.keys(csvData[0]);
    const csvRows = [
      headers.join(','),
      ...csvData.map(row => 
        headers.map(header => {
          const value = row[header];
          // Escape commas and quotes in CSV
          if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        }).join(',')
      )
    ];

    const csv = csvRows.join('\n');

    res.status(200).json({
      success: true,
      data: csvData,
      csv: csv,
      filename: `payments-export-${new Date().toISOString().split('T')[0]}.csv`
    });

  } catch (error) {
    console.error('Error exporting payments:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export payments',
      error: error.message
    });
  }
});

module.exports = router;
