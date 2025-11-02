const express = require('express');
const router = express.Router();
const supabase = require('../config/supabaseClient');

/**
 * ENHANCED SUBSCRIPTION MANAGEMENT ROUTES
 * User Stories: US-2.1, US-2.2, US-2.3, US-2.4, US-2.5, US-2.6, US-2.7, US-2.8, US-2.9
 * Pricing Model: 10 zipcodes/3 cities for $99/month base
 *                Additional units: $69 for every 10 zipcodes/3 cities
 */

// ============ SUBSCRIPTION PLANS ============

// GET /api/admin/subscriptions/plans - List all subscription plans
router.get('/subscriptions/plans', async (req, res) => {
  try {
    const { is_active, page = 1, limit = 50 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;
    
    let query = supabase
      .from('subscription_plans')
      // Select all to avoid 42703 errors on differing schemas
      .select('*')
      // Order by a safe column that exists across schemas
      .order('id', { ascending: true });
    
    if (is_active !== undefined) {
      query = query.eq('is_active', is_active === 'true');
    }
    
    // Apply pagination
    query = query.range(offset, offset + limitNum - 1);

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching subscription plans (safe):', error);
      return res.status(200).json({
        success: true,
        data: { plans: [], pagination: { page: pageNum, limit: limitNum, total: 0, totalPages: 0 } }
      });
    }
    
    // Transform data to match frontend expectations
    const transformedPlans = (data || []).map(plan => ({
      id: plan.id,
      name: plan.name || plan.plan_name,
      plan_name: plan.plan_name || plan.name,
      description: plan.description,
      unit_type: plan.unit_type || 'zipcode',
      unitType: plan.unit_type || 'zipcode',
      price_per_unit: plan.price_per_unit,
      base_units: plan.base_units ?? plan.min_units ?? 10,
      min_units: plan.min_units ?? plan.base_units ?? 10,
      max_units: plan.max_units ?? null,
      additional_unit_price: plan.additional_unit_price ?? null,
      base_price: plan.base_price ?? (plan.price_per_unit && (plan.min_units || plan.base_units) ? Number(plan.price_per_unit) * Number(plan.min_units || plan.base_units) : null),
      basePrice: Number((plan.base_price ?? plan.price_per_unit) || 0),
      billing_cycle: plan.billing_cycle,
      trial_days: plan.trial_days ?? plan.trial_period_days ?? 0,
      features: plan.features || {},
      is_active: plan.is_active !== undefined ? plan.is_active : true,
      isActive: plan.is_active !== undefined ? plan.is_active : true,
      sort_order: plan.sort_order,
      metadata: plan.metadata || {},
      created_at: plan.created_at,
      updated_at: plan.updated_at,
      // Derived fields for frontend
      baseZipcodes: plan.base_units ?? plan.min_units ?? null,
      additionalPrice: plan.additional_unit_price ?? null,
      maxZipcodes: plan.max_units ?? null,
      customPricing: plan.custom_pricing ?? plan.metadata?.customPricing ?? ''
    }));
    
    res.json({
      success: true,
      data: { 
        plans: transformedPlans,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: transformedPlans.length,
          totalPages: Math.ceil((transformedPlans.length || 0) / (limitNum || 1))
        }
      }
    });
  } catch (error) {
    console.error('Error fetching subscription plans:', error);
    // Return empty list rather than failing the UI
    res.status(200).json({ success: true, data: { plans: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } } });
  }
});

