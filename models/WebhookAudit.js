module.exports = (sequelize, DataTypes) => {
  const WebhookAudit = sequelize.define('WebhookAudit', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    portalId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'portals',
        key: 'id'
      },
      field: 'portal_id'
    },
    apiKeyId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'api_key_id'
    },
    rawPayload: {
      type: DataTypes.JSONB,
      allowNull: false,
      field: 'raw_payload'
    },
    headers: {
      type: DataTypes.JSONB,
      allowNull: true
    },
    leadId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'leads',
        key: 'id'
      },
      field: 'lead_id'
    },
    status: {
      type: DataTypes.ENUM('success', 'failed', 'retry'),
      defaultValue: 'success'
    },
    errorMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'error_message'
    },
    processingTimeMs: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'processing_time_ms'
    },
    receivedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'received_at'
    }
  }, {
    tableName: 'webhook_audit',
    timestamps: false,
    indexes: [
      {
        fields: ['portal_id']
      },
      {
        fields: ['received_at']
      },
      {
        fields: ['status']
      },
      {
        fields: ['lead_id']
      }
    ]
  });

  // Instance methods
  WebhookAudit.prototype.toJSON = function() {
    const values = Object.assign({}, this.get());
    return values;
  };

  return WebhookAudit;
};

