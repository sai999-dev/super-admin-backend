module.exports = (sequelize, DataTypes) => {
  const LeadAssignment = sequelize.define('LeadAssignment', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    leadId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'leads',
        key: 'id'
      },
      field: 'lead_id'
    },
    agencyId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'agencies',
        key: 'id'
      },
      field: 'agency_id'
    },
    assignmentType: {
      type: DataTypes.ENUM('round_robin', 'manual', 'auto', 'priority'),
      allowNull: false,
      field: 'assignment_type'
    },
    status: {
      type: DataTypes.ENUM('pending', 'accepted', 'rejected', 'expired', 'completed'),
      defaultValue: 'pending'
    },
    assignedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      },
      field: 'assigned_by'
    },
    assignedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'assigned_at'
    },
    acceptedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'accepted_at'
    },
    rejectedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'rejected_at'
    },
    rejectionReason: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'rejection_reason'
    },
    roundRobinSequence: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'round_robin_sequence'
    },
    priority: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {},
      allowNull: true
    }
  }, {
    tableName: 'lead_assignments',
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
        fields: ['assignment_type']
      },
      {
        fields: ['status']
      },
      {
        fields: ['assigned_at']
      }
    ]
  });

  // Instance methods
  LeadAssignment.prototype.toJSON = function() {
    const values = Object.assign({}, this.get());
    return values;
  };

  return LeadAssignment;
};

