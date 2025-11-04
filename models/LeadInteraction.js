module.exports = (sequelize, DataTypes) => {
  const LeadInteraction = sequelize.define('LeadInteraction', {
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
    interactionType: {
      type: DataTypes.ENUM('viewed', 'called', 'emailed', 'sms_sent', 'meeting_scheduled', 'converted', 'lost'),
      allowNull: false,
      field: 'interaction_type'
    },
    interactionData: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
      field: 'interaction_data'
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    outcome: {
      type: DataTypes.ENUM('positive', 'neutral', 'negative', 'pending'),
      allowNull: true
    },
    followUpDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'follow_up_date'
    }
  }, {
    tableName: 'lead_interactions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        fields: ['lead_id']
      },
      {
        fields: ['agency_id']
      },
      {
        fields: ['interaction_type']
      },
      {
        fields: ['created_at']
      },
      {
        fields: ['follow_up_date']
      }
    ]
  });

  LeadInteraction.prototype.toJSON = function() {
    const values = Object.assign({}, this.get());
    return values;
  };

  return LeadInteraction;
};
