/**
 * Mobile App Analytics Model
 * Tracks mobile app usage and events
 */

module.exports = (sequelize, DataTypes) => {
  const MobileAppAnalytic = sequelize.define('MobileAppAnalytic', {
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
    mobileSubscriptionId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'mobile_subscription_id',
      references: {
        model: 'agency_mobile_subscriptions',
        key: 'id'
      }
    },
    eventType: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'event_type',
      comment: 'app_open, lead_view, message_sent, notification_click'
    },
    eventData: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
      field: 'event_data'
    },
    deviceInfo: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
      field: 'device_info'
    },
    sessionId: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'session_id'
    }
  }, {
    tableName: 'mobile_app_analytics',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    indexes: [
      {
        fields: ['agency_id']
      },
      {
        fields: ['event_type']
      },
      {
        fields: ['created_at']
      },
      {
        fields: ['session_id']
      }
    ]
  });

  MobileAppAnalytic.associate = function(models) {
    MobileAppAnalytic.belongsTo(models.Agency, {
      foreignKey: 'agencyId',
      as: 'agency'
    });
    
    MobileAppAnalytic.belongsTo(models.AgencyMobileSubscription, {
      foreignKey: 'mobileSubscriptionId',
      as: 'mobileSubscription'
    });
  };

  return MobileAppAnalytic;
};
