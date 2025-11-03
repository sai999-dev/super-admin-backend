const express = require('express');
const router = express.Router();
const supabase = require('../config/supabaseClient');
const { authenticateAdmin } = require('../middleware/adminAuth');

// Apply admin authentication to all routes
router.use(authenticateAdmin);

/**
 * GET /api/admin/webhooks/deliveries
 * Get webhook delivery history with filtering
 */
router.get('/webhooks/deliveries', async (req, res) => {
  try {
    const {
      portal_id,
      status,
      page = 1,
      limit = 20
    } = req.query;

    // Try webhook_deliveries table first, fallback to webhook_audit
    let query = supabase
      .from('webhook_deliveries')
      .select('*', { count: 'exact' });

    // If webhook_deliveries doesn't exist, try webhook_audit
    let tableExists = true;
    const { error: testError } = await query.limit(1);
    if (testError && testError.code === '42P01') {
      tableExists = false;
      query = supabase
        .from('webhook_audit')
        .select('*', { count: 'exact' });
    }

    // Apply filters
    if (portal_id) {
      query = query.eq('portal_id', portal_id);
    }
    
    if (status) {
      query = query.eq('status', status);
    }

    // Apply pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);
    query = query
      .range(offset, offset + parseInt(limit) - 1)
      .order('created_at', { ascending: false });

    const { data, error, count } = await query;

    if (error && error.code !== '42P01') throw error;

    // If table doesn't exist, return empty result
    if (error && error.code === '42P01') {
      return res.json({
        success: true,
        data: {
          deliveries: [],
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: 0,
            totalPages: 0
          }
        }
      });
    }

    res.json({
      success: true,
      data: {
        deliveries: data || [],
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count || 0,
          totalPages: Math.ceil((count || 0) / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('Error fetching webhook deliveries:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch webhook deliveries',
      error: error.message
    });
  }
});

/**
 * GET /api/admin/webhooks/stats
 * Get webhook statistics
 */
router.get('/webhooks/stats', async (req, res) => {
  try {
    const {
      portal_id,
      date_from,
      date_to
    } = req.query;

    // Try webhook_deliveries table first
    let query = supabase
      .from('webhook_deliveries')
      .select('status', { count: 'exact' });

    // Check if table exists
    const { error: testError } = await query.limit(1);
    if (testError && testError.code === '42P01') {
      // Try webhook_audit instead
      query = supabase
        .from('webhook_audit')
        .select('status', { count: 'exact' });
    }

    // Apply filters
    if (portal_id) {
      query = query.eq('portal_id', portal_id);
    }
    
    if (date_from) {
      query = query.gte('created_at', date_from);
    }
    
    if (date_to) {
      query = query.lte('created_at', date_to);
    }

    // Get all deliveries to calculate stats
    const { data, error } = await query;

    if (error && error.code !== '42P01') throw error;

    // If table doesn't exist, return default stats
    if (error && error.code === '42P01') {
      return res.json({
        success: true,
        data: {
          totalDeliveries: 0,
          successful: 0,
          failed: 0,
          successRate: 0
        }
      });
    }

    // Calculate statistics
    const totalDeliveries = data?.length || 0;
    const successful = data?.filter(d => d.status === 'success' || d.status === 'completed').length || 0;
    const failed = data?.filter(d => d.status === 'failed' || d.status === 'error').length || 0;
    const successRate = totalDeliveries > 0 ? (successful / totalDeliveries) * 100 : 0;

    res.json({
      success: true,
      data: {
        totalDeliveries,
        successful,
        failed,
        successRate: Number(successRate.toFixed(2))
      }
    });
  } catch (error) {
    console.error('Error fetching webhook stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch webhook statistics',
      error: error.message
    });
  }
});

/**
 * POST /api/admin/webhooks/deliveries/:id/retry
 * Retry a failed webhook delivery
 */
router.post('/webhooks/deliveries/:id/retry', async (req, res) => {
  try {
    const { id } = req.params;

    // Get the original delivery
    let query = supabase
      .from('webhook_deliveries')
      .select('*')
      .eq('id', id)
      .single();

    let { data: delivery, error } = await query;

    // If webhook_deliveries doesn't exist, try webhook_audit
    if (error && error.code === '42P01') {
      query = supabase
        .from('webhook_audit')
        .select('*')
        .eq('id', id)
        .single();
      
      ({ data: delivery, error } = await query);
    }

    if (error) throw error;
    
    if (!delivery) {
      return res.status(404).json({
        success: false,
        message: 'Webhook delivery not found'
      });
    }

    // Retry the webhook (this would typically involve calling the target URL again)
    // For now, we'll just update the status and create a new delivery record
    const retryData = {
      portal_id: delivery.portal_id,
      webhook_url: delivery.webhook_url || delivery.url,
      payload: delivery.payload || delivery.data,
      status: 'pending',
      retry_count: (delivery.retry_count || 0) + 1,
      original_delivery_id: delivery.id,
      created_at: new Date().toISOString()
    };

    // Insert retry delivery
    const { data: retryDelivery, error: insertError } = await supabase
      .from('webhook_deliveries')
      .insert([retryData])
      .select()
      .single();

    // If webhook_deliveries doesn't exist, use webhook_audit
    if (insertError && insertError.code === '42P01') {
      const { data: retryDeliveryAlt, error: insertErrorAlt } = await supabase
        .from('webhook_audit')
        .insert([retryData])
        .select()
        .single();

      if (insertErrorAlt) throw insertErrorAlt;

      return res.json({
        success: true,
        message: 'Webhook retry initiated',
        data: {
          delivery: retryDeliveryAlt
        }
      });
    }

    if (insertError) throw insertError;

    res.json({
      success: true,
      message: 'Webhook retry initiated',
      data: {
        delivery: retryDelivery
      }
    });
  } catch (error) {
    console.error('Error retrying webhook delivery:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retry webhook delivery',
      error: error.message
    });
  }
});

module.exports = router;

