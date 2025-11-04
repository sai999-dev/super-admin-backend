/**
 * Agency Mobile Subscription Model
 * Manages agency subscriptions to mobile app plans
 */

module.exports = (sequelize, DataTypes) => {
  const AgencyMobileSubscription = sequelize.define('AgencyMobileSubscription', {
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
        model: 'mobile_subscription_plans',
        key: 'id'
      }
    },
    status: {
      type: DataTypes.ENUM('active', 'cancelled', 'suspended'),
      allowNull: false,
      defaultValue: 'active'
    },
    startedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'started_at'
    },
    cancelledAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'cancelled_at'
    },
    nextBillingDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'next_billing_date'
    },
    pushToken: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: 'push_token',
      comment: 'Firebase/APNs push token'
    },
    deviceInfo: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
      field: 'device_info',
      comment: 'Device information like OS, app version, etc.'
    }
  }, {
    tableName: 'agency_mobile_subscriptions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        fields: ['agency_id']
      },
      {
        fields: ['status']
      },
      {
        fields: ['next_billing_date']
      },
      {
        unique: true,
        fields: ['agency_id', 'status'],
        where: {
          status: 'active'
        }
      }
    ]
  });

  AgencyMobileSubscription.associate = function(models) {
    AgencyMobileSubscription.belongsTo(models.Agency, {
      foreignKey: 'agencyId',
      as: 'agency'
    });
    
    AgencyMobileSubscription.belongsTo(models.MobileSubscriptionPlan, {
      foreignKey: 'planId',
      as: 'plan'
    });
    
    AgencyMobileSubscription.hasMany(models.MobileSubscriptionArea, {
      foreignKey: 'mobileSubscriptionId',
      as: 'areas'
    });
    
    AgencyMobileSubscription.hasMany(models.MobileLeadAssignment, {
      foreignKey: 'mobileSubscriptionId',
      as: 'leadAssignments'
    });
    
    AgencyMobileSubscription.hasMany(models.PushNotification, {
      foreignKey: 'mobileSubscriptionId',
      as: 'notifications'
    });
    
    AgencyMobileSubscription.hasMany(models.MobileAppAnalytic, {
      foreignKey: 'mobileSubscriptionId',
      as: 'analytics'
    });
    
    AgencyMobileSubscription.hasMany(models.MobilePerformanceDaily, {
      foreignKey: 'mobileSubscriptionId',
      as: 'performanceMetrics'
    });
  };

  return AgencyMobileSubscription;
};