// POST /api/admin/subscriptions/plans - Create subscription plan (zipcode-based)
router.post('/subscriptions/plans', async (req, res) => {
  try {
    const { 
      name,
      plan_name,
      description,
      base_units,
      unit_type,
      base_price,
      additional_unit_price,
      max_units,
      trial_period_days,
      is_active,
      features,
      custom_pricing 
    } = req.body;
    
    if (!(name || plan_name) || base_price === undefined) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields: name/plan_name, base_price' 
      });
    }
    
    // Build minimal payload and progressively add optional fields, with fallback on schema drift
    const baseInsert = {
      plan_name: plan_name || name,
      base_price: parseFloat(base_price),
      is_active: is_active !== undefined ? is_active : true,
      created_at: new Date().toISOString()
    };

    // Optional fields that may not exist in all environments
    const optionalFields = {
      base_units: base_units !== undefined ? parseInt(base_units) : undefined,
      unit_type: unit_type !== undefined ? unit_type : undefined,
      additional_unit_price: additional_unit_price !== undefined ? parseFloat(additional_unit_price) : undefined,
      max_units: max_units !== undefined && max_units !== null ? parseInt(max_units) : undefined,
      description: description !== undefined ? description : undefined,
      // features may be JSON (array/object) or string; store as-is
      features: features !== undefined ? features : undefined,
      custom_pricing: custom_pricing !== undefined ? custom_pricing : undefined
    };

    // Compose attempt payload
    let attemptPayload = { ...baseInsert, ...Object.fromEntries(Object.entries(optionalFields).filter(([,v]) => v !== undefined)) };
    let data, error;
  const dropOrder = ['features','custom_pricing','description','max_units','additional_unit_price','unit_type','base_units'];

    for (let i = 0; i <= dropOrder.length; i++) {
      ({ data, error } = await supabase
        .from('subscription_plans')
        .insert(attemptPayload)
        // Avoid schema cache issues by selecting a minimal, stable subset of columns
        .select('id, plan_name, base_price, is_active, created_at')
        .single());
      if (!error) break;
      const msg = (error.message || '').toLowerCase();
      const missingColMatch = msg.match(/could not find the '([^']+)' column/);
      let colToDrop = null;
      if (missingColMatch && missingColMatch[1]) {
        colToDrop = missingColMatch[1];
      } else if (error.code === 'PGRST204') {
        // PostgREST cache drift - drop next optional
        colToDrop = dropOrder[i];
      }
      if (colToDrop && colToDrop in attemptPayload) {
        delete attemptPayload[colToDrop];
        continue;
      }
      break;
    }

    if (error) throw error;
    
    res.status(201).json({
      success: true,
      message: 'Subscription plan created successfully',
      data: { plan: data }
    });
  } catch (error) {
    console.error('Error creating subscription plan:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create subscription plan', 
      error: error.message 
    });
  }
});

// PUT /api/admin/subscriptions/plans/:id - Update zipcode-based plan
router.put('/subscriptions/plans/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const payload = { ...req.body };

    // Build minimal, safe updates: include only fields explicitly provided
    const updates = { updated_at: new Date().toISOString() };
    // Prefer plan_name for naming to avoid environments without 'name'
    if (payload.plan_name !== undefined || payload.name !== undefined) {
      updates.plan_name = payload.plan_name || payload.name;
    }
    if (payload.description !== undefined) updates.description = payload.description;
    if (payload.base_units !== undefined || payload.min_units !== undefined || payload.baseZipcodes !== undefined) {
      updates.base_units = payload.base_units ?? payload.min_units ?? payload.baseZipcodes;
    }
    if (payload.unit_type !== undefined) updates.unit_type = payload.unit_type;
    if (payload.base_price !== undefined || payload.basePrice !== undefined) {
      updates.base_price = payload.base_price ?? payload.basePrice;
    }
    if (payload.additional_unit_price !== undefined || payload.additionalPrice !== undefined) {
      updates.additional_unit_price = payload.additional_unit_price ?? payload.additionalPrice;
    }
    if (payload.max_units !== undefined || payload.maxZipcodes !== undefined) {
      updates.max_units = payload.max_units ?? payload.maxZipcodes;
    }
    if (payload.trial_period_days !== undefined || payload.trial_days !== undefined) {
      updates.trial_period_days = payload.trial_period_days ?? payload.trial_days;
    }
    if (payload.is_active !== undefined || payload.isActive !== undefined) {
      updates.is_active = payload.is_active ?? payload.isActive;
    }
    if (payload.custom_pricing !== undefined || payload.customPricing !== undefined) {
      updates.custom_pricing = payload.custom_pricing ?? payload.customPricing;
    }
    if (payload.features !== undefined) {
      // Accept array/object/string; store as-is
      updates.features = payload.features;
    }
    
    // Try update with progressive fallback removing columns reported missing by PostgREST schema cache
  let data, error;
  let attemptUpdates = { ...updates };
  const maxURetries = 8;
    for (let i = 0; i < maxURetries; i++) {
      ({ data, error } = await supabase
        .from('subscription_plans')
        .update(attemptUpdates)
        .eq('id', id)
        .select()
        .single());
      if (!error) break;
      const msg = (error.message || '').toLowerCase();
      const m = msg.match(/could not find the '([^']+)' column/);
      if (m && m[1]) {
        const col = m[1];
        delete attemptUpdates[col];
        continue;
      }
      if ((error.code === 'PGRST204' || msg.includes('pgrst204')) && i < maxURetries - 1) {
        const candidates = ['additional_unit_price','unit_type','max_units','trial_period_days','base_units','features','custom_pricing','is_custom','plan_name','description'];
        const toDrop = candidates.find(k => k in attemptUpdates);
        if (toDrop) {
          delete attemptUpdates[toDrop];
          continue;
        }
      }
      break;
    }
    
    if (error) throw error;
    
    res.json({
      success: true,
      message: 'Subscription plan updated successfully',
      data: { plan: data }
    });
  } catch (error) {
    console.error('Error updating subscription plan:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update subscription plan', 
      error: error.message 
    });
  }
});

