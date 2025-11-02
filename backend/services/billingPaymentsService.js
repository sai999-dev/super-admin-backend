/**
 * Billing & Payments Service
 * Business logic for billing operations, calculations, and reporting
 */

const { BillingHistory, Agency, Subscription, SubscriptionPlan } = require('../models');
const { Op } = require('sequelize');

/**
 * Get billing summary for dashboard
 */
const getBillingSummary = async (filters = {}) => {
  try {
    const { dateRange = 'last30days', agencyId, planId } = filters;
    
    const dateFilter = getDateRangeFilter(dateRange);
    const where = { billing_date: dateFilter };
    
    if (agencyId) where.agencyId = agencyId;
    if (planId) where.planId = planId;

    // Get total revenue
    const totalRevenue = await BillingHistory.sum('totalAmount', {
      where: { ...where, status: 'COMPLETED' }
    }) || 0;

    // Get this month's revenue
    const thisMonth = new Date();
    thisMonth.setDate(1);
    thisMonth.setHours(0, 0, 0, 0);
    
    const thisMonthRevenue = await BillingHistory.sum('totalAmount', {
      where: {
        ...where,
        status: 'COMPLETED',
        billing_date: {
          [Op.gte]: thisMonth
        }
      }
    }) || 0;

    // Get pending payments
    const pendingPayments = await BillingHistory.sum('totalAmount', {
      where: { ...where, status: 'PENDING' }
    }) || 0;

    // Get failed payments count
    const failedPaymentsCount = await BillingHistory.count({
      where: { ...where, status: 'FAILED' }
    });

    // Get payment method breakdown
    const paymentMethodBreakdown = await BillingHistory.findAll({
      attributes: [
        'paymentMethod',
        [BillingHistory.sequelize.fn('COUNT', BillingHistory.sequelize.col('id')), 'count'],
        [BillingHistory.sequelize.fn('SUM', BillingHistory.sequelize.col('totalAmount')), 'total']
      ],
      where: { ...where, status: 'COMPLETED' },
      group: ['paymentMethod'],
      raw: true
    });

    // Get status breakdown
    const statusBreakdown = await BillingHistory.findAll({
      attributes: [
        'status',
        [BillingHistory.sequelize.fn('COUNT', BillingHistory.sequelize.col('id')), 'count'],
        [BillingHistory.sequelize.fn('SUM', BillingHistory.sequelize.col('totalAmount')), 'total']
      ],
      where,
      group: ['status'],
      raw: true
    });

    // Get recent transactions
    const recentTransactions = await BillingHistory.findAll({
      where,
      include: [
        {
          model: Agency,
          as: 'agency',
          attributes: ['businessName']
        }
      ],
      order: [['billing_date', 'DESC']],
      limit: 5
    });

    return {
      totalRevenue: parseFloat(totalRevenue),
      thisMonthRevenue: parseFloat(thisMonthRevenue),
      pendingPayments: parseFloat(pendingPayments),
      failedPaymentsCount,
      paymentMethodBreakdown,
      statusBreakdown,
      recentTransactions
    };
  } catch (error) {
    console.error('Error getting billing summary:', error);
    throw error;
  }
};

/**
 * Calculate totals for billing history
 */
const calculateTotals = async (where = {}) => {
  try {
    const totals = await BillingHistory.findAll({
      attributes: [
        [BillingHistory.sequelize.fn('COUNT', BillingHistory.sequelize.col('id')), 'totalRecords'],
        [BillingHistory.sequelize.fn('SUM', BillingHistory.sequelize.col('totalAmount')), 'totalAmount'],
        [BillingHistory.sequelize.fn('AVG', BillingHistory.sequelize.col('totalAmount')), 'averageAmount']
      ],
      where,
      raw: true
    });

    return totals[0] || {
      totalRecords: 0,
      totalAmount: 0,
      averageAmount: 0
    };
  } catch (error) {
    console.error('Error calculating totals:', error);
    throw error;
  }
};

/**
 * Get date range filter
 */
const getDateRangeFilter = (dateRange) => {
  const now = new Date();
  const startDate = new Date();

  switch (dateRange) {
    case 'last7days':
      startDate.setDate(now.getDate() - 7);
      break;
    case 'last30days':
      startDate.setDate(now.getDate() - 30);
      break;
    case 'last90days':
      startDate.setDate(now.getDate() - 90);
      break;
    case 'thisMonth':
      startDate.setDate(1);
      break;
    case 'lastMonth':
      startDate.setMonth(now.getMonth() - 1);
      startDate.setDate(1);
      break;
    case 'thisYear':
      startDate.setMonth(0);
      startDate.setDate(1);
      break;
    default:
      return {};
  }

  return {
    [Op.gte]: startDate,
    [Op.lte]: now
  };
};

/**
 * Export billing data to CSV
 */
