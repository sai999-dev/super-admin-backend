module.exports = (sequelize, DataTypes) => {
  const Portal = sequelize.define('Portal', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    portalName: {
      type: DataTypes.STRING(200),
      allowNull: false,
      field: 'portal_name'
    },
    portalCode: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'portal_code'
    },
    portalSlug: {
      type: DataTypes.STRING(200),
      allowNull: false,
      unique: true,
      field: 'portal_slug'
    },
    portalType: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'portal_type'
    },
    industry: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    portalDescription: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'portal_description'
    },
    baseUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'base_url'
    },
    webhookUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'webhook_url'
    },
    apiEndpoint: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'api_endpoint'
    },
    schemaEndpoint: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'schema_endpoint'
    },
    authType: {
      type: DataTypes.STRING(50),
      defaultValue: 'api_key',
      field: 'auth_type'
    },
    authCredentials: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'auth_credentials'
    },
    portalStatus: {
      type: DataTypes.STRING(50),
      defaultValue: 'draft',
      field: 'portal_status'
    },
    healthStatus: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'health_status'
    },
    autoSyncEnabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'auto_sync_enabled'
    },
    syncFrequency: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'sync_frequency'
    },
    notificationLevel: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'notification_level'
    },
    autoApproveThreshold: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
      field: 'auto_approve_threshold'
    },
    discoveredSchema: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'discovered_schema'
    },
    fieldMappings: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'field_mappings'
    },
    schemaVersion: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'schema_version'
    },
    lastSchemaSync: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_schema_sync'
    },
    totalLeads: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'total_leads'
    },
    successfulSubmissions: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'successful_submissions'
    },
    failedSubmissions: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'failed_submissions'
    },
    lastActivity: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_activity'
    },
    realtimeDeliveryEnabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'realtime_delivery_enabled'
    },
    deliveryMethod: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'delivery_method'
    },
    pushNotifications: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'push_notifications'
    },
    deliveryTimeout: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'delivery_timeout'
    },
    apiKey: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'api_key'
    },
    apiKeyCreatedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'api_key_created_at'
    },
    isDeleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_deleted'
    },
    generatedWebhookUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'generated_webhook_url'
    }
  }, {
    tableName: 'portals',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        fields: ['portal_slug']
      },
      {
        fields: ['portal_status']
      },
      {
        fields: ['industry']
      },
      {
        fields: ['is_deleted']
      }
    ]
  });

  // Instance methods
  Portal.prototype.toJSON = function() {
    const values = Object.assign({}, this.get());
    return values;
  };

  return Portal;
};