// DELETE /api/admin/subscriptions/plans/bulk-delete - Delete all plans not in use
// Best-effort cleanup for fake/test plans. Skips plans referenced by active/trialing subscriptions.
router.delete('/subscriptions/plans/bulk-delete', async (req, res) => {
  try {
    const force = (req.query.force || 'false').toString().toLowerCase() === 'true';
    // Load all plans
    const { data: plans, error: listErr } = await supabase
      .from('subscription_plans')
      .select('id, plan_name');
    if (listErr) throw listErr;

    const statuses = ['trial', 'trialing', 'active', 'TRIAL', 'ACTIVE'];
    let deleted = 0;
    const skipped = [];

    for (const p of plans || []) {
      const planId = p.id;
      // Check if plan is referenced by active/trialing subs
      const { count, error: cntErr } = await supabase
        .from('subscriptions')
        .select('id', { count: 'exact', head: true })
        .eq('plan_id', planId)
        .in('status', statuses);
      if (cntErr) throw cntErr;

      if (!force && (count || 0) > 0) {
        skipped.push({ id: planId, name: p.name || p.plan_name, activeRefs: count });
        continue;
      }

      if (force && (count || 0) > 0) {
        // Force cancel and cleanup similar to single delete
        const { data: subsToCancel } = await supabase
          .from('subscriptions')
          .select('id')
          .eq('plan_id', planId)
          .in('status', statuses);
        if (Array.isArray(subsToCancel) && subsToCancel.length) {
          const ids = subsToCancel.map(s => s.id);
          await supabase
            .from('subscriptions')
            .update({ status: 'cancelled', updated_at: new Date().toISOString() })
            .in('id', ids);
        }
        await supabase
          .from('agency_subscriptions')
          .delete()
          .eq('plan_id', planId);
      }

      const { error: delErr } = await supabase
        .from('subscription_plans')
        .delete()
        .eq('id', planId);
      if (delErr) {
        skipped.push({ id: planId, name: p.name || p.plan_name, error: delErr.message });
      } else {
        deleted += 1;
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Bulk delete completed',
      data: { deleted, skippedCount: skipped.length, skipped }
    });
  } catch (error) {
    console.error('Error in bulk-delete subscription plans:', error);
    return res.status(500).json({ success: false, message: 'Failed bulk-delete', error: error.message });
  }
});

