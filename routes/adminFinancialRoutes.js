const express = require('express');
const router = express.Router();
const supabase = require('../config/supabaseClient');
const { authenticateAdmin } = require('../middleware/adminAuth');

/**
 * FINANCIAL MANAGEMENT ROUTES - SUPER ADMIN PORTAL
 * Connects to: frontend/scripts/app.js - Financial Operations section
 * Database: billing_history, transactions, subscriptions tables
 */

// Apply admin authentication to all routes
router.use(authenticateAdmin);

// GET /api/admin/financial/invoices - List all invoices with pagination
router.get('/financial/invoices', async (req, res) => {
  try {
    const { page = 1, limit = 25, status, agency_id, start_date, end_date } = req.query;
    
    let query = supabase
      .from('billing_history')
      .select(`
        *,
        agencies(id, business_name, email)
      `, { count: 'exact' });
    
    // Filter by status
    if (status) query = query.eq('status', status);
    
    // Filter by agency
    if (agency_id) query = query.eq('agency_id', agency_id);
    
    // Date range filter
    if (start_date) query = query.gte('created_at', start_date);
    if (end_date) query = query.lte('created_at', end_date);
    
    // Pagination
    const offset = (page - 1) * limit;
    query = query
      .range(offset, offset + parseInt(limit) - 1)
      .order('created_at', { ascending: false });
    
    const { data, error, count } = await query;
    
    if (error) throw error;
    
    res.json({
      success: true,
      data: {
        invoices: data,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count,
          totalPages: Math.ceil(count / limit)
        }
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
});

// GET /api/admin/financial/invoices/:id - Get invoice details
router.get('/financial/invoices/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const { data, error } = await supabase
      .from('billing_history')
      .select(`
        *,
        agencies(id, business_name, email, contact_phone, address)
      `)
      .eq('id', id)
      .single();
    
    if (error) throw error;
    if (!data) {
      return res.status(404).json({ 
        success: false, 
        message: 'Invoice not found' 
      });
    }
    
    res.json({ 
      success: true, 
      data: { invoice: data } 
    });
  } catch (error) {
    console.error('Error fetching invoice:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch invoice details', 
      error: error.message 
    });
  }
});

