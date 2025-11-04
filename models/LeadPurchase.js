module.exports = (sequelize, DataTypes) => {
  const LeadPurchase = sequelize.define('LeadPurchase', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    leadId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'lead_id',
      references: {
        model: 'leads',
        key: 'id'
      }
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
    purchasePrice: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      field: 'purchase_price'
    },
    status: {
      type: DataTypes.ENUM('reserved', 'completed', 'cancelled', 'refunded'),
      defaultValue: 'reserved',
      field: 'status'
    },
    reservedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'reserved_at'
    },
    reservedUntil: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'reserved_until'
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'completed_at'
    },
    firstViewedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'first_viewed_at'
    },
    lastViewedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_viewed_at'
    },
    viewCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'view_count'
    },
    refundRequestedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'refund_requested_at'
    },
    refundReason: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'refund_reason'
    },
    refundApprovedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'refund_approved_at'
    }
  }, {
    tableName: 'lead_purchases',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        fields: ['lead_id']
      },
      {
        fields: ['agency_id']
      },
      {
        fields: ['status']
      },
      {
        fields: ['reserved_at']
      },
      {
        fields: ['reserved_until']
      },
      {
        fields: ['completed_at']
      }
    ]
  });

  LeadPurchase.prototype.toJSON = function() {
    const values = Object.assign({}, this.get());
    return values;
  };

  return LeadPurchase;
};
