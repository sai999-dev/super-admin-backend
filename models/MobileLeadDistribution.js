/**
 * Mobile Lead Distribution Model
 * Manages mobile-exclusive lead distribution with 24-hour expiration
 */

module.exports = (sequelize, DataTypes) => {
  const MobileLeadDistribution = sequelize.define('MobileLeadDistribution', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    leadId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'lead_id',
      references: {
        model: 'leads',
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
    isMobileExclusive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'is_mobile_exclusive'
    },
    availableUntil: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'available_until',
      comment: '24-hour expiration timestamp'
    },
    priorityScore: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
      field: 'priority_score'
    },
    viewCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'view_count'
    }
  }, {
    tableName: 'mobile_lead_distribution',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    indexes: [
      {
        fields: ['lead_id']
      },
      {
        fields: ['state', 'city', 'zipcode']
      },
      {
        fields: ['available_until']
      },
      {
        fields: ['priority_score']
      },
      {
        unique: true,
        fields: ['lead_id']
      }
    ]
  });

  MobileLeadDistribution.associate = function(models) {
    MobileLeadDistribution.belongsTo(models.Lead, {
      foreignKey: 'leadId',
      as: 'lead'
    });
    
    MobileLeadDistribution.hasMany(models.MobileLeadAssignment, {
      foreignKey: 'mobileDistributionId',
      as: 'assignments'
    });
  };

  return MobileLeadDistribution;
};