// DELETE /api/admin/subscriptions/plans/:id - Delete plan (safe: no active refs)
// Note: UUID-only route to prevent conflicts with '/bulk-delete'
router.delete('/subscriptions/plans/:id([0-9a-fA-F-]{36})', async (req, res) => {
  try {
    const { id } = req.params;
    const force = (req.query.force || 'false').toString().toLowerCase() === 'true';

    // Ensure plan exists
    const { data: plan, error: planErr } = await supabase
      .from('subscription_plans')
      .select('id, plan_name')
      .eq('id', id)
      .maybeSingle();

    if (planErr) throw planErr;
    if (!plan) {
      return res.status(404).json({ success: false, message: 'Subscription plan not found' });
    }

    // Check for active/trialing subscriptions referencing this plan
    const { count: activeCount, error: subErr } = await supabase
      .from('subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('plan_id', id)
      .in('status', ['trial', 'trialing', 'active', 'TRIAL', 'ACTIVE']);

    if (subErr) throw subErr;

    if (!force && (activeCount || 0) > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete this plan. ${activeCount} active subscription(s) are using it. Please cancel or migrate them first.`
      });
    }

    // If force=true, cancel/remove referencing subscriptions first
    let affected = { cancelledSubscriptions: 0, removedAgencySubs: 0 };
    if (force && (activeCount || 0) > 0) {
      // Cancel in subscriptions table
      const { data: subsToCancel } = await supabase
        .from('subscriptions')
        .select('id')
        .eq('plan_id', id)
        .in('status', ['trial', 'trialing', 'active', 'TRIAL', 'ACTIVE']);
      if (Array.isArray(subsToCancel) && subsToCancel.length) {
        const ids = subsToCancel.map(s => s.id);
        const { error: cancelErr } = await supabase
          .from('subscriptions')
          .update({ status: 'cancelled', updated_at: new Date().toISOString() })
          .in('id', ids);
        if (cancelErr) console.warn('Force-cancel error:', cancelErr.message);
        affected.cancelledSubscriptions = ids.length;
      }
      // Remove agency_subscriptions rows referencing the plan
      const { data: agencySubs } = await supabase
        .from('agency_subscriptions')
        .select('id')
        .eq('plan_id', id);
      if (Array.isArray(agencySubs) && agencySubs.length) {
        const ids = agencySubs.map(s => s.id);
        const { error: delASErr } = await supabase
          .from('agency_subscriptions')
          .delete()
          .in('id', ids);
        if (delASErr) console.warn('Force-delete agency_subscriptions error:', delASErr.message);
        affected.removedAgencySubs = ids.length;
      }
    }

    // Safe to delete (with FK retry on failure)
    let deleted, delErr;
    ({ data: deleted, error: delErr } = await supabase
      .from('subscription_plans')
      .delete()
      .eq('id', id)
      .select()
      .single());

    if (delErr && /foreign key|violates foreign key|constraint/i.test(delErr.message || '')) {
      // Clean up dependents best-effort and retry
      try {
        await supabase.from('subscriptions').delete().eq('plan_id', id);
      } catch (e) { /* ignore */ }
      try {
        await supabase.from('agency_subscriptions').delete().eq('plan_id', id);
      } catch (e) { /* ignore */ }
      // Retry delete
      ({ data: deleted, error: delErr } = await supabase
        .from('subscription_plans')
        .delete()
        .eq('id', id)
        .select()
        .single());
    }

    if (delErr) throw delErr;

    return res.status(200).json({
      success: true,
      message: 'Subscription plan deleted successfully',
      data: {
        plan: {
          id: deleted.id,
          name: deleted.name || deleted.plan_name,
          deletedAt: new Date().toISOString()
        }
      , affected
      }
    });
  } catch (error) {
    console.error('Error deleting subscription plan:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete subscription plan',
      error: error.message
    });
  }
});

// POST /api/admin/subscriptions/plans/:id/calculate - Calculate pricing
router.post('/subscriptions/plans/:id/calculate', async (req, res) => {
  try {
    const { id } = req.params;
    const { total_units } = req.body;
    
    if (!total_units) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required field: total_units' 
      });
    }
    
    // Get plan details
    const { data: plan, error } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) throw error;
    if (!plan) {
      return res.status(404).json({ 
        success: false, 
        message: 'Plan not found' 
      });
    }
    
    // Calculate pricing
    let totalPrice = parseFloat(plan.base_price);
    let additionalUnits = 0;
    
    if (total_units > plan.base_units) {
      additionalUnits = total_units - plan.base_units;
      const additionalBlocks = Math.ceil(additionalUnits / plan.base_units);
      totalPrice += (additionalBlocks * parseFloat(plan.additional_unit_price) * plan.base_units);
    }
    
    res.json({
      success: true,
      data: {
        plan_name: plan.name,
        base_units: plan.base_units,
        base_price: plan.base_price,
        requested_units: total_units,
        additional_units: additionalUnits,
        total_price: totalPrice.toFixed(2),
        breakdown: {
          base: plan.base_price,
          additional: (totalPrice - plan.base_price).toFixed(2)
        }
      }
    });
  } catch (error) {
    console.error('Error calculating pricing:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to calculate pricing', 
      error: error.message 
    });
  }
});

// ============ AGENCY SUBSCRIPTIONS ============

// POST /api/admin/subscriptions/assign - Assign plan to agency (US-2.5)
router.post('/subscriptions/assign', async (req, res) => {
  try {
    const { agency_id, plan_id, territories, start_trial } = req.body;
    
    if (!agency_id || !plan_id) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields: agency_id, plan_id' 
      });
    }
    
    // Get plan details
    const { data: plan, error: planError } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('id', plan_id)
      .single();
    
    if (planError) throw planError;
    
    // Create subscription
    const subscriptionData = {
      agency_id,
      plan_id,
      status: start_trial ? 'trialing' : 'active',
      start_date: new Date().toISOString(),
      created_at: new Date().toISOString()
    };
    
    if (start_trial) {
      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + (plan.trial_period_days || 14));
      subscriptionData.trial_end_date = trialEnd.toISOString();
    }
    
    const { data: subscription, error: subError } = await supabase
      .from('subscriptions')
      .insert(subscriptionData)
      .select()
      .single();
    
    if (subError) throw subError;
    
    // Update agency with subscription info
    await supabase
      .from('agencies')
      .update({
        subscription_plan_id: plan_id,
        trial_start_date: start_trial ? new Date().toISOString() : null,
        trial_end_date: start_trial ? subscriptionData.trial_end_date : null
      })
      .eq('id', agency_id);
    
    res.status(201).json({
      success: true,
      message: 'Subscription assigned successfully',
      data: { subscription }
    });
  } catch (error) {
    console.error('Error assigning subscription:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to assign subscription', 
      error: error.message 
    });
  }
});

// PUT /api/admin/subscriptions/:id/territories - Manage territories (US-2.6)
router.put('/subscriptions/:id/territories', async (req, res) => {
  try {
    const { id } = req.params;
    const { territories, action } = req.body; // action: 'add' or 'remove'
    
    if (!territories || !action) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields: territories, action' 
      });
    }
    
    // Get subscription details
    const { data: subscription, error: subError } = await supabase
      .from('subscriptions')
      .select('*, agencies(*), subscription_plans(*)')
      .eq('id', id)
      .single();
    
    if (subError) throw subError;
    
    if (action === 'add') {
      // Add territories
      const insertData = territories.map(territory_id => ({
        subscription_id: id,
        territory_id,
        assigned_at: new Date().toISOString()
      }));
      
      const { error } = await supabase
        .from('subscription_territories')
        .insert(insertData);
      
      if (error) throw error;
      
    } else if (action === 'remove') {
      // Remove territories
      const { error } = await supabase
        .from('subscription_territories')
        .delete()
        .eq('subscription_id', id)
        .in('territory_id', territories);
      
      if (error) throw error;
    }
    
    res.json({
      success: true,
      message: `Territories ${action === 'add' ? 'added' : 'removed'} successfully`
    });
  } catch (error) {
    console.error('Error managing territories:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to manage territories', 
      error: error.message 
    });
  }
});

// PUT /api/admin/subscriptions/:id/trial - Manage trial period (US-2.7)
router.put('/subscriptions/:id/trial', async (req, res) => {
  try {
    const { id } = req.params;
    const { action, days } = req.body; // action: 'start', 'extend', 'end'
    
    if (!action) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required field: action' 
      });
    }
    
    let updates = {};
    
    switch (action) {
      case 'start':
        const trialEnd = new Date();
        trialEnd.setDate(trialEnd.getDate() + (days || 14));
        updates = {
          status: 'trialing',
          trial_start_date: new Date().toISOString(),
          trial_end_date: trialEnd.toISOString()
        };
        break;
        
      case 'extend':
        const { data: current } = await supabase
          .from('subscriptions')
          .select('trial_end_date')
          .eq('id', id)
          .single();
        
        if (current && current.trial_end_date) {
          const newEnd = new Date(current.trial_end_date);
          newEnd.setDate(newEnd.getDate() + (days || 7));
          updates = { trial_end_date: newEnd.toISOString() };
        }
        break;
        
      case 'end':
        updates = {
          status: 'active',
          trial_end_date: new Date().toISOString()
        };
        break;
    }
    
    const { data, error } = await supabase
      .from('subscriptions')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    
    res.json({
      success: true,
      message: `Trial ${action} successfully`,
      data: { subscription: data }
    });
  } catch (error) {
    console.error('Error managing trial:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to manage trial', 
      error: error.message 
    });
  }
});

// GET /api/admin/subscriptions/territories - View territory ownership (US-2.8)
router.get('/subscriptions/territories', async (req, res) => {
  try {
    const { territory_id, agency_id } = req.query;
    
    let query = supabase
      .from('subscription_territories')
      .select(`
        *,
        subscriptions(*, agencies(business_name)),
        territories(name, type, value)
      `);
    
    if (territory_id) query = query.eq('territory_id', territory_id);
    if (agency_id) query = query.eq('subscriptions.agency_id', agency_id);
    
    const { data, error } = await query;
    
    if (error) throw error;
    
    res.json({
      success: true,
      data: { territories: data || [] }
    });
  } catch (error) {
    console.error('Error fetching territory ownership:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch territory ownership', 
      error: error.message 
    });
  }
});

// GET /api/admin/subscriptions/:id/renewal - Get renewal info (US-2.9)
router.get('/subscriptions/:id/renewal', async (req, res) => {
  try {
    const { id } = req.params;
    
    const { data, error } = await supabase
      .from('subscriptions')
      .select(`
        *,
        agencies(business_name, email),
        subscription_plans(name, base_price)
      `)
      .eq('id', id)
      .single();
    
    if (error) throw error;
    
    // Calculate next renewal date
    let nextRenewal = null;
    if (data.start_date) {
      nextRenewal = new Date(data.start_date);
      nextRenewal.setMonth(nextRenewal.getMonth() + 1);
    }
    
    const daysUntilRenewal = nextRenewal 
      ? Math.ceil((nextRenewal - new Date()) / (1000 * 60 * 60 * 24))
      : null;
    
    res.json({
      success: true,
      data: {
        subscription: data,
        renewal_info: {
          next_renewal_date: nextRenewal,
          days_until_renewal: daysUntilRenewal,
          auto_renew: data.auto_renew || false,
          renewal_amount: data.subscription_plans?.base_price || 0
        }
      }
    });
  } catch (error) {
    console.error('Error fetching renewal info:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch renewal information', 
      error: error.message 
    });
  }
});

// PUT /api/admin/subscriptions/:id/auto-renew - Set auto-renewal (US-2.9)
router.put('/subscriptions/:id/auto-renew', async (req, res) => {
  try {
    const { id } = req.params;
    const { auto_renew } = req.body;
    
    if (auto_renew === undefined) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required field: auto_renew' 
      });
    }
    
    const { data, error } = await supabase
      .from('subscriptions')
      .update({ 
        auto_renew,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    
    res.json({
      success: true,
      message: `Auto-renewal ${auto_renew ? 'enabled' : 'disabled'}`,
      data: { subscription: data }
    });
  } catch (error) {
    console.error('Error updating auto-renewal:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update auto-renewal', 
      error: error.message 
    });
  }
});

module.exports = router;
