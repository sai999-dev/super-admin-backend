/**
 * Mobile Conversation Model
 * Manages conversations between agencies and prospects
 */

module.exports = (sequelize, DataTypes) => {
  const MobileConversation = sequelize.define('MobileConversation', {
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
    agencyId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'agency_id',
      references: {
        model: 'agencies',
        key: 'id'
      }
    },
    prospectPhone: {
      type: DataTypes.STRING(20),
      allowNull: true,
      field: 'prospect_phone',
      comment: 'Extracted from lead data'
    },
    status: {
      type: DataTypes.ENUM('active', 'closed', 'archived'),
      allowNull: false,
      defaultValue: 'active'
    },
    startedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'started_at'
    },
    lastMessageAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'last_message_at'
    },
    messageCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'message_count'
    }
  }, {
    tableName: 'mobile_conversations',
    timestamps: false,
    indexes: [
      {
        fields: ['lead_id']
      },
      {
        fields: ['agency_id']
      },
      {
        fields: ['status']
      },
      {
        fields: ['last_message_at']
      },
      {
        unique: true,
        fields: ['lead_id', 'agency_id']
      }
    ]
  });

  MobileConversation.associate = function(models) {
    MobileConversation.belongsTo(models.Lead, {
      foreignKey: 'leadId',
      as: 'lead'
    });
    
    MobileConversation.belongsTo(models.Agency, {
      foreignKey: 'agencyId',
      as: 'agency'
    });
    
    MobileConversation.hasMany(models.MobileMessage, {
      foreignKey: 'conversationId',
      as: 'messages'
    });
  };

  return MobileConversation;
};
