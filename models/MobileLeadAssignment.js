/**
 * Mobile Lead Assignment Model
 * Manages lead assignments to mobile agencies
 */

module.exports = (sequelize, DataTypes) => {
  const MobileLeadAssignment = sequelize.define('MobileLeadAssignment', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    mobileDistributionId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'mobile_distribution_id',
      references: {
        model: 'mobile_lead_distribution',
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
    mobileSubscriptionId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'mobile_subscription_id',
      references: {
        model: 'agency_mobile_subscriptions',
        key: 'id'
      }
    },
    assignedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'assigned_at'
    },
    notificationSentAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'notification_sent_at'
    },
    viewedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'viewed_at'
    },
    respondedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'responded_at'
    },
    responseAction: {
      type: DataTypes.ENUM('purchased', 'dismissed', 'expired'),
      allowNull: true,
      field: 'response_action'
    }
  }, {
    tableName: 'mobile_lead_assignments',
    timestamps: false,
    indexes: [
      {
        fields: ['mobile_distribution_id']
      },
      {
        fields: ['agency_id']
      },
      {
        fields: ['mobile_subscription_id']
      },
      {
        fields: ['assigned_at']
      },
      {
        fields: ['response_action']
      },
      {
        unique: true,
        fields: ['mobile_distribution_id', 'agency_id']
      }
    ]
  });

  MobileLeadAssignment.associate = function(models) {
    MobileLeadAssignment.belongsTo(models.MobileLeadDistribution, {
      foreignKey: 'mobileDistributionId',
      as: 'mobileDistribution'
    });
    
    MobileLeadAssignment.belongsTo(models.Agency, {
      foreignKey: 'agencyId',
      as: 'agency'
    });
    
    MobileLeadAssignment.belongsTo(models.AgencyMobileSubscription, {
      foreignKey: 'mobileSubscriptionId',
      as: 'mobileSubscription'
    });
  };

  return MobileLeadAssignment;
};
