/**
 * Mobile Subscription Plan Model
 * Defines mobile app subscription plans with features and pricing
 */

module.exports = (sequelize, DataTypes) => {
  const MobileSubscriptionPlan = sequelize.define('MobileSubscriptionPlan', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    planName: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'plan_name',
      validate: {
        notEmpty: true,
        len: [3, 100]
      }
    },
    monthlyPrice: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      field: 'monthly_price',
      validate: {
        min: 0,
        isDecimal: true
      }
    },
    features: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
      comment: 'Mobile app features like push_notifications, in_app_messaging, etc.'
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'is_active'
    }
  }, {
    tableName: 'mobile_subscription_plans',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        fields: ['is_active']
      },
      {
        fields: ['plan_name']
      }
    ]
  });

  MobileSubscriptionPlan.associate = function(models) {
    MobileSubscriptionPlan.hasMany(models.AgencyMobileSubscription, {
      foreignKey: 'planId',
      as: 'subscriptions'
    });
  };

  return MobileSubscriptionPlan;
};
