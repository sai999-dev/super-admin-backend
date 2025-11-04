/**
 * Mobile Subscription Area Model
 * Manages geographic coverage areas for mobile subscriptions
 */

module.exports = (sequelize, DataTypes) => {
  const MobileSubscriptionArea = sequelize.define('MobileSubscriptionArea', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
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
    zipcode: {
      type: DataTypes.STRING(10),
      allowNull: true
    },
    city: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    state: {
      type: DataTypes.STRING(2),
      allowNull: true
    },
    county: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    isPrimary: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_primary'
    },
    priorityLevel: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      field: 'priority_level',
      validate: {
        min: 1,
        max: 5
      },
      comment: '1=highest priority, 5=lowest'
    }
  }, {
    tableName: 'mobile_subscription_areas',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    indexes: [
      {
        fields: ['mobile_subscription_id']
      },
      {
        fields: ['state', 'city', 'zipcode']
      },
      {
        fields: ['priority_level']
      }
    ]
  });

  MobileSubscriptionArea.associate = function(models) {
    MobileSubscriptionArea.belongsTo(models.AgencyMobileSubscription, {
      foreignKey: 'mobileSubscriptionId',
      as: 'mobileSubscription'
    });
  };

  return MobileSubscriptionArea;
};
