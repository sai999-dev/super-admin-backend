const { Sequelize } = require('sequelize');
const config = require('../config/database');

// Get environment-specific config
const env = process.env.NODE_ENV || 'development';
const dbConfig = config[env];

// Create Sequelize instance
const sequelize = new Sequelize(dbConfig.database, dbConfig.username, dbConfig.password, {
  host: dbConfig.host,
  port: dbConfig.port,
  dialect: 'postgres',
  logging: dbConfig.logging,
  pool: dbConfig.pool,
  dialectOptions: dbConfig.dialectOptions
});

// Import models
const Lead = require('./Lead')(sequelize, Sequelize.DataTypes);
const LeadAssignment = require('./LeadAssignment')(sequelize, Sequelize.DataTypes);
const Portal = require('./Portal')(sequelize, Sequelize.DataTypes);
const Agency = require('./Agency')(sequelize, Sequelize.DataTypes);
const AuditLog = require('./AuditLog')(sequelize, Sequelize.DataTypes);
const WebhookAudit = require('./WebhookAudit')(sequelize, Sequelize.DataTypes);
const User = require('./User')(sequelize, Sequelize.DataTypes);
const SubscriptionPlan = require('./SubscriptionPlan')(sequelize, Sequelize.DataTypes);
const Subscription = require('./Subscription')(sequelize, Sequelize.DataTypes);
const Territory = require('./Territory')(sequelize, Sequelize.DataTypes);
const BillingHistory = require('./BillingHistory')(sequelize, Sequelize.DataTypes);
const ActiveSubscription = require('./ActiveSubscription')(sequelize, Sequelize.DataTypes);

// Enhanced lead management models
const LeadPurchase = require('./LeadPurchase')(sequelize, Sequelize.DataTypes);
const LeadInteraction = require('./LeadInteraction')(sequelize, Sequelize.DataTypes);
const Transaction = require('./Transaction')(sequelize, Sequelize.DataTypes);
const Notification = require('./Notification')(sequelize, Sequelize.DataTypes);

// Mobile messaging models
const MobileSubscriptionPlan = require('./MobileSubscriptionPlan')(sequelize, Sequelize.DataTypes);
const AgencyMobileSubscription = require('./AgencyMobileSubscription')(sequelize, Sequelize.DataTypes);
const MobileSubscriptionArea = require('./MobileSubscriptionArea')(sequelize, Sequelize.DataTypes);
const MobileLeadDistribution = require('./MobileLeadDistribution')(sequelize, Sequelize.DataTypes);
const MobileLeadAssignment = require('./MobileLeadAssignment')(sequelize, Sequelize.DataTypes);
const PushNotification = require('./PushNotification')(sequelize, Sequelize.DataTypes);
const MobileConversation = require('./MobileConversation')(sequelize, Sequelize.DataTypes);
const MobileMessage = require('./MobileMessage')(sequelize, Sequelize.DataTypes);
const MobileMessageTemplate = require('./MobileMessageTemplate')(sequelize, Sequelize.DataTypes);
const MobileAppAnalytic = require('./MobileAppAnalytic')(sequelize, Sequelize.DataTypes);
const MobilePerformanceDaily = require('./MobilePerformanceDaily')(sequelize, Sequelize.DataTypes);

// Define associations
Lead.hasMany(LeadAssignment, { foreignKey: 'leadId', as: 'assignments' });
LeadAssignment.belongsTo(Lead, { foreignKey: 'leadId', as: 'lead' });
LeadAssignment.belongsTo(Agency, { foreignKey: 'agencyId', as: 'agency' });
Lead.belongsTo(Portal, { foreignKey: 'portalId', as: 'portal' });
WebhookAudit.belongsTo(Lead, { foreignKey: 'leadId', as: 'lead' });
WebhookAudit.belongsTo(Portal, { foreignKey: 'portalId', as: 'portal' });
Agency.hasMany(LeadAssignment, { foreignKey: 'agencyId', as: 'leadAssignments' });
User.belongsTo(Agency, { foreignKey: 'agencyId', as: 'agency' });

// Subscription-related associations
Agency.hasMany(Subscription, { foreignKey: 'agencyId', as: 'subscriptions' });
Subscription.belongsTo(Agency, { foreignKey: 'agencyId', as: 'agency' });
Subscription.belongsTo(SubscriptionPlan, { foreignKey: 'planId', as: 'plan' });
SubscriptionPlan.hasMany(Subscription, { foreignKey: 'planId', as: 'subscriptions' });
Subscription.hasMany(Territory, { foreignKey: 'subscriptionId', as: 'territories' });
Territory.belongsTo(Subscription, { foreignKey: 'subscriptionId', as: 'subscription' });
Subscription.hasMany(BillingHistory, { foreignKey: 'subscriptionId', as: 'billingHistory' });
BillingHistory.belongsTo(Subscription, { foreignKey: 'subscriptionId', as: 'subscription' });
BillingHistory.belongsTo(Agency, { foreignKey: 'agencyId', as: 'agency' });
BillingHistory.belongsTo(SubscriptionPlan, { foreignKey: 'planId', as: 'plan' });
BillingHistory.belongsTo(User, { foreignKey: 'processedBy', as: 'processedByUser' });

// Active Subscription associations
ActiveSubscription.belongsTo(Agency, { foreignKey: 'agencyId', as: 'agency' });
ActiveSubscription.belongsTo(SubscriptionPlan, { foreignKey: 'planId', as: 'plan' });
ActiveSubscription.belongsTo(Subscription, { foreignKey: 'subscriptionId', as: 'subscription' });
ActiveSubscription.belongsTo(User, { foreignKey: 'createdBy', as: 'createdByUser' });
ActiveSubscription.belongsTo(User, { foreignKey: 'updatedBy', as: 'updatedByUser' });
ActiveSubscription.hasMany(Territory, { foreignKey: 'activeSubscriptionId', as: 'territories' });

