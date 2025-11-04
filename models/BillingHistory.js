/**
 * BillingHistory Model
 * Manages billing and payment history for agency subscriptions
 */

module.exports = (sequelize, DataTypes) => {
  const BillingHistory = sequelize.define('BillingHistory', {
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
    subscriptionId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'subscription_id',
      references: {
        model: 'subscriptions',
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
    billingDate: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'billing_date'
    },
    dueDate: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'due_date'
    },
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      validate: {
        min: 0
      }
    },
    currency: {
      type: DataTypes.STRING(3),
      allowNull: false,
      defaultValue: 'USD',
      validate: {
        len: [3, 3]
      }
    },
    status: {
      type: DataTypes.ENUM('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED', 'REFUNDED'),
      allowNull: false,
      defaultValue: 'PENDING'
    },
    paymentMethod: {
      type: DataTypes.ENUM('CREDIT_CARD', 'BANK_TRANSFER', 'DEBIT_CARD', 'PAYPAL', 'STRIPE', 'MANUAL'),
      allowNull: true,
      field: 'payment_method'
    },
    paymentReference: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'payment_reference'
    },
    transactionId: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'transaction_id'
    },
    failureReason: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'failure_reason'
    },
    retryCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'retry_count'
    },
    nextRetryDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'next_retry_date'
    },
    billingPeriod: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'billing_period'
    },
    unitsUsed: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'units_used'
    },
    unitPrice: {
      type: DataTypes.DECIMAL(10, 4),
      allowNull: false,
      field: 'unit_price'
    },
    baseAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      field: 'base_amount'
    },
    additionalAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
      field: 'additional_amount'
    },
    discountAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
      field: 'discount_amount'
    },
    taxAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
      field: 'tax_amount'
    },
    totalAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      field: 'total_amount'
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true
    },
    processedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'processed_at'
    },
    processedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'processed_by',
      references: {
        model: 'users',
        key: 'id'
      }
    }
  }, {
    tableName: 'billing_history',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        fields: ['agency_id']
      },
      {
        fields: ['subscription_id']
      },
      {
        fields: ['billing_date']
      },
      {
        fields: ['status']
      },
      {
        fields: ['payment_method']
      },
      {
        fields: ['billing_date', 'status']
      },
      {
        fields: ['agency_id', 'billing_date']
      }
    ]
  });

  // Associations
  BillingHistory.associate = (models) => {
    // Belongs to Agency
    BillingHistory.belongsTo(models.Agency, {
      foreignKey: 'agencyId',
      as: 'agency'
    });

    // Belongs to Subscription
    BillingHistory.belongsTo(models.Subscription, {
      foreignKey: 'subscriptionId',
      as: 'subscription'
    });

    // Belongs to SubscriptionPlan
    BillingHistory.belongsTo(models.SubscriptionPlan, {
      foreignKey: 'planId',
      as: 'plan'
    });

    // Belongs to User (processed by)
    BillingHistory.belongsTo(models.User, {
      foreignKey: 'processedBy',
      as: 'processedByUser'
    });
  };

  return BillingHistory;
};
