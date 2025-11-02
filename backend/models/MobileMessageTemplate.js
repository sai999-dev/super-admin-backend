/**
 * Mobile Message Template Model
 * Manages quick response templates for agencies
 */

module.exports = (sequelize, DataTypes) => {
  const MobileMessageTemplate = sequelize.define('MobileMessageTemplate', {
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
    templateName: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'template_name',
      validate: {
        notEmpty: true,
        len: [3, 100]
      }
    },
    templateText: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'template_text'
    },
    category: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'greeting, follow_up, closing, custom'
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'is_active'
    },
    usageCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'usage_count'
    }
  }, {
    tableName: 'mobile_message_templates',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        fields: ['agency_id']
      },
      {
        fields: ['category']
      },
      {
        fields: ['is_active']
      }
    ]
  });

  MobileMessageTemplate.associate = function(models) {
    MobileMessageTemplate.belongsTo(models.Agency, {
      foreignKey: 'agencyId',
      as: 'agency'
    });
    
    MobileMessageTemplate.hasMany(models.MobileMessage, {
      foreignKey: 'templateId',
      as: 'messages'
    });
  };

  return MobileMessageTemplate;
};