const exportToCSV = async (billingData) => {
  try {
    const headers = [
      'Billing Date',
      'Agency Name',
      'Plan Name',
      'Amount',
      'Status',
      'Payment Method',
      'Transaction ID',
      'Due Date',
      'Processed Date'
    ];

    const rows = billingData.map(record => [
      record.billing_date.toISOString().split('T')[0],
      record.agency?.businessName || '',
      record.plan?.name || '',
      record.totalAmount,
      record.status,
      record.paymentMethod || '',
      record.transactionId || '',
      record.dueDate.toISOString().split('T')[0],
      record.processedAt ? record.processedAt.toISOString().split('T')[0] : ''
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(field => `"${field}"`).join(','))
      .join('\n');

    return csvContent;
  } catch (error) {
    console.error('Error exporting to CSV:', error);
    throw error;
  }
};

/**
 * Retry failed payments
 */
const retryFailedPayments = async (paymentIds) => {
  try {
    const result = await BillingHistory.update(
      {
        status: 'PENDING',
        retryCount: BillingHistory.sequelize.literal('retry_count + 1'),
        nextRetryDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
        updatedAt: new Date()
      },
      {
        where: {
          id: {
            [Op.in]: paymentIds
          },
          status: 'FAILED'
        }
      }
    );

    return {
      updated: result[0],
      paymentIds
    };
  } catch (error) {
    console.error('Error retrying failed payments:', error);
    throw error;
  }
};

/**
 * Generate billing records for subscriptions
 */
const generateBillingRecords = async (subscriptionId, billingPeriod) => {
  try {
    const subscription = await Subscription.findByPk(subscriptionId, {
      include: [
        {
          model: Agency,
          as: 'agency'
        },
        {
          model: SubscriptionPlan,
          as: 'plan'
        }
      ]
    });

    if (!subscription) {
      throw new Error('Subscription not found');
    }

    const billingDate = new Date();
    const dueDate = new Date(billingDate);
    dueDate.setDate(dueDate.getDate() + 30); // 30 days grace period

    // Calculate billing amount based on territory usage
    const territoryCount = await subscription.countTerritories();
    const baseAmount = subscription.plan.pricePerUnit * subscription.minUnits;
    const additionalAmount = Math.max(0, (territoryCount - subscription.minUnits) * subscription.plan.pricePerUnit);
    const totalAmount = baseAmount + additionalAmount;

    const billingRecord = await BillingHistory.create({
      agencyId: subscription.agencyId,
      subscriptionId: subscription.id,
      planId: subscription.planId,
      billingDate,
      dueDate,
      amount: totalAmount,
      status: 'PENDING',
      billingPeriod,
      unitsUsed: territoryCount,
      unitPrice: subscription.plan.pricePerUnit,
      baseAmount,
      additionalAmount,
      totalAmount
    });

    return billingRecord;
  } catch (error) {
    console.error('Error generating billing record:', error);
    throw error;
  }
};

/**
 * Process payment for billing record
 */
const processPayment = async (billingId, paymentData) => {
  try {
    const billingRecord = await BillingHistory.findByPk(billingId);
    if (!billingRecord) {
      throw new Error('Billing record not found');
    }

    // Update billing record with payment information
    await billingRecord.update({
      status: 'COMPLETED',
      paymentMethod: paymentData.paymentMethod,
      paymentReference: paymentData.paymentReference,
      transactionId: paymentData.transactionId,
      processedAt: new Date(),
      processedBy: paymentData.processedBy
    });

    return billingRecord;
  } catch (error) {
    console.error('Error processing payment:', error);
    throw error;
  }
};

/**
 * Get billing analytics
 */
const getBillingAnalytics = async (filters = {}) => {
  try {
    const { dateRange = 'last30days', groupBy = 'day' } = filters;
    const dateFilter = getDateRangeFilter(dateRange);

    let groupFormat;
    switch (groupBy) {
      case 'day':
        groupFormat = '%Y-%m-%d';
        break;
      case 'week':
        groupFormat = '%Y-%u';
        break;
      case 'month':
        groupFormat = '%Y-%m';
        break;
      default:
        groupFormat = '%Y-%m-%d';
    }

    const analytics = await BillingHistory.findAll({
      attributes: [
        [BillingHistory.sequelize.fn('DATE_FORMAT', BillingHistory.sequelize.col('billing_date'), groupFormat), 'period'],
        [BillingHistory.sequelize.fn('COUNT', BillingHistory.sequelize.col('id')), 'transactionCount'],
        [BillingHistory.sequelize.fn('SUM', BillingHistory.sequelize.col('totalAmount')), 'totalRevenue'],
        [BillingHistory.sequelize.fn('AVG', BillingHistory.sequelize.col('totalAmount')), 'averageAmount']
      ],
      where: {
        billing_date: dateFilter,
        status: 'COMPLETED'
      },
      group: [BillingHistory.sequelize.fn('DATE_FORMAT', BillingHistory.sequelize.col('billing_date'), groupFormat)],
      order: [[BillingHistory.sequelize.fn('DATE_FORMAT', BillingHistory.sequelize.col('billing_date'), groupFormat), 'ASC']],
      raw: true
    });

    return analytics;
  } catch (error) {
    console.error('Error getting billing analytics:', error);
    throw error;
  }
};

module.exports = {
  getBillingSummary,
  calculateTotals,
  getDateRangeFilter,
  exportToCSV,
  retryFailedPayments,
  generateBillingRecords,
  processPayment,
  getBillingAnalytics
};
