/**
 * Agency Service
 * Business logic for agency management and operations
 */

const { Agency, User, Subscription, ActiveSubscription, Territory, LeadAssignment, SubscriptionPlan } = require('../models');
const { Op } = require('sequelize');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

/**
 * Get agencies summary for dashboard
 */
const getAgenciesSummary = async (filters = {}) => {
  try {
    const { dateRange = 'all', status, search } = filters;
    
    const dateFilter = getDateRangeFilter(dateRange);
    const where = { ...dateFilter };
    
    if (status) where.accountStatus = status;
    if (search) {
      where[Op.or] = [
        { businessName: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } }
      ];
    }

    // Get total agencies
    const totalAgencies = await Agency.count({ where });

    // Get active agencies
    const activeAgencies = await Agency.count({
      where: { ...where, accountStatus: 'ACTIVE' }
    });

    // Get agencies with active subscriptions
    const agenciesWithSubscriptions = await Agency.count({
      include: [
        {
          model: ActiveSubscription,
          as: 'activeSubscriptions',
          where: { status: 'ACTIVE' },
          required: true
        }
      ],
      where
    });

    // Get new agencies this month
    const thisMonth = new Date();
    thisMonth.setDate(1);
    thisMonth.setHours(0, 0, 0, 0);
    
    const newThisMonth = await Agency.count({
      where: {
        ...where,
        createdAt: {
          [Op.gte]: thisMonth
        }
      }
    });

    // Get status breakdown
    const statusBreakdown = await Agency.findAll({
      attributes: [
        'accountStatus',
        [Agency.sequelize.fn('COUNT', Agency.sequelize.col('id')), 'count']
      ],
      where,
      group: ['accountStatus'],
      raw: true
    });

    // Get subscription analytics
    const subscriptionAnalytics = await Agency.findAll({
      attributes: [
        [Agency.sequelize.fn('COUNT', Agency.sequelize.col('Agency.id')), 'totalAgencies'],
        [Agency.sequelize.fn('COUNT', Agency.sequelize.col('activeSubscriptions.id')), 'agenciesWithSubscriptions'],
        [Agency.sequelize.fn('SUM', Agency.sequelize.col('activeSubscriptions.monthly_cost')), 'totalMonthlyRevenue']
      ],
      include: [
        {
          model: ActiveSubscription,
          as: 'activeSubscriptions',
          attributes: [],
          where: { status: 'ACTIVE' },
          required: false
        }
      ],
      where,
      raw: true
    });

    return {
      totalAgencies,
      activeAgencies,
      agenciesWithSubscriptions,
      newThisMonth,
      statusBreakdown,
      subscriptionAnalytics: subscriptionAnalytics[0] || {
        totalAgencies: 0,
        agenciesWithSubscriptions: 0,
        totalMonthlyRevenue: 0
      }
    };
  } catch (error) {
    console.error('Error getting agencies summary:', error);
    throw error;
  }
};

/**
 * Calculate totals for agencies
 */
