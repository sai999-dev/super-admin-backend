/**
 * Subscription Model
 * Manages agency subscriptions to plans
 */

module.exports = (sequelize, DataTypes) => {
  const Subscription = sequelize.define('Subscription', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    agencyId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'agency_id',
      references: {
        model: 'agencies',
        key: 'id'
      }
    },
    planId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'plan_id',
      references: {
        model: 'subscription_plans',
        key: 'id'
      }
    },
    status: {
      type: DataTypes.ENUM('trial', 'active', 'suspended', 'cancelled', 'expired'),
      allowNull: false,
      defaultValue: 'trial'
    },
    currentUnits: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: {
        min: 0
      },
      field: 'current_units',
      comment: 'Number of territories currently assigned'
    },
    maxUnits: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'max_units',
      comment: 'Override plan max_units if custom pricing'
    },
    customPricePerUnit: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      field: 'custom_price_per_unit',
      comment: 'Override plan pricing for this subscription'
    },
    billingCycle: {
      type: DataTypes.ENUM('monthly', 'quarterly', 'yearly'),
      allowNull: false,
      defaultValue: 'monthly',
      field: 'billing_cycle'
    },
    startDate: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'start_date'
    },
    endDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'end_date'
    },
    trialEndDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'trial_end_date'
    },
    nextBillingDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'next_billing_date'
    },
    lastBillingDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_billing_date'
    },
    autoRenew: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'auto_renew'
    },
    cancelledAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'cancelled_at'
    },
    cancelledBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'cancelled_by',
      comment: 'Admin user ID who cancelled'
    },
    cancellationReason: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'cancellation_reason'
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {}
    }
  }, {
    tableName: 'subscriptions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        fields: ['agency_id']
      },
      {
        fields: ['plan_id']
      },
      {
        fields: ['status']
      },
      {
        fields: ['next_billing_date']
      },
      {
        fields: ['trial_end_date']
      }
    ]
  });

  Subscription.associate = (models) => {
    Subscription.belongsTo(models.Agency, {
      foreignKey: 'agency_id',
      as: 'agency'
    });

    Subscription.belongsTo(models.SubscriptionPlan, {
      foreignKey: 'plan_id',
      as: 'plan'
    });

    Subscription.hasMany(models.Territory, {
      foreignKey: 'subscription_id',
      as: 'territories'
    });
  };

  return Subscription;
};
