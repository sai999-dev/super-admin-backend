/**
 * Mobile Performance Daily Model
 * Tracks daily performance metrics for mobile users
 */

module.exports = (sequelize, DataTypes) => {
  const MobilePerformanceDaily = sequelize.define('MobilePerformanceDaily', {
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
    date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    leadsViewed: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'leads_viewed'
    },
    leadsPurchased: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'leads_purchased'
    },
    messagesSent: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'messages_sent'
    },
    notificationsReceived: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'notifications_received'
    },
    appSessions: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'app_sessions'
    },
    totalSessionTime: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'total_session_time',
      comment: 'in seconds'
    },
    conversionRate: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 0,
      field: 'conversion_rate'
    }
  }, {
    tableName: 'mobile_performance_daily',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    indexes: [
      {
        fields: ['agency_id']
      },
      {
        fields: ['date']
      },
      {
        fields: ['mobile_subscription_id']
      },
      {
        unique: true,
        fields: ['agency_id', 'date']
      }
    ]
  });

  MobilePerformanceDaily.associate = function(models) {
    MobilePerformanceDaily.belongsTo(models.Agency, {
      foreignKey: 'agencyId',
      as: 'agency'
    });
    
    MobilePerformanceDaily.belongsTo(models.AgencyMobileSubscription, {
      foreignKey: 'mobileSubscriptionId',
      as: 'mobileSubscription'
    });
  };

  return MobilePerformanceDaily;
};
