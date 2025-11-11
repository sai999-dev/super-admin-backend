/**
 * Territory Model
 * Manages agency-owned territories (zipcodes, cities, etc.)
 */

module.exports = (sequelize, DataTypes) => {
  const Territory = sequelize.define('Territory', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    subscriptionId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'subscription_id',
      references: {
        model: 'subscriptions',
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
    activeSubscriptionId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'active_subscription_id'
    },
    type: {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: 'zipcode'
    },
    value: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Zipcode, city name, county name, or state code'
    },
    state: {
      type: DataTypes.STRING(2),
      allowNull: true,
      comment: 'State code (e.g., TX, CA)'
    },
    county: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    city: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    zipcode: {
      type: DataTypes.STRING(10),
      allowNull: true
    },
    priority: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: {
        min: 0,
        max: 10
      },
      comment: 'Lead distribution priority (0-10)'
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'is_active'
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
      comment: 'Additional data like population, demographics, etc.'
    }
  }, {
    tableName: 'territories',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    paranoid: true,
    deletedAt: 'deleted_at',
    indexes: [
      {
        fields: ['subscription_id']
      },
      {
        fields: ['agency_id']
      },
      {
        fields: ['type', 'value']
      },
      {
        fields: ['zipcode']
      },
      {
        fields: ['city', 'state']
      },
      {
        fields: ['is_active']
      },
      {
        unique: true,
        fields: ['subscription_id', 'type', 'value'],
        name: 'unique_territory_per_subscription'
      }
    ]
  });

  Territory.associate = (models) => {
    Territory.belongsTo(models.Subscription, {
      foreignKey: 'subscription_id',
      as: 'subscription'
    });

    Territory.belongsTo(models.Agency, {
      foreignKey: 'agency_id',
      as: 'agency'
    });
  };

  return Territory;
};
