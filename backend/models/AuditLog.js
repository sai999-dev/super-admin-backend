module.exports = (sequelize, DataTypes) => {
  const AuditLog = sequelize.define('AuditLog', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    actorId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'actor_id'
    },
    actorType: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'actor_type'
    },
    action: {
      type: DataTypes.STRING(150),
      allowNull: false
    },
    resourceType: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'resource_type'
    },
    resourceId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'resource_id'
    },
    changes: {
      type: DataTypes.JSONB,
      allowNull: true
    },
    ipAddress: {
      type: DataTypes.INET,
      allowNull: true,
      field: 'ip_address'
    },
    userAgent: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'user_agent'
    }
  }, {
    tableName: 'audit_logs',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        fields: ['actor_id']
      },
      {
        fields: ['resource_type', 'resource_id']
      },
      {
        fields: ['created_at']
      },
      {
        fields: ['action']
      }
    ]
  });

  // Instance methods
  AuditLog.prototype.toJSON = function() {
    const values = Object.assign({}, this.get());
    return values;
  };

  return AuditLog;
};

