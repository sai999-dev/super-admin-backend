module.exports = (sequelize, DataTypes) => {
  const Transaction = sequelize.define('Transaction', {
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
    transactionType: {
      type: DataTypes.ENUM('credit_purchase', 'lead_purchase', 'subscription_payment', 'adjustment'),
      allowNull: false,
      field: 'transaction_type'
    },
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('pending', 'completed', 'failed'),
      defaultValue: 'pending'
    }
  }, {
    tableName: 'transactions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    indexes: [
      {
        fields: ['agency_id']
      },
      {
        fields: ['transaction_type']
      },
      {
        fields: ['status']
      },
      {
        fields: ['created_at']
      }
    ]
  });

  Transaction.prototype.toJSON = function() {
    const values = Object.assign({}, this.get());
    return values;
  };

  return Transaction;
};
