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
      unique: true
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    unitType: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'unit_type'
    },
    pricePerUnit: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      field: 'price_per_unit'
    },
    maxUnits: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'max_units'
    },
    minUnits: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'min_units'
    },
    billingCycle: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'monthly',
      field: 'billing_cycle'
    },
    trialDays: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'trial_days'
    },
    features: {
      type: DataTypes.JSONB,
      allowNull: true
    },
    sortOrder: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'sort_order'
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'is_active'
    }
  }, {
    tableName: 'subscription_plans',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  SubscriptionPlan.associate = (models) => {
    SubscriptionPlan.hasMany(models.Subscription, {
      foreignKey: 'plan_id',
      as: 'subscriptions'
    });
  };

  return SubscriptionPlan;
};
