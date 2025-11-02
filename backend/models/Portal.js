module.exports = (sequelize, DataTypes) => {
  const Portal = sequelize.define('Portal', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING(200),
      allowNull: false
    },
    slug: {
      type: DataTypes.STRING(200),
      allowNull: false,
      unique: true
    },
    webhookUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'webhook_url'
    },
    schemaEndpoint: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'schema_endpoint'
    },
    authType: {
      type: DataTypes.ENUM('api_key', 'oauth', 'basic', 'none'),
      defaultValue: 'api_key',
      field: 'auth_type'
    },
    status: {
      type: DataTypes.ENUM('draft', 'discovering', 'active', 'failed', 'inactive'),
      defaultValue: 'draft'
    },
    lastSchemaSync: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_schema_sync'
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {},
      allowNull: true
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'is_active'
    }
  }, {
    tableName: 'portals',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        fields: ['slug']
      },
      {
        fields: ['status']
      },
      {
        fields: ['is_active']
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