// Enhanced lead management associations
Lead.hasMany(LeadPurchase, { foreignKey: 'leadId', as: 'purchases' });
LeadPurchase.belongsTo(Lead, { foreignKey: 'leadId', as: 'lead' });
LeadPurchase.belongsTo(Agency, { foreignKey: 'agencyId', as: 'agency' });

Lead.hasMany(LeadInteraction, { foreignKey: 'leadId', as: 'interactions' });
LeadInteraction.belongsTo(Lead, { foreignKey: 'leadId', as: 'lead' });
LeadInteraction.belongsTo(Agency, { foreignKey: 'agencyId', as: 'agency' });

Agency.hasMany(Transaction, { foreignKey: 'agencyId', as: 'transactions' });
Transaction.belongsTo(Agency, { foreignKey: 'agencyId', as: 'agency' });

Agency.hasMany(Notification, { foreignKey: 'agencyId', as: 'notifications' });
Notification.belongsTo(Agency, { foreignKey: 'agencyId', as: 'agency' });

// Mobile messaging associations
MobileSubscriptionPlan.hasMany(AgencyMobileSubscription, { foreignKey: 'planId', as: 'subscriptions' });
AgencyMobileSubscription.belongsTo(Agency, { foreignKey: 'agencyId', as: 'agency' });
AgencyMobileSubscription.belongsTo(MobileSubscriptionPlan, { foreignKey: 'planId', as: 'plan' });
AgencyMobileSubscription.hasMany(MobileSubscriptionArea, { foreignKey: 'mobileSubscriptionId', as: 'areas' });
AgencyMobileSubscription.hasMany(MobileLeadAssignment, { foreignKey: 'mobileSubscriptionId', as: 'leadAssignments' });
AgencyMobileSubscription.hasMany(PushNotification, { foreignKey: 'mobileSubscriptionId', as: 'notifications' });
AgencyMobileSubscription.hasMany(MobileAppAnalytic, { foreignKey: 'mobileSubscriptionId', as: 'analytics' });
AgencyMobileSubscription.hasMany(MobilePerformanceDaily, { foreignKey: 'mobileSubscriptionId', as: 'performanceMetrics' });

MobileSubscriptionArea.belongsTo(AgencyMobileSubscription, { foreignKey: 'mobileSubscriptionId', as: 'mobileSubscription' });

MobileLeadDistribution.belongsTo(Lead, { foreignKey: 'leadId', as: 'lead' });
MobileLeadDistribution.hasMany(MobileLeadAssignment, { foreignKey: 'mobileDistributionId', as: 'assignments' });

MobileLeadAssignment.belongsTo(MobileLeadDistribution, { foreignKey: 'mobileDistributionId', as: 'mobileDistribution' });
MobileLeadAssignment.belongsTo(Agency, { foreignKey: 'agencyId', as: 'agency' });
MobileLeadAssignment.belongsTo(AgencyMobileSubscription, { foreignKey: 'mobileSubscriptionId', as: 'mobileSubscription' });

PushNotification.belongsTo(Agency, { foreignKey: 'agencyId', as: 'agency' });
PushNotification.belongsTo(AgencyMobileSubscription, { foreignKey: 'mobileSubscriptionId', as: 'mobileSubscription' });

MobileConversation.belongsTo(Lead, { foreignKey: 'leadId', as: 'lead' });
MobileConversation.belongsTo(Agency, { foreignKey: 'agencyId', as: 'agency' });
MobileConversation.hasMany(MobileMessage, { foreignKey: 'conversationId', as: 'messages' });

MobileMessage.belongsTo(MobileConversation, { foreignKey: 'conversationId', as: 'conversation' });
MobileMessage.belongsTo(MobileMessageTemplate, { foreignKey: 'templateId', as: 'template' });

MobileMessageTemplate.belongsTo(Agency, { foreignKey: 'agencyId', as: 'agency' });
MobileMessageTemplate.hasMany(MobileMessage, { foreignKey: 'templateId', as: 'messages' });

MobileAppAnalytic.belongsTo(Agency, { foreignKey: 'agencyId', as: 'agency' });
MobileAppAnalytic.belongsTo(AgencyMobileSubscription, { foreignKey: 'mobileSubscriptionId', as: 'mobileSubscription' });

MobilePerformanceDaily.belongsTo(Agency, { foreignKey: 'agencyId', as: 'agency' });
MobilePerformanceDaily.belongsTo(AgencyMobileSubscription, { foreignKey: 'mobileSubscriptionId', as: 'mobileSubscription' });

// Export models and sequelize instance
module.exports = {
  sequelize,
  Lead,
  LeadAssignment,
  Portal,
  Agency,
  AuditLog,
  WebhookAudit,
  User,
  SubscriptionPlan,
  Subscription,
  Territory,
  BillingHistory,
  ActiveSubscription,
  // Enhanced lead management models
  LeadPurchase,
  LeadInteraction,
  Transaction,
  Notification,
  // Mobile messaging models
  MobileSubscriptionPlan,
  AgencyMobileSubscription,
  MobileSubscriptionArea,
  MobileLeadDistribution,
  MobileLeadAssignment,
  PushNotification,
  MobileConversation,
  MobileMessage,
  MobileMessageTemplate,
  MobileAppAnalytic,
  MobilePerformanceDaily
};

