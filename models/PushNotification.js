/**
 * Push Notification Model
 * Manages push notification queue and delivery tracking
 */

module.exports = (sequelize, DataTypes) => {
  const PushNotification = sequelize.define('PushNotification', {
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
    notificationType: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'notification_type'
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    body: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    data: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
      comment: 'Additional data payload for the notification'
    },
    scheduledFor: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'scheduled_for'
    },
    sentAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'sent_at'
    },
    deliveryStatus: {
      type: DataTypes.ENUM('pending', 'sent', 'delivered', 'failed'),
      allowNull: false,
      defaultValue: 'pending',
      field: 'delivery_status'
    },
    deliveryResponse: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'delivery_response',
      comment: 'Response from push notification service'
    },
    retryCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'retry_count'
    }
  }, {
    tableName: 'push_notifications',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    indexes: [
      {
        fields: ['agency_id']
      },
      {
        fields: ['delivery_status']
      },
      {
        fields: ['scheduled_for']
      },
      {
        fields: ['notification_type']
      }
    ]
  });

  PushNotification.associate = function(models) {
    PushNotification.belongsTo(models.Agency, {
      foreignKey: 'agencyId',
      as: 'agency'
    });
    
    PushNotification.belongsTo(models.AgencyMobileSubscription, {
      foreignKey: 'mobileSubscriptionId',
      as: 'mobileSubscription'
    });
  };

  return PushNotification;
};
