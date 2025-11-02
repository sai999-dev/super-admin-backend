/**
 * Subscriptions Controller
 * Handles agency subscription management
 */

const { Subscription, SubscriptionPlan, Agency, Territory, AuditLog } = require('../models');
const { Op } = require('sequelize');

/**
 * GET /api/admin/subscriptions
 * List all agency subscriptions with status, renewal dates, territory usage
 */
exports.getAllSubscriptions = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 25,
      sortBy = 'created_at',
      sortOrder = 'DESC',
      status,
      agencyId,
      planId,
      search
    } = req.query;

    const offset = (page - 1) * limit;
    const where = {};

    // Filters
    if (status) {
      where.status = status;
    }

    if (agencyId) {
      where.agencyId = agencyId;
    }

    if (planId) {
      where.planId = planId;
    }

    // Search by agency name
    const include = [
      {
        model: Agency,
        as: 'agency',
        attributes: ['id', 'businessName', 'email', 'accountStatus'],
        where: search ? {
          [Op.or]: [
            { businessName: { [Op.iLike]: `%${search}%` } },
            { email: { [Op.iLike]: `%${search}%` } }
          ]
        } : undefined
      },
      {
        model: SubscriptionPlan,
        as: 'plan',
        attributes: ['id', 'name', 'unitType', 'pricePerUnit', 'billingCycle']
      },
      {
        model: Territory,
        as: 'territories',
        attributes: ['id', 'type', 'value', 'isActive'],
        required: false
      }
    ];

    // Fetch subscriptions
    const { count, rows: subscriptions } = await Subscription.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [[sortBy, sortOrder.toUpperCase()]],
      include,
      distinct: true
    });

    // Calculate territory stats
    const subscriptionsWithStats = subscriptions.map(sub => {
      const subData = sub.toJSON();
      subData.activeTerritories = subData.territories?.filter(t => t.isActive).length || 0;
      subData.totalTerritories = subData.territories?.length || 0;
      
      // Calculate effective price
      const pricePerUnit = subData.customPricePerUnit || subData.plan?.pricePerUnit || 0;
      subData.monthlyPrice = pricePerUnit * subData.currentUnits;
      
      // Calculate days until renewal
      if (subData.nextBillingDate) {
        const daysUntilRenewal = Math.ceil((new Date(subData.nextBillingDate) - new Date()) / (1000 * 60 * 60 * 24));
        subData.daysUntilRenewal = daysUntilRenewal;
      }

      return subData;
    });

    res.status(200).json({
      success: true,
      data: {
        subscriptions: subscriptionsWithStats,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(count / limit)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching subscriptions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch subscriptions',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * GET /api/admin/subscriptions/:subscriptionId
 * Get a single subscription by ID
 */
exports.getSubscriptionById = async (req, res) => {
  try {
    const { subscriptionId } = req.params;

    const subscription = await Subscription.findByPk(subscriptionId, {
      include: [
        {
          model: Agency,
          as: 'agency',
          attributes: ['id', 'businessName', 'email', 'phone', 'accountStatus']
        },
        {
          model: SubscriptionPlan,
          as: 'plan'
        },
        {
          model: Territory,
          as: 'territories',
          where: { isActive: true },
          required: false
        }
      ]
    });

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'Subscription not found'
      });
    }

    res.status(200).json({
      success: true,
      data: subscription
    });
  } catch (error) {
    console.error('Error fetching subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch subscription',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * POST /api/admin/subscriptions
 * Assign a subscription plan manually to an agency
 */
exports.createSubscription = async (req, res) => {
  try {
    const {
      agencyId,
      planId,
      billingCycle,
      customPricePerUnit,
      maxUnits,
      startDate,
      trialDays,
      autoRenew,
      notes
    } = req.body;

    // Validation
    if (!agencyId || !planId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: agencyId, planId'
      });
    }

    // Check if agency exists
    const agency = await Agency.findByPk(agencyId);
    if (!agency) {
      return res.status(404).json({
        success: false,
        message: 'Agency not found'
      });
    }

    // Check if plan exists
    const plan = await SubscriptionPlan.findByPk(planId);
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Subscription plan not found'
      });
    }

    if (!plan.isActive) {
      return res.status(400).json({
        success: false,
        message: 'Cannot subscribe to an inactive plan'
      });
    }

    // Check for existing active subscription
    const existingSubscription = await Subscription.findOne({
      where: {
        agencyId,
        status: { [Op.in]: ['trial', 'active'] }
      }
    });

    if (existingSubscription) {
      return res.status(409).json({
        success: false,
        message: 'Agency already has an active subscription'
      });
    }

    // Calculate dates
    const subscriptionStartDate = startDate ? new Date(startDate) : new Date();
    const effectiveTrialDays = trialDays !== undefined ? trialDays : plan.trialDays;
    
    let trialEndDate = null;
    let status = 'active';
    
    if (effectiveTrialDays > 0) {
      trialEndDate = new Date(subscriptionStartDate);
      trialEndDate.setDate(trialEndDate.getDate() + effectiveTrialDays);
      status = 'trial';
    }

    // Calculate next billing date
    const nextBillingDate = new Date(trialEndDate || subscriptionStartDate);
    const cycle = billingCycle || plan.billingCycle;
    
    switch (cycle) {
      case 'monthly':
        nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
        break;
      case 'quarterly':
        nextBillingDate.setMonth(nextBillingDate.getMonth() + 3);
        break;
      case 'yearly':
        nextBillingDate.setFullYear(nextBillingDate.getFullYear() + 1);
        break;
    }

    // Create subscription
    const subscription = await Subscription.create({
      agencyId,
      planId,
      status,
      currentUnits: 0,
      maxUnits: maxUnits || plan.maxUnits,
      customPricePerUnit: customPricePerUnit || null,
      billingCycle: cycle,
      startDate: subscriptionStartDate,
      trialEndDate,
      nextBillingDate,
      autoRenew: autoRenew !== undefined ? autoRenew : true,
      notes
    });

    // Create audit log
    await AuditLog.create({
      userId: req.user?.id,
      action: 'subscription_created',
      resourceType: 'subscription',
      resourceId: subscription.id,
      details: {
        agencyId,
        agencyName: agency.businessName,
        planId,
        planName: plan.name,
        status,
        trialDays: effectiveTrialDays
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    // Fetch complete subscription data
    const completeSubscription = await Subscription.findByPk(subscription.id, {
      include: [
        { model: Agency, as: 'agency' },
        { model: SubscriptionPlan, as: 'plan' }
      ]
    });

    res.status(201).json({
      success: true,
      message: 'Subscription created successfully',
      data: completeSubscription
    });
  } catch (error) {
    console.error('Error creating subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create subscription',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * PUT /api/admin/subscriptions/:subscriptionId
 * Update subscription details
 */
exports.updateSubscription = async (req, res) => {
  try {
    const { subscriptionId } = req.params;
    const {
      planId,
      status,
      customPricePerUnit,
      maxUnits,
      billingCycle,
      autoRenew,
      notes
    } = req.body;

    const subscription = await Subscription.findByPk(subscriptionId, {
      include: [
        { model: Agency, as: 'agency' },
        { model: SubscriptionPlan, as: 'plan' }
      ]
    });

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'Subscription not found'
      });
    }

    // Store old values for audit
    const oldValues = {
      planId: subscription.planId,
      status: subscription.status,
      customPricePerUnit: subscription.customPricePerUnit,
      maxUnits: subscription.maxUnits
    };

    // If changing plan, validate new plan
    if (planId && planId !== subscription.planId) {
      const newPlan = await SubscriptionPlan.findByPk(planId);
      if (!newPlan) {
        return res.status(404).json({
          success: false,
          message: 'New subscription plan not found'
        });
      }

      if (!newPlan.isActive) {
        return res.status(400).json({
          success: false,
          message: 'Cannot switch to an inactive plan'
        });
      }

      // Check if current units exceed new plan limits
      if (newPlan.maxUnits && subscription.currentUnits > newPlan.maxUnits) {
        return res.status(400).json({
          success: false,
          message: `Current territory count (${subscription.currentUnits}) exceeds new plan limit (${newPlan.maxUnits})`
        });
      }
    }

    // Validate max units if provided
    if (maxUnits !== undefined && maxUnits < subscription.currentUnits) {
      return res.status(400).json({
        success: false,
        message: `Cannot set max units (${maxUnits}) below current territory count (${subscription.currentUnits})`
      });
    }

    // Update subscription
    await subscription.update({
      planId: planId !== undefined ? planId : subscription.planId,
      status: status !== undefined ? status : subscription.status,
      customPricePerUnit: customPricePerUnit !== undefined ? customPricePerUnit : subscription.customPricePerUnit,
      maxUnits: maxUnits !== undefined ? maxUnits : subscription.maxUnits,
      billingCycle: billingCycle !== undefined ? billingCycle : subscription.billingCycle,
      autoRenew: autoRenew !== undefined ? autoRenew : subscription.autoRenew,
      notes: notes !== undefined ? notes : subscription.notes
    });

    // Create audit log
    await AuditLog.create({
      userId: req.user?.id,
      action: 'subscription_updated',
      resourceType: 'subscription',
      resourceId: subscription.id,
      details: {
        agencyId: subscription.agencyId,
        agencyName: subscription.agency?.businessName,
        oldValues,
        newValues: {
          planId: subscription.planId,
          status: subscription.status,
          customPricePerUnit: subscription.customPricePerUnit,
          maxUnits: subscription.maxUnits
        }
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    // Fetch updated subscription
    const updatedSubscription = await Subscription.findByPk(subscriptionId, {
      include: [
        { model: Agency, as: 'agency' },
        { model: SubscriptionPlan, as: 'plan' },
        { model: Territory, as: 'territories' }
      ]
    });

    res.status(200).json({
      success: true,
      message: 'Subscription updated successfully',
      data: updatedSubscription
    });
  } catch (error) {
    console.error('Error updating subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update subscription',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * DELETE /api/admin/subscriptions/:subscriptionId
 * Cancel a subscription
 */
exports.cancelSubscription = async (req, res) => {
  try {
    const { subscriptionId } = req.params;
    const { reason } = req.body;

    const subscription = await Subscription.findByPk(subscriptionId, {
      include: [{ model: Agency, as: 'agency' }]
    });

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'Subscription not found'
      });
    }

    if (subscription.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'Subscription is already cancelled'
      });
    }

    // Cancel subscription
    await subscription.update({
      status: 'cancelled',
      cancelledAt: new Date(),
      cancelledBy: req.user?.id,
      cancellationReason: reason || null,
      autoRenew: false
    });

    // Deactivate all territories
    await Territory.update(
      { isActive: false },
      { where: { subscriptionId: subscription.id } }
    );

    // Create audit log
    await AuditLog.create({
      userId: req.user?.id,
      action: 'subscription_cancelled',
      resourceType: 'subscription',
      resourceId: subscription.id,
      details: {
        agencyId: subscription.agencyId,
        agencyName: subscription.agency?.businessName,
        reason: reason || 'No reason provided'
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.status(200).json({
      success: true,
      message: 'Subscription cancelled successfully. All territories have been deactivated.'
    });
  } catch (error) {
    console.error('Error cancelling subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel subscription',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
