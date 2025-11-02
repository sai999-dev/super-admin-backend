/**
 * Agency Controller
 * Handles agency management, CRUD operations, and analytics
 */

const { Agency, User, Subscription, ActiveSubscription, Territory, LeadAssignment } = require('../models');
const { Op } = require('sequelize');
const agencyService = require('../services/agencyService');

/**
 * GET /api/admin/agencies/summary
 * Get agencies summary for dashboard
 */
exports.getSummary = async (req, res) => {
  try {
    const {
      dateRange = 'all',
      status,
      search
    } = req.query;

    const summary = await agencyService.getAgenciesSummary({
      dateRange,
      status,
      search
    });

    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    console.error('Error getting agencies summary:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch agencies summary',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * GET /api/admin/agencies
 * Get paginated agencies with filters
 */
exports.getAgencies = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 25,
      sortBy = 'created_at',
      sortOrder = 'DESC',
      status,
      search,
      dateRange = 'all',
      subscriptionStatus
    } = req.query;

    const offset = (page - 1) * limit;
    const where = {};

    // Status filter
    if (status) {
      where.accountStatus = status;
    }

    // Search filter
    if (search) {
      where[Op.or] = [
        { businessName: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
        { phoneNumber: { [Op.iLike]: `%${search}%` } }
      ];
    }

    // Date range filter
    if (dateRange !== 'all') {
      const dateFilter = agencyService.getDateRangeFilter(dateRange);
      where.created_at = dateFilter;
    }

    // Include subscription status filter
    const include = [
      {
        model: User,
        as: 'users',
        attributes: ['id', 'firstName', 'lastName', 'email', 'role'],
        required: false
      },
      {
        model: Subscription,
        as: 'subscriptions',
        attributes: ['id', 'status', 'billingCycle'],
        required: false
      },
      {
        model: ActiveSubscription,
        as: 'activeSubscriptions',
        attributes: ['id', 'status', 'monthlyCost', 'startDate', 'endDate'],
        required: false
      },
      {
        model: Territory,
        as: 'territories',
        attributes: ['id', 'type', 'value'],
        required: false
      }
    ];

    // Add subscription status filter to include
    if (subscriptionStatus) {
      include[1].where = { status: subscriptionStatus };
      include[1].required = true;
    }

    // Fetch agencies
    const { count, rows: agencies } = await Agency.findAndCountAll({
      where,
      include,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [[sortBy, sortOrder.toUpperCase()]],
      distinct: true
    });

    // Calculate totals
    const totals = await agencyService.calculateAgenciesTotals(where);

    res.json({
      success: true,
      data: {
        agencies,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(count / limit),
          totalRecords: count,
          limit: parseInt(limit)
        },
        totals
      }
    });
  } catch (error) {
    console.error('Error getting agencies:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch agencies',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * GET /api/admin/agencies/:id
 * Get single agency details
 */
exports.getAgencyDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const agency = await Agency.findByPk(id, {
      include: [
        {
          model: User,
          as: 'users',
          attributes: ['id', 'firstName', 'lastName', 'email', 'role', 'isActive', 'lastLoginAt']
        },
        {
          model: Subscription,
          as: 'subscriptions',
          attributes: ['id', 'status', 'billingCycle', 'autoRenew', 'createdAt'],
          include: [
            {
              model: require('../models').SubscriptionPlan,
              as: 'plan',
              attributes: ['id', 'name', 'unitType', 'pricePerUnit']
            }
          ]
        },
        {
          model: ActiveSubscription,
          as: 'activeSubscriptions',
          attributes: ['id', 'status', 'monthlyCost', 'startDate', 'endDate', 'territoryCount']
        },
        {
          model: Territory,
          as: 'territories',
          attributes: ['id', 'type', 'value', 'state', 'county', 'city', 'zipcode', 'priority']
        },
        {
          model: LeadAssignment,
          as: 'leadAssignments',
          attributes: ['id', 'assignedAt', 'status'],
          include: [
            {
              model: require('../models').Lead,
              as: 'lead',
              attributes: ['id', 'firstName', 'lastName', 'email', 'phone', 'source']
            }
          ]
        }
      ]
    });

    if (!agency) {
      return res.status(404).json({
        success: false,
        message: 'Agency not found'
      });
    }

    // Get agency analytics
    const analytics = await agencyService.getAgencyAnalytics(id);

    res.json({
      success: true,
      data: {
        agency,
        analytics
      }
    });
  } catch (error) {
    console.error('Error getting agency details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch agency details',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * POST /api/admin/agencies
 * Create new agency
 */
exports.createAgency = async (req, res) => {
  try {
    const {
      businessName,
      email,
      phoneNumber,
      address,
      city,
      state,
      zipCode,
      country,
      website,
      description,
      accountStatus = 'ACTIVE',
      subscriptionPlan,
      territories
    } = req.body;

    // Validate required fields
    if (!businessName || !email) {
      return res.status(400).json({
        success: false,
        message: 'Business name and email are required'
      });
    }

    // Check if agency with email already exists
    const existingAgency = await Agency.findOne({ where: { email } });
    if (existingAgency) {
      return res.status(400).json({
        success: false,
        message: 'Agency with this email already exists'
      });
    }

    // Create agency
    const agency = await Agency.create({
      businessName,
      email,
      phoneNumber,
      address,
      city,
      state,
      zipCode,
      country,
      website,
      description,
      accountStatus,
      createdBy: req.user.id
    });

    // Create default admin user for the agency
    const defaultPassword = agencyService.generateDefaultPassword();
    const hashedPassword = await agencyService.hashPassword(defaultPassword);

    const adminUser = await User.create({
      firstName: 'Admin',
      lastName: businessName,
      email,
      passwordHash: hashedPassword,
      role: 'AGENCY_ADMIN',
      agencyId: agency.id,
      isActive: true,
      createdBy: req.user.id
    });

    // Add territories if provided
    if (territories && territories.length > 0) {
      await agencyService.addTerritoriesToAgency(agency.id, territories);
    }

    // Create subscription if plan is provided
    if (subscriptionPlan) {
      await agencyService.createAgencySubscription(agency.id, subscriptionPlan);
    }

    res.status(201).json({
      success: true,
      message: 'Agency created successfully',
      data: {
        agency,
        adminUser: {
          id: adminUser.id,
          email: adminUser.email,
          temporaryPassword: defaultPassword
        }
      }
    });
  } catch (error) {
    console.error('Error creating agency:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create agency',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * PUT /api/admin/agencies/:id
 * Update agency
 */
exports.updateAgency = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      businessName,
      email,
      phoneNumber,
      address,
      city,
      state,
      zipCode,
      country,
      website,
      description,
      accountStatus,
      territories
    } = req.body;

    const agency = await Agency.findByPk(id);
    if (!agency) {
      return res.status(404).json({
        success: false,
        message: 'Agency not found'
      });
    }

    // Check if email is being changed and if it already exists
    if (email && email !== agency.email) {
      const existingAgency = await Agency.findOne({ where: { email } });
      if (existingAgency) {
        return res.status(400).json({
          success: false,
          message: 'Agency with this email already exists'
        });
      }
    }

    // Update agency
    const updateData = {
      updatedBy: req.user.id
    };

    if (businessName) updateData.businessName = businessName;
    if (email) updateData.email = email;
    if (phoneNumber !== undefined) updateData.phoneNumber = phoneNumber;
    if (address !== undefined) updateData.address = address;
    if (city !== undefined) updateData.city = city;
    if (state !== undefined) updateData.state = state;
    if (zipCode !== undefined) updateData.zipCode = zipCode;
    if (country !== undefined) updateData.country = country;
    if (website !== undefined) updateData.website = website;
    if (description !== undefined) updateData.description = description;
    if (accountStatus) updateData.accountStatus = accountStatus;

    await agency.update(updateData);

    // Update territories if provided
    if (territories) {
      await agencyService.updateAgencyTerritories(id, territories);
    }

    res.json({
      success: true,
      message: 'Agency updated successfully',
      data: agency
    });
  } catch (error) {
    console.error('Error updating agency:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update agency',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * DELETE /api/admin/agencies/:id
 * Delete agency (soft delete)
 */
exports.deleteAgency = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const agency = await Agency.findByPk(id);
    if (!agency) {
      return res.status(404).json({
        success: false,
        message: 'Agency not found'
      });
    }

    // Check if agency has active subscriptions
    const activeSubscriptions = await ActiveSubscription.count({
      where: { agencyId: id, status: 'ACTIVE' }
    });

    if (activeSubscriptions > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete agency with active subscriptions'
      });
    }

    // Soft delete agency
    await agency.update({
      accountStatus: 'DELETED',
      deletedAt: new Date(),
      deletedBy: req.user.id,
      deletionReason: reason
    });

    res.json({
      success: true,
      message: 'Agency deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting agency:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete agency',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * PUT /api/admin/agencies/:id/status
 * Update agency status
 */
exports.updateAgencyStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;

    const agency = await Agency.findByPk(id);
    if (!agency) {
      return res.status(404).json({
        success: false,
        message: 'Agency not found'
      });
    }

    await agency.update({
      accountStatus: status,
      statusUpdatedAt: new Date(),
      statusUpdatedBy: req.user.id,
      statusUpdateReason: reason
    });

    res.json({
      success: true,
      message: 'Agency status updated successfully',
      data: agency
    });
  } catch (error) {
    console.error('Error updating agency status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update agency status',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * POST /api/admin/agencies/:id/reset-password
 * Reset agency admin password
 */
exports.resetAgencyPassword = async (req, res) => {
  try {
    const { id } = req.params;

    const agency = await Agency.findByPk(id);
    if (!agency) {
      return res.status(404).json({
        success: false,
        message: 'Agency not found'
      });
    }

    // Find agency admin user
    const adminUser = await User.findOne({
      where: { agencyId: id, role: 'AGENCY_ADMIN' }
    });

    if (!adminUser) {
      return res.status(404).json({
        success: false,
        message: 'Agency admin user not found'
      });
    }

    // Generate new password
    const newPassword = agencyService.generateDefaultPassword();
    const hashedPassword = await agencyService.hashPassword(newPassword);

    await adminUser.update({
      passwordHash: hashedPassword,
      passwordResetAt: new Date(),
      passwordResetBy: req.user.id
    });

    res.json({
      success: true,
      message: 'Agency password reset successfully',
      data: {
        temporaryPassword: newPassword
      }
    });
  } catch (error) {
    console.error('Error resetting agency password:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset agency password',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * POST /api/admin/agencies/export
 * Export agencies data
 */
exports.exportAgencies = async (req, res) => {
  try {
    const {
      dateRange = 'all',
      status,
      format = 'csv'
    } = req.body;

    const where = {};

    if (status) where.accountStatus = status;

    if (dateRange !== 'all') {
      const dateFilter = agencyService.getDateRangeFilter(dateRange);
      where.created_at = dateFilter;
    }

    const agencies = await Agency.findAll({
      where,
      include: [
        {
          model: User,
          as: 'users',
          attributes: ['firstName', 'lastName', 'email', 'role']
        }
      ],
      order: [['created_at', 'DESC']]
    });

    let exportData;
    let contentType;
    let filename;

    if (format === 'csv') {
      exportData = await agencyService.exportToCSV(agencies);
      contentType = 'text/csv';
      filename = `agencies-${new Date().toISOString().split('T')[0]}.csv`;
    } else if (format === 'json') {
      exportData = JSON.stringify(agencies, null, 2);
      contentType = 'application/json';
      filename = `agencies-${new Date().toISOString().split('T')[0]}.json`;
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
    console.error('Error exporting agencies:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export agencies',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};
