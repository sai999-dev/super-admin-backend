module.exports = (sequelize, DataTypes) => {
  const Lead = sequelize.define('Lead', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    leadId: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'lead_id'
    },
    portalId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'portal_id',
      references: {
        model: 'portals',
        key: 'id'
      }
    },
    leadName: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'lead_name'
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: true,
      validate: {
        isEmail: true
      }
    },
    phoneNumber: {
      type: DataTypes.STRING(20),
      allowNull: true,
      field: 'phone_number'
    },
    firstName: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'first_name'
    },
    lastName: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'last_name'
    },
    phone: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    address: {
      type: DataTypes.TEXT,
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
    zipcode: {
      type: DataTypes.STRING(10),
      allowNull: true
    },
    propertyType: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'property_type'
    },
    budgetRange: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'budget_range'
    },
    preferredLocation: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'preferred_location'
    },
    timeline: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    needs: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    additionalDetails: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'additional_details'
    },
    source: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    status: {
      type: DataTypes.STRING(50),
      defaultValue: 'new'
    },
    rawPayload: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'raw_payload'
    }
  }, {
    tableName: 'leads',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    indexes: [
      {
        fields: ['status']
      },
      {
        fields: ['portal_id']
      },
      {
        fields: ['created_at']
      },
      {
        fields: ['email']
      },
      {
        fields: ['zipcode']
      },
      {
        fields: ['city', 'state']
      }
    ]
  });

  // Instance methods
  Lead.prototype.toJSON = function() {
    const values = Object.assign({}, this.get());
    return values;
  };

  return Lead;
};