const calculateAgenciesTotals = async (where = {}) => {
  try {
    const totals = await Agency.findAll({
      attributes: [
        [Agency.sequelize.fn('COUNT', Agency.sequelize.col('id')), 'totalRecords'],
        [Agency.sequelize.fn('COUNT', Agency.sequelize.col('CASE WHEN account_status = \'ACTIVE\' THEN 1 END')), 'activeCount'],
        [Agency.sequelize.fn('COUNT', Agency.sequelize.col('CASE WHEN account_status = \'SUSPENDED\' THEN 1 END')), 'suspendedCount']
      ],
      where,
      raw: true
    });

    return totals[0] || {
      totalRecords: 0,
      activeCount: 0,
      suspendedCount: 0
    };
  } catch (error) {
    console.error('Error calculating agencies totals:', error);
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
 * Generate default password for new agency
 */
const generateDefaultPassword = () => {
  return crypto.randomBytes(8).toString('hex');
};

/**
 * Hash password
 */
const hashPassword = async (password) => {
  const saltRounds = 12;
  return await bcrypt.hash(password, saltRounds);
};

/**
 * Add territories to agency
 */
const addTerritoriesToAgency = async (agencyId, territories) => {
  try {
    const territoryRecords = territories.map(territory => ({
      ...territory,
      agencyId,
      createdAt: new Date(),
      updatedAt: new Date()
    }));

    await Territory.bulkCreate(territoryRecords);
  } catch (error) {
    console.error('Error adding territories to agency:', error);
    throw error;
  }
};

/**
 * Update agency territories
 */
const updateAgencyTerritories = async (agencyId, territories) => {
  try {
    // Remove existing territories
    await Territory.destroy({
      where: { agencyId }
    });

    // Add new territories
    if (territories && territories.length > 0) {
      await addTerritoriesToAgency(agencyId, territories);
    }
  } catch (error) {
    console.error('Error updating agency territories:', error);
    throw error;
  }
};

/**
 * Create agency subscription
 */
const createAgencySubscription = async (agencyId, subscriptionPlan) => {
  try {
    const { planId, startDate, endDate, monthlyCost, billingCycle } = subscriptionPlan;

    // Create subscription
    const subscription = await Subscription.create({
      agencyId,
      planId,
      status: 'ACTIVE',
      billingCycle: billingCycle || 'MONTHLY',
      autoRenew: true,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      createdBy: 'system'
    });

    // Create active subscription
    const activeSubscription = await ActiveSubscription.create({
      agencyId,
      planId,
      subscriptionId: subscription.id,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      monthlyCost: parseFloat(monthlyCost),
      totalCost: calculateTotalCost(monthlyCost, billingCycle, startDate, endDate),
      status: 'ACTIVE',
      billingCycle: billingCycle || 'MONTHLY',
      autoRenew: true,
      createdBy: 'system'
    });

    return { subscription, activeSubscription };
  } catch (error) {
    console.error('Error creating agency subscription:', error);
    throw error;
  }
};

/**
 * Calculate total cost based on billing cycle
 */
const calculateTotalCost = (monthlyCost, billingCycle, startDate, endDate) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const months = Math.ceil((end - start) / (1000 * 60 * 60 * 24 * 30)); // Approximate months
  
  let multiplier = 1;
  switch (billingCycle) {
    case 'QUARTERLY':
      multiplier = 3;
      break;
    case 'YEARLY':
      multiplier = 12;
      break;
    default:
      multiplier = 1;
  }
  
  return monthlyCost * months * multiplier;
};

/**
 * Get agency analytics
 */
const getAgencyAnalytics = async (agencyId) => {
  try {
    // Get subscription analytics
    const subscriptionStats = await ActiveSubscription.findAll({
      attributes: [
        [ActiveSubscription.sequelize.fn('COUNT', ActiveSubscription.sequelize.col('id')), 'totalSubscriptions'],
        [ActiveSubscription.sequelize.fn('SUM', ActiveSubscription.sequelize.col('monthly_cost')), 'totalMonthlyRevenue'],
        [ActiveSubscription.sequelize.fn('AVG', ActiveSubscription.sequelize.col('monthly_cost')), 'averageMonthlyCost']
      ],
      where: { agencyId },
      raw: true
    });

    // Get territory analytics
    const territoryStats = await Territory.findAll({
      attributes: [
        'type',
        [Territory.sequelize.fn('COUNT', Territory.sequelize.col('id')), 'count']
      ],
      where: { agencyId },
      group: ['type'],
      raw: true
    });

    // Get lead assignment analytics
    const leadStats = await LeadAssignment.findAll({
      attributes: [
        [LeadAssignment.sequelize.fn('COUNT', LeadAssignment.sequelize.col('id')), 'totalAssignments'],
        [LeadAssignment.sequelize.fn('COUNT', LeadAssignment.sequelize.col('CASE WHEN status = \'ACTIVE\' THEN 1 END')), 'activeAssignments']
      ],
      where: { agencyId },
      raw: true
    });

    // Get user analytics
    const userStats = await User.findAll({
      attributes: [
        [User.sequelize.fn('COUNT', User.sequelize.col('id')), 'totalUsers'],
        [User.sequelize.fn('COUNT', User.sequelize.col('CASE WHEN is_active = true THEN 1 END')), 'activeUsers']
      ],
      where: { agencyId },
      raw: true
    });

    return {
      subscriptions: subscriptionStats[0] || {
        totalSubscriptions: 0,
        totalMonthlyRevenue: 0,
        averageMonthlyCost: 0
      },
      territories: territoryStats,
      leads: leadStats[0] || {
        totalAssignments: 0,
        activeAssignments: 0
      },
      users: userStats[0] || {
        totalUsers: 0,
        activeUsers: 0
      }
    };
  } catch (error) {
    console.error('Error getting agency analytics:', error);
    throw error;
  }
};

/**
 * Export agencies to CSV
 */
const exportToCSV = async (agencies) => {
  try {
    const headers = [
      'Business Name',
      'Email',
      'Phone Number',
      'Address',
      'City',
      'State',
      'Zip Code',
      'Country',
      'Website',
      'Account Status',
      'Created At',
      'Last Updated',
      'Admin Users',
      'Total Users'
    ];

    const rows = agencies.map(agency => [
      agency.businessName,
      agency.email,
      agency.phoneNumber || '',
      agency.address || '',
      agency.city || '',
      agency.state || '',
      agency.zipCode || '',
      agency.country || '',
      agency.website || '',
      agency.accountStatus,
      agency.createdAt.toISOString().split('T')[0],
      agency.updatedAt.toISOString().split('T')[0],
      agency.users?.filter(user => user.role === 'AGENCY_ADMIN').length || 0,
      agency.users?.length || 0
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
 * Get agencies with expiring subscriptions
 */
const getAgenciesWithExpiringSubscriptions = async (days = 30) => {
  try {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    const agencies = await Agency.findAll({
      include: [
        {
          model: ActiveSubscription,
          as: 'activeSubscriptions',
          where: {
            status: 'ACTIVE',
            endDate: {
              [Op.lte]: futureDate,
              [Op.gte]: new Date()
            }
          },
          required: true
        }
      ],
      order: [['activeSubscriptions', 'endDate', 'ASC']]
    });

    return agencies;
  } catch (error) {
    console.error('Error getting agencies with expiring subscriptions:', error);
    throw error;
  }
};

/**
 * Get agency performance metrics
 */
const getAgencyPerformanceMetrics = async (agencyId, dateRange = 'last30days') => {
  try {
    const dateFilter = getDateRangeFilter(dateRange);

    // Get lead conversion metrics
    const leadMetrics = await LeadAssignment.findAll({
      attributes: [
        [LeadAssignment.sequelize.fn('COUNT', LeadAssignment.sequelize.col('id')), 'totalLeads'],
        [LeadAssignment.sequelize.fn('COUNT', LeadAssignment.sequelize.col('CASE WHEN status = \'CONVERTED\' THEN 1 END')), 'convertedLeads'],
        [LeadAssignment.sequelize.fn('COUNT', LeadAssignment.sequelize.col('CASE WHEN status = \'ACTIVE\' THEN 1 END')), 'activeLeads']
      ],
      where: {
        agencyId,
        assignedAt: dateFilter
      },
      raw: true
    });

    // Get subscription revenue metrics
    const revenueMetrics = await ActiveSubscription.findAll({
      attributes: [
        [ActiveSubscription.sequelize.fn('SUM', ActiveSubscription.sequelize.col('monthly_cost')), 'totalRevenue'],
        [ActiveSubscription.sequelize.fn('AVG', ActiveSubscription.sequelize.col('monthly_cost')), 'averageRevenue']
      ],
      where: {
        agencyId,
        status: 'ACTIVE'
      },
      raw: true
    });

    return {
      leads: leadMetrics[0] || {
        totalLeads: 0,
        convertedLeads: 0,
        activeLeads: 0
      },
      revenue: revenueMetrics[0] || {
        totalRevenue: 0,
        averageRevenue: 0
      }
    };
  } catch (error) {
    console.error('Error getting agency performance metrics:', error);
    throw error;
  }
};

module.exports = {
  getAgenciesSummary,
  calculateAgenciesTotals,
  getDateRangeFilter,
  generateDefaultPassword,
  hashPassword,
  addTerritoriesToAgency,
  updateAgencyTerritories,
  createAgencySubscription,
  calculateTotalCost,
  getAgencyAnalytics,
  exportToCSV,
  getAgenciesWithExpiringSubscriptions,
  getAgencyPerformanceMetrics
};
