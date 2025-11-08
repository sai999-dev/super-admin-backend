/**
 * Subscription Plan Routes
 * Serves admin subscription plan APIs backed by the Sequelize/Postgres models
 */

const express = require('express');
const router = express.Router();
// Legacy admin subscription plan routes (prefer /subscriptions/plans in adminEnhancedSubscriptionsRoutes)
const supabase = require('../config/supabaseClient');

// Use proper admin authentication middleware
const { authenticateAdmin } = require('../middleware/adminAuth');

// Apply authentication to all routes
router.use(authenticateAdmin);

/**
 * GET /api/admin/subscription-plans
 * Fetch all subscription plans using the primary Sequelize models
 */
router.get('/subscription-plans', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 25,
      sortBy = 'created_at',
      sortOrder = 'DESC',
      isActive,
      unitType
    } = req.query;

    const offset = (page - 1) * limit;

    // Use Supabase instead of Sequelize for compatibility
    const supabase = require('../config/supabaseClient');
    
    let query = supabase
      .from('subscription_plans')
      .select('*', { count: 'exact' });
    
    if (isActive !== undefined) {
      query = query.eq('is_active', isActive === 'true');
    }
    if (unitType) {
      query = query.eq('unit_type', unitType);
    }
    
    // Apply sorting - map frontend sort fields to database columns
    let sortField = 'created_at';
    if (sortBy === 'created_at') sortField = 'created_at';
    else if (sortBy === 'updated_at') sortField = 'updated_at';
    else if (sortBy === 'name') sortField = 'name';
    else if (sortBy === 'price_per_unit' || sortBy === 'base_price') sortField = 'price_per_unit';
    else if (sortBy === 'sort_order') sortField = 'sort_order';
    
    query = query.order(sortField, { ascending: sortOrder === 'ASC' });
    
    // Apply pagination
    query = query.range(offset, offset + Number(limit) - 1);
    
    const { data: rows, error, count } = await query;
    
    if (error) throw error;

    const transformedData = (rows || []).map(plan => {
      // Handle both Sequelize model format and Supabase row format
      const features = plan.features || {};
      const metadata = plan.metadata || {};
      const baseUnits = plan.min_units || plan.minUnits || features.baseUnits || null;
      const baseZipcodesValue = features.baseZipcodes ?? plan.base_zipcodes ?? baseUnits;
      const baseCitiesValue = features.baseCities ?? plan.base_cities_included ?? baseUnits;
      // additional_unit_price field removed - no longer used
      const customPricingValue = metadata?.customPricing ?? features.customPricing ?? plan.custom_pricing ?? '';
      const descriptionValue = plan.description || metadata?.description || '';
      // Normalize features for clients: prefer array of strings when possible
      let featuresValue = plan.features;
      if (Array.isArray(featuresValue)) {
        // keep as-is
      } else if (typeof featuresValue === 'string') {
        featuresValue = featuresValue.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      } else if (featuresValue && typeof featuresValue === 'object') {
        // keep the object; clients may render key:value or ignore
      } else {
        featuresValue = [];
      }

      return {
        id: plan.id,
        name: plan.name || plan.plan_name,
        plan_name: plan.name || plan.plan_name,
        basePrice: plan.price_per_unit || plan.pricePerUnit || plan.base_price ? Number(plan.price_per_unit || plan.pricePerUnit || plan.base_price) : 0,
        base_price: plan.price_per_unit || plan.pricePerUnit || plan.base_price ? Number(plan.price_per_unit || plan.pricePerUnit || plan.base_price) : 0,
        baseZipcodes: baseZipcodesValue !== null ? Number(baseZipcodesValue) : null,
        base_zipcodes: baseZipcodesValue !== null ? Number(baseZipcodesValue) : null,
        baseCities: baseCitiesValue !== null ? Number(baseCitiesValue) : null,
        base_cities_included: baseCitiesValue !== null ? Number(baseCitiesValue) : null,
        maxZipcodes: plan.max_units || plan.maxUnits !== null ? Number(plan.max_units || plan.maxUnits) : null,
        max_zipcodes: plan.max_units || plan.maxUnits !== null ? Number(plan.max_units || plan.maxUnits) : null,
        maxCities: plan.max_units || plan.maxUnits !== null ? Number(plan.max_units || plan.maxUnits) : null,
        max_cities_allowed: plan.max_units || plan.maxUnits !== null ? Number(plan.max_units || plan.maxUnits) : null,
        customPricing: customPricingValue,
        custom_pricing: customPricingValue,
        description: descriptionValue,
        features: featuresValue,
        isActive: plan.is_active !== undefined ? plan.is_active : (plan.isActive !== undefined ? plan.isActive : true),
        is_active: plan.is_active !== undefined ? plan.is_active : (plan.isActive !== undefined ? plan.isActive : true),
        createdAt: plan.created_at || plan.createdAt,
        updatedAt: plan.updated_at || plan.updatedAt
      };
    });

    res.status(200).json({
      success: true,
      data: {
        plans: transformedData,
        pagination: {
          total: count || 0,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil((count || 0) / limit)
        }
      }
    });

  } catch (error) {
    console.error('Error fetching subscription plans:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch subscription plans',
      error: error.message
    });
  }
});

