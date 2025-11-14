module.exports = (sequelize, DataTypes) => {
  const Agency = sequelize.define('Agency', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    legacyAgencyId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'legacy_agency_id'
    },
    agencyName: {
      type: DataTypes.STRING(150),
      allowNull: false,
      field: 'agency_name'
    },
    businessName: {
      type: DataTypes.STRING(150),
      allowNull: true,
      field: 'business_name'
    },
    email: {
      type: DataTypes.STRING(120),
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true
      }
    },
    passwordHash: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'password_hash'
    },
    phoneNumber: {
      type: DataTypes.STRING(30),
      allowNull: true,
      field: 'phone_number'
    },
    industry: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    zipcodes: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      allowNull: true,
      defaultValue: []
    },
    verificationStatus: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'verification_status'
    },
    totalSpent: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      field: 'total_spent'
    },
    conversionRate: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
      field: 'conversion_rate'
    },
    verified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    stripeCustomerId: {
      type: DataTypes.STRING(120),
      allowNull: true,
      field: 'stripe_customer_id'
    },
    status: {
      type: DataTypes.STRING(50),
      defaultValue: 'active'
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {},
      allowNull: true
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'is_active'
    },
    // Territory fields
    territories: {
      type: DataTypes.JSONB,
      defaultValue: [],
      allowNull: true,
      comment: 'Array of territory objects with type, value, state, city, county, zipcode, priority, etc.'
    },
    territoryCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'territory_count',
      comment: 'Auto-calculated count of active territories'
    },
    territoryLimit: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'territory_limit',
      comment: 'Maximum territories allowed based on subscription plan'
    },
    preferredTerritoryType: {
      type: DataTypes.ENUM('zipcode', 'city', 'county', 'state'),
      defaultValue: 'zipcode',
      field: 'preferred_territory_type'
    },
    primaryZipcodes: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      defaultValue: [],
      field: 'primary_zipcodes',
      comment: 'Array of active zipcode values for fast lookup'
    },
    primaryCities: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      defaultValue: [],
      field: 'primary_cities',
      comment: 'Array of active city values for fast lookup'
    },
    primaryCounties: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      defaultValue: [],
      field: 'primary_counties',
      comment: 'Array of active county values for fast lookup'
    },
    primaryStates: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      defaultValue: [],
      field: 'primary_states',
      comment: 'Array of active state values for fast lookup'
    },
        territoriesUpdatedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'territories_updated_at'
    },

    // ✅ Added fields for password reset
    resetCode: {
      type: DataTypes.STRING(10),
      allowNull: true,
      field: 'reset_code'
    },
    resetCodeExpires: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'reset_code_expires'
    },
    resetVerified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'reset_verified'
    }
  },
  {
    tableName: 'agencies',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: false,
    indexes: [
      {
        fields: ['email']
      },
      {
        fields: ['status']
      },
      {
        fields: ['is_active']
      },
      {
        fields: ['territory_count']
      }
    ]
  });

  // Instance methods
  Agency.prototype.toJSON = function() {
    const values = Object.assign({}, this.get());
    // Remove sensitive data
    delete values.passwordHash;
    return values;
  };

  // Territory management methods
  Agency.prototype.addTerritory = function(territory) {
    const territories = this.territories || [];
    const newTerritory = {
      id: require('crypto').randomUUID(),
      type: territory.type,
      value: territory.value,
      state: territory.state || null,
      county: territory.county || null,
      city: territory.city || null,
      zipcode: territory.zipcode || (territory.type === 'zipcode' ? territory.value : null),
      is_active: true,
      priority: territory.priority || 0,
      subscription_id: territory.subscription_id || null,
      added_at: new Date().toISOString(),
      metadata: territory.metadata || {}
    };
    territories.push(newTerritory);
    this.territories = territories;
    return newTerritory;
  };

  Agency.prototype.removeTerritory = function(territoryId) {
    const territories = this.territories || [];
    const index = territories.findIndex(t => t.id === territoryId);
    if (index !== -1) {
      territories[index].is_active = false;
      territories[index].deleted_at = new Date().toISOString();
      this.territories = territories;
      return true;
    }
    return false;
  };

  Agency.prototype.getActiveTerritories = function(type = null) {
    const territories = this.territories || [];
    return territories.filter(t => {
      if (!t.is_active || t.deleted_at) return false;
      if (type && t.type !== type) return false;
      return true;
    });
  };

  Agency.prototype.hasTerritory = function(type, value) {
    const territories = this.territories || [];
    return territories.some(t => 
      t.is_active && 
      !t.deleted_at && 
      t.type === type && 
      t.value === value
    );
  };

  Agency.prototype.getTerritoryById = function(territoryId) {
    const territories = this.territories || [];
    return territories.find(t => t.id === territoryId);
  };

  return Agency;
};

