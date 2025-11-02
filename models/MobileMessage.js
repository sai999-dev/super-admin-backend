/**
 * Mobile Message Model
 * Manages individual messages within conversations
 */

module.exports = (sequelize, DataTypes) => {
  const MobileMessage = sequelize.define('MobileMessage', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    conversationId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'conversation_id',
      references: {
        model: 'mobile_conversations',
        key: 'id'
      }
    },
    senderType: {
      type: DataTypes.ENUM('agency', 'prospect'),
      allowNull: false,
      field: 'sender_type'
    },
    senderId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'sender_id',
      comment: 'agency_id or prospect_phone'
    },
    messageText: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'message_text'
    },
    messageType: {
      type: DataTypes.ENUM('text', 'image', 'template', 'system'),
      allowNull: false,
      defaultValue: 'text',
      field: 'message_type'
    },
    templateId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'template_id',
      references: {
        model: 'mobile_message_templates',
        key: 'id'
      }
    },
    isRead: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_read'
    },
    readAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'read_at'
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {}
    }
  }, {
    tableName: 'mobile_messages',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    indexes: [
      {
        fields: ['conversation_id']
      },
      {
        fields: ['sender_type', 'sender_id']
      },
      {
        fields: ['created_at']
      }
    ]
  });

  MobileMessage.associate = function(models) {
    MobileMessage.belongsTo(models.MobileConversation, {
      foreignKey: 'conversationId',
      as: 'conversation'
    });
    
    MobileMessage.belongsTo(models.MobileMessageTemplate, {
      foreignKey: 'templateId',
      as: 'template'
    });
  };

  return MobileMessage;
};