/**
 * POST /api/admin/subscription-plans
 * Create a new subscription plan using Sequelize
 */
router.post('/subscription-plans', async (req, res) => {
  try {
    console.log('📝 Creating subscription plan with data:', req.body);
    const {
      plan_name,
      name,
      base_price,
      price_per_unit,
      min_units,
      base_units,
      max_units,
      unit_type,
      trial_days,
      trial_period_days,
      description,
      is_active,
    } = req.body;

    const insert = {
      name: plan_name || name,
      description: description || '',
      unit_type: unit_type || 'zipcode',
      base_units: base_units || min_units || 10,
      base_price: parseFloat(base_price ?? price_per_unit ?? 0),
      max_units: max_units ?? null,
      trial_period_days: trial_days ?? trial_period_days ?? 0,
      is_active: is_active ?? true,
      features: req.body.features || {},
      metadata: req.body.metadata || {}
    };

    if (!insert.name) {
      return res.status(400).json({ success: false, message: 'Missing required field: name/plan_name' });
    }

    const { data: created, error } = await supabase
      .from('subscription_plans')
      .insert(insert)
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ success: true, message: 'Subscription plan created successfully', data: { plan: created } });

  } catch (error) {
    console.error('Error creating subscription plan:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create subscription plan',
      error: error.message
    });
  }
});

/**
 * PUT /api/admin/subscription-plans/:id
 * Update an existing plan via Sequelize
 */
router.put('/subscription-plans/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = { ...req.body, updated_at: new Date().toISOString() };

    // Map alternative field names to canonical columns
    if (updates.plan_name && !updates.name) updates.name = updates.plan_name;
    if (updates.base_price === undefined && updates.price_per_unit !== undefined) updates.base_price = updates.price_per_unit;
    if (updates.min_units === undefined && updates.base_units !== undefined) updates.min_units = updates.base_units;

    const { data: updated, error } = await supabase
      .from('subscription_plans')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.status(200).json({ success: true, message: 'Subscription plan updated successfully', data: { plan: updated } });

  } catch (error) {
    console.error('Error updating subscription plan:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update subscription plan',
      error: error.message
    });
  }
});

/**
 * DELETE /api/admin/subscription-plans/:id
 * Delete a plan once no active subscriptions reference it
 */
router.delete('/subscription-plans/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log('Deleting subscription plan:', id);

    // First, check if plan exists
    const planResp = await supabase
      .from('subscription_plans')
      .select('id, plan_name, name')
      .eq('id', id)
      .maybeSingle();

    if (planResp.error) {
      console.error('Error fetching plan:', planResp.error);
      throw planResp.error;
    }

    if (!planResp.data) {
      return res.status(404).json({
        success: false,
        message: 'Subscription plan not found'
      });
    }

    // Check if any subscriptions are using this plan
    const subscriptionsResp = await supabase
      .from('subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('plan_id', id)
      .in('status', ['trial', 'active', 'ACTIVE', 'TRIAL']);

    if (subscriptionsResp.error) {
      console.error('Error checking subscriptions:', subscriptionsResp.error);
      // Continue anyway - might be a schema issue
    }

    const activeCount = subscriptionsResp.count || 0;
    if (activeCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete this plan. ${activeCount} active subscription(s) are using it. Please cancel or migrate them first.`
      });
    }

    // Delete the plan
    const deleteResp = await supabase
      .from('subscription_plans')
      .delete()
      .eq('id', id)
      .select()
      .single();

    if (deleteResp.error) {
      console.error('Error deleting plan:', deleteResp.error);
      throw deleteResp.error;
    }

    res.status(200).json({
      success: true,
      message: 'Subscription plan deleted successfully',
      data: {
        plan: {
          id: deleteResp.data.id,
          name: deleteResp.data.plan_name || deleteResp.data.name,
          deletedAt: new Date().toISOString()
        }
      }
    });

  } catch (error) {
    console.error('Error deleting subscription plan:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete subscription plan',
      error: error.message || error.toString()
    });
  }
});

module.exports = router;
