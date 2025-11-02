/**
 * Subscription Plans Controller
 * Handles CRUD operations for subscription plans
 */

const { SubscriptionPlan, Subscription, AuditLog } = require('../models');
const { Op } = require('sequelize');

/**
 * GET /api/admin/subscription-plans
 * List all subscription plans with pricing tiers
 */
exports.getAllPlans = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 25,
      sortBy = 'sort_order',
      sortOrder = 'ASC',
      isActive,
      unitType
    } = req.query;

    const offset = (page - 1) * limit;
    const where = {};

    // Filters
    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }

    if (unitType) {
      where.unitType = unitType;
    }

    // Fetch plans
    const { count, rows: plans } = await SubscriptionPlan.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [[sortBy, sortOrder.toUpperCase()]],
      include: [
        {
          model: Subscription,
          as: 'subscriptions',
          attributes: ['id', 'status'],
          required: false
        }
      ]
    });

    // Calculate subscription counts
    const plansWithStats = plans.map(plan => {
      const planData = plan.toJSON();
      planData.activeSubscriptions = planData.subscriptions?.filter(s => s.status === 'active').length || 0;
      planData.totalSubscriptions = planData.subscriptions?.length || 0;
      delete planData.subscriptions;
      return planData;
    });

    res.status(200).json({
      success: true,
      data: {
        plans: plansWithStats,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(count / limit)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching subscription plans:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch subscription plans',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * GET /api/admin/subscription-plans/:planId
 * Get a single subscription plan by ID
 */
exports.getPlanById = async (req, res) => {
  try {
    const { planId } = req.params;

    const plan = await SubscriptionPlan.findByPk(planId, {
      include: [
        {
          model: Subscription,
          as: 'subscriptions',
          attributes: ['id', 'status', 'agencyId', 'currentUnits'],
          required: false
        }
      ]
    });

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Subscription plan not found'
      });
    }

    const planData = plan.toJSON();
    planData.activeSubscriptions = planData.subscriptions?.filter(s => s.status === 'active').length || 0;
    planData.totalSubscriptions = planData.subscriptions?.length || 0;

    res.status(200).json({
      success: true,
      data: planData
    });
  } catch (error) {
    console.error('Error fetching subscription plan:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch subscription plan',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * POST /api/admin/subscription-plans
 * Create a new subscription plan
 */
exports.createPlan = async (req, res) => {
  try {
    const {
      name,
      description,
      unitType,
      pricePerUnit,
      maxUnits,
      minUnits,
      billingCycle,
      trialDays,
      features,
      isActive,
      sortOrder,
      metadata
    } = req.body;

    // Validation
    if (!name || !unitType || pricePerUnit === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: name, unitType, pricePerUnit'
      });
    }

    if (pricePerUnit < 0) {
      return res.status(400).json({
        success: false,
        message: 'Price per unit must be non-negative'
      });
    }

    if (maxUnits && minUnits && maxUnits < minUnits) {
      return res.status(400).json({
        success: false,
        message: 'Max units cannot be less than min units'
      });
    }

    // Check for duplicate name
    const existingPlan = await SubscriptionPlan.findOne({ where: { name } });
    if (existingPlan) {
      return res.status(409).json({
        success: false,
        message: 'A subscription plan with this name already exists'
      });
    }

    // Create plan
    const plan = await SubscriptionPlan.create({
      name,
      description,
      unitType,
      pricePerUnit,
      maxUnits: maxUnits || null,
      minUnits: minUnits || 1,
      billingCycle: billingCycle || 'monthly',
      trialDays: trialDays || 0,
      features: features || {},
      isActive: isActive !== undefined ? isActive : true,
      sortOrder: sortOrder || 0,
      metadata: metadata || {}
    });

    // Create audit log
    await AuditLog.create({
      userId: req.user?.id,
      action: 'subscription_plan_created',
      resourceType: 'subscription_plan',
      resourceId: plan.id,
      details: {
        planName: plan.name,
        unitType: plan.unitType,
        pricePerUnit: plan.pricePerUnit
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.status(201).json({
      success: true,
      message: 'Subscription plan created successfully',
      data: plan
    });
  } catch (error) {
    console.error('Error creating subscription plan:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create subscription plan',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * PUT /api/admin/subscription-plans/:planId
 * Update an existing subscription plan
 */
exports.updatePlan = async (req, res) => {
  try {
    const { planId } = req.params;
    const {
      name,
      description,
      pricePerUnit,
      maxUnits,
      minUnits,
      billingCycle,
      trialDays,
      features,
      isActive,
      sortOrder,
      metadata
    } = req.body;

    const plan = await SubscriptionPlan.findByPk(planId);

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Subscription plan not found'
      });
    }

    // Validation
    if (pricePerUnit !== undefined && pricePerUnit < 0) {
      return res.status(400).json({
        success: false,
        message: 'Price per unit must be non-negative'
      });
    }

    const newMaxUnits = maxUnits !== undefined ? maxUnits : plan.maxUnits;
    const newMinUnits = minUnits !== undefined ? minUnits : plan.minUnits;

    if (newMaxUnits && newMinUnits && newMaxUnits < newMinUnits) {
      return res.status(400).json({
        success: false,
        message: 'Max units cannot be less than min units'
      });
    }

    // Check for duplicate name if name is being changed
    if (name && name !== plan.name) {
      const existingPlan = await SubscriptionPlan.findOne({ where: { name } });
      if (existingPlan) {
        return res.status(409).json({
          success: false,
          message: 'A subscription plan with this name already exists'
        });
      }
    }

    // Store old values for audit
    const oldValues = {
      name: plan.name,
      pricePerUnit: plan.pricePerUnit,
      maxUnits: plan.maxUnits,
      isActive: plan.isActive
    };

    // Update plan
    await plan.update({
      name: name !== undefined ? name : plan.name,
      description: description !== undefined ? description : plan.description,
      pricePerUnit: pricePerUnit !== undefined ? pricePerUnit : plan.pricePerUnit,
      maxUnits: maxUnits !== undefined ? maxUnits : plan.maxUnits,
      minUnits: minUnits !== undefined ? minUnits : plan.minUnits,
      billingCycle: billingCycle !== undefined ? billingCycle : plan.billingCycle,
      trialDays: trialDays !== undefined ? trialDays : plan.trialDays,
      features: features !== undefined ? features : plan.features,
      isActive: isActive !== undefined ? isActive : plan.isActive,
      sortOrder: sortOrder !== undefined ? sortOrder : plan.sortOrder,
      metadata: metadata !== undefined ? metadata : plan.metadata
    });

    // Create audit log
    await AuditLog.create({
      userId: req.user?.id,
      action: 'subscription_plan_updated',
      resourceType: 'subscription_plan',
      resourceId: plan.id,
      details: {
        planName: plan.name,
        oldValues,
        newValues: {
          name: plan.name,
          pricePerUnit: plan.pricePerUnit,
          maxUnits: plan.maxUnits,
          isActive: plan.isActive
        }
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.status(200).json({
      success: true,
      message: 'Subscription plan updated successfully. Changes will affect new subscriptions only.',
      data: plan
    });
  } catch (error) {
    console.error('Error updating subscription plan:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update subscription plan',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * DELETE /api/admin/subscription-plans/:planId
 * Soft delete a subscription plan (set isActive to false)
 */
exports.deletePlan = async (req, res) => {
  try {
    const { planId } = req.params;

    const plan = await SubscriptionPlan.findByPk(planId);

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Subscription plan not found'
      });
    }

    // Check if plan has active subscriptions
    const activeSubscriptions = await Subscription.count({
      where: {
        planId: plan.id,
        status: 'active'
      }
    });

    if (activeSubscriptions > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete plan with ${activeSubscriptions} active subscription(s). Please migrate or cancel them first.`
      });
    }

    // Soft delete by setting isActive to false
    await plan.update({ isActive: false });

    // Create audit log
    await AuditLog.create({
      userId: req.user?.id,
      action: 'subscription_plan_deleted',
      resourceType: 'subscription_plan',
      resourceId: plan.id,
      details: {
        planName: plan.name
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.status(200).json({
      success: true,
      message: 'Subscription plan deactivated successfully'
    });
  } catch (error) {
    console.error('Error deleting subscription plan:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete subscription plan',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
