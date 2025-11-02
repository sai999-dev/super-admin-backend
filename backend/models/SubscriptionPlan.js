/**
 * SubscriptionPlan Model
 * Defines subscription plans with pricing tiers and territory limits
 */

module.exports = (sequelize, DataTypes) => {
  const SubscriptionPlan = sequelize.define('SubscriptionPlan', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
      validate: {
        notEmpty: true,
        len: [3, 100]
      }
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    unitType: {
      type: DataTypes.ENUM('zipcode', 'city', 'county', 'state'),
      allowNull: false,
      defaultValue: 'zipcode',
      field: 'unit_type'
    },
    pricePerUnit: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      validate: {
        min: 0,
        isDecimal: true
      },
      field: 'price_per_unit'
    },
    maxUnits: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: {
        min: 1
      },
      field: 'max_units',
      comment: 'Maximum territories allowed, null = unlimited'
    },
    minUnits: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      validate: {
        min: 1
      },
      field: 'min_units'
    },
    billingCycle: {
      type: DataTypes.ENUM('monthly', 'quarterly', 'yearly'),
      allowNull: false,
      defaultValue: 'monthly',
      field: 'billing_cycle'
    },
    trialDays: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: {
        min: 0,
        max: 365
      },
      field: 'trial_days'
    },
    features: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
      comment: 'Additional features like lead_priority, analytics_access, etc.'
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'is_active'
    },
    sortOrder: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'sort_order',
      comment: 'Display order in UI'
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {}
    }
  }, {
    tableName: 'subscription_plans',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        fields: ['is_active']
      },
      {
        fields: ['unit_type']
      },
      {
        fields: ['sort_order']
      }
    ]
  });

  SubscriptionPlan.associate = (models) => {
    SubscriptionPlan.hasMany(models.Subscription, {
      foreignKey: 'plan_id',
      as: 'subscriptions'
    });
  };

  return SubscriptionPlan;
};
