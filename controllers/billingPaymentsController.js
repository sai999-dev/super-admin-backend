/**
 * Billing & Payments Controller
 * Handles billing history, payment processing, and financial reporting
 */

const { BillingHistory, Agency, Subscription, SubscriptionPlan, User } = require('../models');
const { Op } = require('sequelize');
const billingPaymentsService = require('../services/billingPaymentsService');

/**
 * GET /api/admin/billing-payments/summary
 * Get billing and payment summary for dashboard
 */
exports.getSummary = async (req, res) => {
  try {
    const {
      dateRange = 'last30days',
      agencyId,
      planId
    } = req.query;

    const summary = await billingPaymentsService.getBillingSummary({
      dateRange,
      agencyId,
      planId
    });

    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    console.error('Error getting billing summary:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch billing summary',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * GET /api/admin/billing-payments/history
 * Get paginated billing history with filters
 */
exports.getBillingHistory = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 25,
      sortBy = 'billing_date',
      sortOrder = 'DESC',
      dateRange = 'last30days',
      status,
      agencyId,
      planId,
      paymentMethod,
      search
    } = req.query;

    const offset = (page - 1) * limit;
    const where = {};

    // Date range filter
    if (dateRange !== 'all') {
      const dateFilter = billingPaymentsService.getDateRangeFilter(dateRange);
      where.billing_date = dateFilter;
    }

    // Status filter
    if (status) {
      where.status = status;
    }

    // Agency filter
    if (agencyId) {
      where.agencyId = agencyId;
    }

    // Plan filter
    if (planId) {
      where.planId = planId;
    }

    // Payment method filter
    if (paymentMethod) {
      where.paymentMethod = paymentMethod;
    }

    // Search filter (by agency name or payment reference)
    const include = [
      {
        model: Agency,
        as: 'agency',
        attributes: ['id', 'businessName', 'email'],
        where: search ? {
          [Op.or]: [
            { businessName: { [Op.iLike]: `%${search}%` } },
            { email: { [Op.iLike]: `%${search}%` } }
          ]
        } : undefined,
        required: true
      },
      {
        model: Subscription,
        as: 'subscription',
        attributes: ['id', 'status', 'billingCycle']
      },
      {
        model: SubscriptionPlan,
        as: 'plan',
        attributes: ['id', 'name', 'unitType']
      }
    ];

    // Fetch billing history
    const { count, rows: billingHistory } = await BillingHistory.findAndCountAll({
      where,
      include,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [[sortBy, sortOrder.toUpperCase()]]
    });

    // Calculate totals
    const totals = await billingPaymentsService.calculateTotals(where);

    res.json({
      success: true,
      data: {
        billingHistory,
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
    console.error('Error getting billing history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch billing history',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * GET /api/admin/billing-payments/:id
 * Get single billing record details
 */
exports.getBillingDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const billingRecord = await BillingHistory.findByPk(id, {
      include: [
        {
          model: Agency,
          as: 'agency',
          attributes: ['id', 'businessName', 'email', 'phone', 'address']
        },
        {
          model: Subscription,
          as: 'subscription',
          attributes: ['id', 'status', 'billingCycle', 'autoRenew']
        },
        {
          model: SubscriptionPlan,
          as: 'plan',
          attributes: ['id', 'name', 'unitType', 'pricePerUnit']
        },
        {
          model: User,
          as: 'processedByUser',
          attributes: ['id', 'firstName', 'lastName', 'email']
        }
      ]
    });

    if (!billingRecord) {
      return res.status(404).json({
        success: false,
        message: 'Billing record not found'
      });
    }

    res.json({
      success: true,
      data: billingRecord
    });
  } catch (error) {
    console.error('Error getting billing details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch billing details',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * POST /api/admin/billing-payments/export
 * Export billing data in requested format
 */
exports.exportBillingData = async (req, res) => {
  try {
    const {
      dateRange = 'last30days',
      format = 'csv',
      status,
      agencyId,
      planId
    } = req.body;

    const where = {};

    // Date range filter
    if (dateRange !== 'all') {
      const dateFilter = billingPaymentsService.getDateRangeFilter(dateRange);
      where.billing_date = dateFilter;
    }

    // Additional filters
    if (status) where.status = status;
    if (agencyId) where.agencyId = agencyId;
    if (planId) where.planId = planId;

    // Fetch data for export
    const billingData = await BillingHistory.findAll({
      where,
      include: [
        {
          model: Agency,
          as: 'agency',
          attributes: ['businessName', 'email']
        },
        {
          model: SubscriptionPlan,
          as: 'plan',
          attributes: ['name']
        }
      ],
      order: [['billing_date', 'DESC']]
    });

    // Export based on format
    let exportData;
    let contentType;
    let filename;

    if (format === 'csv') {
      exportData = await billingPaymentsService.exportToCSV(billingData);
      contentType = 'text/csv';
      filename = `billing-data-${new Date().toISOString().split('T')[0]}.csv`;
    } else if (format === 'json') {
      exportData = JSON.stringify(billingData, null, 2);
      contentType = 'application/json';
      filename = `billing-data-${new Date().toISOString().split('T')[0]}.json`;
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
    console.error('Error exporting billing data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export billing data',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * PUT /api/admin/billing-payments/:id/status
 * Update billing record status
 */
exports.updateBillingStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes, processedBy } = req.body;

    const billingRecord = await BillingHistory.findByPk(id);
    if (!billingRecord) {
      return res.status(404).json({
        success: false,
        message: 'Billing record not found'
      });
    }

    // Update status
    await billingRecord.update({
      status,
      notes: notes || billingRecord.notes,
      processedAt: new Date(),
      processedBy: processedBy || req.user.id
    });

    res.json({
      success: true,
      message: 'Billing status updated successfully',
      data: billingRecord
    });
  } catch (error) {
    console.error('Error updating billing status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update billing status',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * POST /api/admin/billing-payments/retry-failed
 * Retry failed payments
 */
exports.retryFailedPayments = async (req, res) => {
  try {
    const { paymentIds } = req.body;

    if (!paymentIds || !Array.isArray(paymentIds)) {
      return res.status(400).json({
        success: false,
        message: 'Payment IDs array is required'
      });
    }

    const result = await billingPaymentsService.retryFailedPayments(paymentIds);

    res.json({
      success: true,
      message: `Retry initiated for ${result.updated} payments`,
      data: result
    });
  } catch (error) {
    console.error('Error retrying failed payments:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retry payments',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};
