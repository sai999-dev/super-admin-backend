/**
 * ActiveSubscription Model
 * Manages active agency subscriptions with detailed tracking
 */

module.exports = (sequelize, DataTypes) => {
  const ActiveSubscription = sequelize.define('ActiveSubscription', {
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
    subscriptionId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'subscription_id',
      references: {
        model: 'subscriptions',
        key: 'id'
      }
    },
    startDate: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'start_date'
    },
    endDate: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'end_date'
    },
    status: {
      type: DataTypes.ENUM('ACTIVE', 'EXPIRING', 'CANCELLED', 'EXPIRED', 'SUSPENDED', 'TRIAL'),
      allowNull: false,
      defaultValue: 'ACTIVE'
    },
    monthlyCost: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      field: 'monthly_cost'
    },
    totalCost: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      field: 'total_cost'
    },
    billingCycle: {
      type: DataTypes.ENUM('MONTHLY', 'QUARTERLY', 'YEARLY'),
      allowNull: false,
      defaultValue: 'MONTHLY',
      field: 'billing_cycle'
    },
    autoRenew: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'auto_renew'
    },
    renewalDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'renewal_date'
    },
    cancellationDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'cancellation_date'
    },
    cancellationReason: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'cancellation_reason'
    },
    territoryCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'territory_count'
    },
    maxTerritories: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'max_territories'
    },
    usageCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'usage_count'
    },
    lastUsedDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_used_date'
    },
    paymentStatus: {
      type: DataTypes.ENUM('PAID', 'PENDING', 'FAILED', 'OVERDUE'),
      allowNull: false,
      defaultValue: 'PENDING',
      field: 'payment_status'
    },
    lastPaymentDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_payment_date'
    },
    nextPaymentDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'next_payment_date'
    },
    discountPercentage: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 0,
      field: 'discount_percentage'
    },
    discountAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
      field: 'discount_amount'
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
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
    },
    createdBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'created_by',
      references: {
        model: 'users',
        key: 'id'
      }
    },
    updatedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'updated_by',
      references: {
        model: 'users',
        key: 'id'
      }
    }
  }, {
    tableName: 'active_subscriptions',
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
        fields: ['start_date']
      },
      {
        fields: ['end_date']
      },
      {
        fields: ['billing_cycle']
      },
      {
        fields: ['payment_status']
      },
      {
        fields: ['agency_id', 'status']
      },
      {
        fields: ['status', 'end_date']
      },
      {
        fields: ['auto_renew', 'status']
      }
    ]
  });

  // Associations
  ActiveSubscription.associate = (models) => {
    // Belongs to Agency
    ActiveSubscription.belongsTo(models.Agency, {
      foreignKey: 'agencyId',
      as: 'agency'
    });

    // Belongs to SubscriptionPlan
    ActiveSubscription.belongsTo(models.SubscriptionPlan, {
      foreignKey: 'planId',
      as: 'plan'
    });

    // Belongs to Subscription
    ActiveSubscription.belongsTo(models.Subscription, {
      foreignKey: 'subscriptionId',
      as: 'subscription'
    });

    // Belongs to User (created by)
    ActiveSubscription.belongsTo(models.User, {
      foreignKey: 'createdBy',
      as: 'createdByUser'
    });

    // Belongs to User (updated by)
    ActiveSubscription.belongsTo(models.User, {
      foreignKey: 'updatedBy',
      as: 'updatedByUser'
    });

    // Has many Territories
    ActiveSubscription.hasMany(models.Territory, {
      foreignKey: 'activeSubscriptionId',
      as: 'territories'
    });
  };

  return ActiveSubscription;
};
