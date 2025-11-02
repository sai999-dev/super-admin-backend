/**
 * Territories Controller
 * Handles territory management for subscriptions
 */

const { Territory, Subscription, Agency, SubscriptionPlan, AuditLog, sequelize } = require('../models');
const { Op } = require('sequelize');

/**
 * GET /api/admin/territories
 * Return all agency-owned territories with conflict detection
 */
exports.getAllTerritories = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      sortBy = 'created_at',
      sortOrder = 'DESC',
      agencyId,
      subscriptionId,
      type,
      state,
      isActive,
      search
    } = req.query;

    const offset = (page - 1) * limit;
    const where = {};

    // Filters
    if (agencyId) {
      where.agencyId = agencyId;
    }

    if (subscriptionId) {
      where.subscriptionId = subscriptionId;
    }

    if (type) {
      where.type = type;
    }

    if (state) {
      where.state = state;
    }

    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }

    if (search) {
      where[Op.or] = [
        { value: { [Op.iLike]: `%${search}%` } },
        { city: { [Op.iLike]: `%${search}%` } },
        { zipcode: { [Op.iLike]: `%${search}%` } }
      ];
    }

    // Fetch territories
    const { count, rows: territories } = await Territory.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [[sortBy, sortOrder.toUpperCase()]],
      include: [
        {
          model: Agency,
          as: 'agency',
          attributes: ['id', 'businessName', 'email']
        },
        {
          model: Subscription,
          as: 'subscription',
          attributes: ['id', 'status', 'planId'],
          include: [
            {
              model: SubscriptionPlan,
              as: 'plan',
              attributes: ['name', 'unitType']
            }
          ]
        }
      ],
      paranoid: false // Include soft-deleted territories
    });

    // Detect conflicts (multiple agencies owning same territory)
    const territoriesWithConflicts = await Promise.all(
      territories.map(async (territory) => {
        const territoryData = territory.toJSON();

        // Find other agencies with same territory
        const conflictCount = await Territory.count({
          where: {
            type: territory.type,
            value: territory.value,
            isActive: true,
            id: { [Op.ne]: territory.id }
          }
        });

        territoryData.hasConflict = conflictCount > 0;
        territoryData.conflictCount = conflictCount;

        return territoryData;
      })
    );

    res.status(200).json({
      success: true,
      data: {
        territories: territoriesWithConflicts,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(count / limit)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching territories:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch territories',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * GET /api/admin/territories/conflicts
 * Get territories with multiple agency ownership
 */
exports.getTerritoryConflicts = async (req, res) => {
  try {
    // Find territories with conflicts using raw SQL for better performance
    const conflicts = await sequelize.query(`
      SELECT 
        t.type,
        t.value,
        t.state,
        t.city,
        COUNT(DISTINCT t.agency_id) as agency_count,
        json_agg(
          json_build_object(
            'agencyId', a.id,
            'agencyName', a.business_name,
            'subscriptionId', t.subscription_id,
            'priority', t.priority,
            'isActive', t.is_active
          )
        ) as agencies
      FROM territories t
      INNER JOIN agencies a ON t.agency_id = a.id
      WHERE t.is_active = true AND t.deleted_at IS NULL
      GROUP BY t.type, t.value, t.state, t.city
      HAVING COUNT(DISTINCT t.agency_id) > 1
      ORDER BY agency_count DESC, t.type, t.value
    `, {
      type: sequelize.QueryTypes.SELECT
    });

    res.status(200).json({
      success: true,
      data: {
        conflicts,
        totalConflicts: conflicts.length
      }
    });
  } catch (error) {
    console.error('Error fetching territory conflicts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch territory conflicts',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * POST /api/admin/subscriptions/:subscriptionId/territories
 * Add territories manually to a subscription
 */
exports.addTerritories = async (req, res) => {
  try {
    const { subscriptionId } = req.params;
    const { territories } = req.body;

    // Validation
    if (!territories || !Array.isArray(territories) || territories.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Territories array is required and must not be empty'
      });
    }

    // Fetch subscription with plan details
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

    if (subscription.status === 'cancelled' || subscription.status === 'expired') {
      return res.status(400).json({
        success: false,
        message: 'Cannot add territories to a cancelled or expired subscription'
      });
    }

    // Check unit limits
    const effectiveMaxUnits = subscription.maxUnits || subscription.plan?.maxUnits;
    const newTotalUnits = subscription.currentUnits + territories.length;

    if (effectiveMaxUnits && newTotalUnits > effectiveMaxUnits) {
      return res.status(400).json({
        success: false,
        message: `Adding ${territories.length} territories would exceed the limit of ${effectiveMaxUnits}. Current: ${subscription.currentUnits}`
      });
    }

    // Validate and prepare territories
    const validatedTerritories = [];
    const errors = [];

    for (let i = 0; i < territories.length; i++) {
      const territory = territories[i];

      // Validate required fields
      if (!territory.type || !territory.value) {
        errors.push(`Territory ${i + 1}: type and value are required`);
        continue;
      }

      // Check for duplicates within subscription
      const existingTerritory = await Territory.findOne({
        where: {
          subscriptionId: subscription.id,
          type: territory.type,
          value: territory.value
        }
      });

      if (existingTerritory) {
        errors.push(`Territory ${i + 1}: ${territory.type} "${territory.value}" already exists in this subscription`);
        continue;
      }

      validatedTerritories.push({
        subscriptionId: subscription.id,
        agencyId: subscription.agencyId,
        type: territory.type,
        value: territory.value,
        state: territory.state || null,
        county: territory.county || null,
        city: territory.city || null,
        zipcode: territory.zipcode || null,
        priority: territory.priority || 0,
        isActive: true,
        addedBy: req.user?.id,
        metadata: territory.metadata || {}
      });
    }

    if (errors.length > 0 && validatedTerritories.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'All territories failed validation',
        errors
      });
    }

    // Create territories
    const createdTerritories = await Territory.bulkCreate(validatedTerritories);

    // Update subscription current units
    await subscription.update({
      currentUnits: subscription.currentUnits + createdTerritories.length
    });

    // Create audit log
    await AuditLog.create({
      userId: req.user?.id,
      action: 'territories_added',
      resourceType: 'subscription',
      resourceId: subscription.id,
      details: {
        agencyId: subscription.agencyId,
        agencyName: subscription.agency?.businessName,
        territoriesAdded: createdTerritories.length,
        territories: createdTerritories.map(t => ({
          type: t.type,
          value: t.value
        }))
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.status(201).json({
      success: true,
      message: `Successfully added ${createdTerritories.length} territory(ies)`,
      data: {
        territories: createdTerritories,
        errors: errors.length > 0 ? errors : undefined,
        subscription: {
          id: subscription.id,
          currentUnits: subscription.currentUnits + createdTerritories.length,
          maxUnits: effectiveMaxUnits
        }
      }
    });
  } catch (error) {
    console.error('Error adding territories:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add territories',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * PUT /api/admin/territories/:territoryId
 * Update a territory
 */
exports.updateTerritory = async (req, res) => {
  try {
    const { territoryId } = req.params;
    const { priority, isActive, metadata } = req.body;

    const territory = await Territory.findByPk(territoryId, {
      include: [
        { model: Agency, as: 'agency' },
        { model: Subscription, as: 'subscription' }
      ]
    });

    if (!territory) {
      return res.status(404).json({
        success: false,
        message: 'Territory not found'
      });
    }

    // Store old values
    const oldValues = {
      priority: territory.priority,
      isActive: territory.isActive
    };

    // Update territory
    await territory.update({
      priority: priority !== undefined ? priority : territory.priority,
      isActive: isActive !== undefined ? isActive : territory.isActive,
      metadata: metadata !== undefined ? metadata : territory.metadata
    });

    // Create audit log
    await AuditLog.create({
      userId: req.user?.id,
      action: 'territory_updated',
      resourceType: 'territory',
      resourceId: territory.id,
      details: {
        agencyId: territory.agencyId,
        agencyName: territory.agency?.businessName,
        territoryType: territory.type,
        territoryValue: territory.value,
        oldValues,
        newValues: {
          priority: territory.priority,
          isActive: territory.isActive
        }
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.status(200).json({
      success: true,
      message: 'Territory updated successfully',
      data: territory
    });
  } catch (error) {
    console.error('Error updating territory:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update territory',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * DELETE /api/admin/territories/:territoryId
 * Soft delete a territory from subscription
 */
exports.deleteTerritory = async (req, res) => {
  try {
    const { territoryId } = req.params;

    const territory = await Territory.findByPk(territoryId, {
      include: [
        { model: Agency, as: 'agency' },
        { model: Subscription, as: 'subscription' }
      ]
    });

    if (!territory) {
      return res.status(404).json({
        success: false,
        message: 'Territory not found'
      });
    }

    // Soft delete territory
    await territory.update({
      isActive: false,
      deletedBy: req.user?.id
    });

    await territory.destroy(); // Sequelize paranoid soft delete

    // Update subscription current units
    const subscription = territory.subscription;
    if (subscription) {
      await subscription.update({
        currentUnits: Math.max(0, subscription.currentUnits - 1)
      });
    }

    // Create audit log
    await AuditLog.create({
      userId: req.user?.id,
      action: 'territory_deleted',
      resourceType: 'territory',
      resourceId: territory.id,
      details: {
        agencyId: territory.agencyId,
        agencyName: territory.agency?.businessName,
        subscriptionId: territory.subscriptionId,
        territoryType: territory.type,
        territoryValue: territory.value
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.status(200).json({
      success: true,
      message: 'Territory deleted successfully. Lead distribution to this territory has been stopped.'
    });
  } catch (error) {
    console.error('Error deleting territory:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete territory',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * POST /api/admin/territories/:territoryId/restore
 * Restore a soft-deleted territory
 */
exports.restoreTerritory = async (req, res) => {
  try {
    const { territoryId } = req.params;

    const territory = await Territory.findByPk(territoryId, {
      paranoid: false,
      include: [
        { model: Subscription, as: 'subscription', paranoid: false }
      ]
    });

    if (!territory) {
      return res.status(404).json({
        success: false,
        message: 'Territory not found'
      });
    }

    if (!territory.deletedAt) {
      return res.status(400).json({
        success: false,
        message: 'Territory is not deleted'
      });
    }

    // Check subscription limits
    const subscription = territory.subscription;
    if (subscription) {
      const effectiveMaxUnits = subscription.maxUnits || subscription.plan?.maxUnits;
      if (effectiveMaxUnits && subscription.currentUnits >= effectiveMaxUnits) {
        return res.status(400).json({
          success: false,
          message: `Cannot restore territory. Subscription has reached its limit of ${effectiveMaxUnits} territories.`
        });
      }
    }

    // Restore territory
    await territory.restore();
    await territory.update({
      isActive: true,
      deletedBy: null
    });

    // Update subscription current units
    if (subscription) {
      await subscription.update({
        currentUnits: subscription.currentUnits + 1
      });
    }

    // Create audit log
    await AuditLog.create({
      userId: req.user?.id,
      action: 'territory_restored',
      resourceType: 'territory',
      resourceId: territory.id,
      details: {
        agencyId: territory.agencyId,
        subscriptionId: territory.subscriptionId,
        territoryType: territory.type,
        territoryValue: territory.value
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.status(200).json({
      success: true,
      message: 'Territory restored successfully',
      data: territory
    });
  } catch (error) {
    console.error('Error restoring territory:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to restore territory',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