// POST /api/admin/financial/invoices - Generate new invoice
router.post('/financial/invoices', async (req, res) => {
  try {
    const { 
      agency_id, 
      subscription_id, 
      amount, 
      description, 
      due_date, 
      items 
    } = req.body;
    
    // Validation
    if (!agency_id || !amount) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields: agency_id, amount' 
      });
    }
    
    // Generate invoice number
    const invoiceNumber = `INV-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    
    // Create invoice
    const { data, error } = await supabase
      .from('billing_history')
      .insert({
        agency_id,
        subscription_id: subscription_id || null,
        invoice_number: invoiceNumber,
        amount: parseFloat(amount),
        description: description || 'Subscription Fee',
        status: 'pending',
        due_date: due_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
        items: items || [],
        created_at: new Date().toISOString()
      })
      .select(`
        *,
        agencies(business_name, email)
      `)
      .single();
    
    if (error) throw error;
    
    // Log to audit
    try {
      await supabase
        .from('audit_logs')
        .insert({
          user_id: req.user?.id || null,
          action: 'CREATE_INVOICE',
          entity_type: 'billing_history',
          entity_id: data.id,
          changes: { invoice_number: invoiceNumber, amount },
          ip_address: req.ip,
          created_at: new Date().toISOString()
        });
    } catch (err) {
      console.log('Audit log not recorded');
    }
    
    res.status(201).json({ 
      success: true, 
      message: 'Invoice created successfully',
      data: { invoice: data } 
    });
  } catch (error) {
    console.error('Error creating invoice:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create invoice', 
      error: error.message 
    });
  }
});

// GET /api/admin/financial/payments - List all payments
router.get('/financial/payments', async (req, res) => {
  try {
    const { page = 1, limit = 25, status, agency_id, payment_method } = req.query;
    
    let query = supabase
      .from('transactions')
      .select(`
        *,
        agencies(id, business_name, email)
      `, { count: 'exact' });
    
    // Filter by type (payment)
    query = query.eq('type', 'payment');
    
    // Filter by status
    if (status) query = query.eq('status', status);
    
    // Filter by agency
    if (agency_id) query = query.eq('agency_id', agency_id);
    
    // Filter by payment method
    if (payment_method) query = query.eq('gateway', payment_method);
    
    // Pagination
    const offset = (page - 1) * limit;
    query = query
      .range(offset, offset + parseInt(limit) - 1)
      .order('created_at', { ascending: false });
    
    const { data, error, count } = await query;
    
    if (error) throw error;
    
    res.json({
      success: true,
      data: {
        payments: data,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count,
          totalPages: Math.ceil(count / limit)
        }
      }
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

// POST /api/admin/financial/payments - Record new payment
router.post('/financial/payments', async (req, res) => {
  try {
    const { 
      agency_id, 
      invoice_id, 
      amount, 
      payment_method, 
      transaction_id, 
      notes 
    } = req.body;
    
    // Validation
    if (!agency_id || !amount || !payment_method) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields: agency_id, amount, payment_method' 
      });
    }
    
    // Record payment transaction
    const { data: payment, error: paymentError } = await supabase
      .from('transactions')
      .insert({
        agency_id,
        type: 'payment',
        amount: parseFloat(amount),
        gateway: payment_method,
        status: 'completed',
        transaction_id: transaction_id || `TXN-${Date.now()}`,
        metadata: { notes, invoice_id },
        created_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (paymentError) throw paymentError;
    
    // Update invoice status if invoice_id provided
    if (invoice_id) {
      const { error: invoiceError } = await supabase
        .from('billing_history')
        .update({ 
          status: 'paid',
          paid_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', invoice_id);
      
      if (invoiceError) console.error('Failed to update invoice:', invoiceError);
    }
    
    // Log to audit
    try {
      await supabase
        .from('audit_logs')
        .insert({
          user_id: req.user?.id || null,
          action: 'RECORD_PAYMENT',
          entity_type: 'transactions',
          entity_id: payment.id,
          changes: { amount, payment_method, invoice_id },
          ip_address: req.ip,
          created_at: new Date().toISOString()
        });
    } catch (err) {
      console.log('Audit log not recorded');
    }
    
    res.status(201).json({ 
      success: true, 
      message: 'Payment recorded successfully',
      data: { payment } 
    });
  } catch (error) {
    console.error('Error recording payment:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to record payment', 
      error: error.message 
    });
  }
});

// POST /api/admin/financial/refunds - Issue refund
router.post('/financial/refunds', async (req, res) => {
  try {
    const { 
      agency_id, 
      payment_id, 
      amount, 
      reason 
    } = req.body;
    
    // Validation
    if (!agency_id || !payment_id || !amount || !reason) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields: agency_id, payment_id, amount, reason' 
      });
    }
    
    // Get original payment
    const { data: originalPayment, error: fetchError } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', payment_id)
      .single();
    
    if (fetchError || !originalPayment) {
      return res.status(404).json({ 
        success: false, 
        message: 'Original payment not found' 
      });
    }
    
    // Check if refund amount is valid
    if (parseFloat(amount) > parseFloat(originalPayment.amount)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Refund amount exceeds original payment amount' 
      });
    }
    
    // Create refund transaction
    const { data: refund, error: refundError } = await supabase
      .from('transactions')
      .insert({
        agency_id,
        type: 'refund',
        amount: parseFloat(amount),
        gateway: originalPayment.gateway,
        status: 'completed',
        transaction_id: `REFUND-${Date.now()}`,
        metadata: { 
          reason, 
          original_payment_id: payment_id,
          original_transaction_id: originalPayment.transaction_id 
        },
        created_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (refundError) throw refundError;
    
    // Log to audit
    try {
      await supabase
        .from('audit_logs')
        .insert({
          user_id: req.user?.id || null,
          action: 'ISSUE_REFUND',
          entity_type: 'transactions',
          entity_id: refund.id,
          changes: { amount, reason, original_payment_id: payment_id },
          ip_address: req.ip,
          created_at: new Date().toISOString()
        });
    } catch (err) {
      console.log('Audit log not recorded');
    }
    
    res.status(201).json({ 
      success: true, 
      message: 'Refund issued successfully',
      data: { refund } 
    });
  } catch (error) {
    console.error('Error issuing refund:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to issue refund', 
      error: error.message 
    });
  }
});

// GET /api/admin/financial/reports - Financial reports and analytics
router.get('/financial/reports', async (req, res) => {
  try {
    const { period = 'month' } = req.query; // day, week, month, year
    
    // Calculate date range
    let startDate = new Date();
    switch (period) {
      case 'day':
        startDate.setDate(startDate.getDate() - 1);
        break;
      case 'week':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      case 'year':
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
    }
    
    // Total revenue (from payments)
    const { data: payments, error: paymentsError } = await supabase
      .from('transactions')
      .select('amount, created_at')
      .eq('type', 'payment')
      .eq('status', 'completed')
      .gte('created_at', startDate.toISOString());
    
    if (paymentsError) throw paymentsError;
    
    const totalRevenue = payments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
    
    // Total refunds
    const { data: refunds, error: refundsError } = await supabase
      .from('transactions')
      .select('amount, created_at')
      .eq('type', 'refund')
      .eq('status', 'completed')
      .gte('created_at', startDate.toISOString());
    
    if (refundsError) throw refundsError;
    
    const totalRefunds = refunds.reduce((sum, r) => sum + parseFloat(r.amount || 0), 0);
    
    // Outstanding invoices
    const { data: outstanding, error: outstandingError } = await supabase
      .from('billing_history')
      .select('amount')
      .eq('status', 'pending');
    
    if (outstandingError) throw outstandingError;
    
    const totalOutstanding = outstanding.reduce((sum, inv) => sum + parseFloat(inv.amount || 0), 0);
    
    // Active subscriptions count
    const { count: activeSubscriptions } = await supabase
      .from('subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active');
    
    // Revenue by day (for chart)
    const revenueByDay = payments.reduce((acc, payment) => {
      const date = new Date(payment.created_at).toISOString().split('T')[0];
      acc[date] = (acc[date] || 0) + parseFloat(payment.amount || 0);
      return acc;
    }, {});
    
    // Payment methods breakdown
    const { data: paymentMethods, error: methodsError } = await supabase
      .from('transactions')
      .select('gateway, amount')
      .eq('type', 'payment')
      .eq('status', 'completed')
      .gte('created_at', startDate.toISOString());
    
    if (methodsError) throw methodsError;
    
    const methodsBreakdown = paymentMethods.reduce((acc, p) => {
      const method = p.gateway || 'unknown';
      acc[method] = (acc[method] || 0) + parseFloat(p.amount || 0);
      return acc;
    }, {});
    
    res.json({
      success: true,
      data: {
        summary: {
          totalRevenue,
          totalRefunds,
          netRevenue: totalRevenue - totalRefunds,
          totalOutstanding,
          activeSubscriptions: activeSubscriptions || 0
        },
        revenueByDay,
        methodsBreakdown,
        period
      }
    });
  } catch (error) {
    console.error('Error generating financial reports:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to generate financial reports', 
      error: error.message 
    });
  }
});

// GET /api/admin/financial/stats - Quick financial statistics
router.get('/financial/stats', async (req, res) => {
  try {
    // Total revenue all time
    const { data: allPayments } = await supabase
      .from('transactions')
      .select('amount')
      .eq('type', 'payment')
      .eq('status', 'completed');
    
    const totalRevenue = (allPayments || []).reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
    
    // This month revenue
    const firstDayOfMonth = new Date();
    firstDayOfMonth.setDate(1);
    firstDayOfMonth.setHours(0, 0, 0, 0);
    
    const { data: monthPayments } = await supabase
      .from('transactions')
      .select('amount')
      .eq('type', 'payment')
      .eq('status', 'completed')
      .gte('created_at', firstDayOfMonth.toISOString());
    
    const monthRevenue = (monthPayments || []).reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
    
    // Pending invoices
    const { count: pendingCount, data: pendingInvoices } = await supabase
      .from('billing_history')
      .select('amount', { count: 'exact' })
      .eq('status', 'pending');
    
    const pendingAmount = (pendingInvoices || []).reduce((sum, inv) => sum + parseFloat(inv.amount || 0), 0);
    
    // Overdue invoices
    const today = new Date().toISOString();
    const { count: overdueCount } = await supabase
      .from('billing_history')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .lt('due_date', today);
    
    res.json({
      success: true,
      data: {
        totalRevenue,
        monthRevenue,
        pendingInvoices: pendingCount || 0,
        pendingAmount,
        overdueInvoices: overdueCount || 0
      }
    });
  } catch (error) {
    console.error('Error fetching financial stats:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch financial statistics', 
      error: error.message 
    });
  }
});

module.exports = router;
