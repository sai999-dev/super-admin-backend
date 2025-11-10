module.exports = (sequelize, DataTypes) => {
  const Lead = sequelize.define('Lead', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    industry: {
      type: DataTypes.ENUM('healthcare_hospice', 'healthcare_homehealth', 'non_healthcare'),
      allowNull: false
    },
    registryPortalId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'registry_portal_id',
      references: {
        model: 'registry_portals',
        key: 'id'
      }
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
    // Enhanced lead data structure
    leadData: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
      field: 'lead_data'
    },
    // Contact info for deduplication
    contactEmail: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'contact_email'
    },
    contactPhone: {
      type: DataTypes.STRING(20),
      allowNull: true,
      field: 'contact_phone'
    },
    // Slot management (Psychology: Scarcity principle)
    maxSlots: {
      type: DataTypes.INTEGER,
      defaultValue: 3,
      field: 'max_slots'
    },
    availableSlots: {
      type: DataTypes.INTEGER,
      defaultValue: 3,
      field: 'available_slots'
    },
    // Pricing
    pricePerSlot: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      field: 'price_per_slot'
    },
    // Status & Lifecycle
    status: {
      type: DataTypes.ENUM('new', 'available', 'partially_sold', 'sold_out', 'expired', 'archived'),
      defaultValue: 'new'
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'expires_at'
    },
    // Deduplication
    fingerprint: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    rawPayload: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'raw_payload'
    },
    source: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    priority: {
      type: DataTypes.ENUM('low', 'medium', 'high', 'urgent'),
      defaultValue: 'medium'
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'is_active'
    }
  }, {
    tableName: 'leads',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    validate: {
      availableSlotsValid() {
        if (this.availableSlots < 0 || this.availableSlots > this.maxSlots) {
          throw new Error('Available slots must be between 0 and max slots');
        }
      },
      pricePerSlotValid() {
        if (this.pricePerSlot <= 0) {
          throw new Error('Price per slot must be greater than 0');
        }
      }
    },
    indexes: [
      {
        fields: ['industry', 'status']
      },
      {
        fields: ['fingerprint']
      },
      {
        fields: ['expires_at']
      },
      {
        fields: ['available_slots'],
        where: {
          available_slots: {
            [sequelize.Sequelize.Op.gt]: 0
          }
        }
      },
      {
        fields: ['contact_email']
      },
      {
        fields: ['contact_phone']
      },
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
        fields: ['phone_number']
      },
      {
        fields: ['lead_data'],
        using: 'gin'
      }
    ]
  });

  // Instance methods
  Lead.prototype.toJSON = function() {
    const values = Object.assign({}, this.get());
    return values;
  };

  // Generate fingerprint for deduplication
  Lead.prototype.generateFingerprint = function() {
    const email = this.contactEmail || this.email || '';
    const phone = this.contactPhone || this.phoneNumber || '';
    const crypto = require('crypto');
    return crypto.createHash('md5').update(`${email}:${phone}`).digest('hex');
  };

  // Check if lead is available for purchase
  Lead.prototype.isAvailable = function() {
    return this.status === 'available' && this.availableSlots > 0;
  };

  // Reserve a slot
  Lead.prototype.reserveSlot = function() {
    if (this.availableSlots > 0) {
      this.availableSlots -= 1;
      if (this.availableSlots === 0) {
        this.status = 'sold_out';
      } else if (this.availableSlots < this.maxSlots) {
        this.status = 'partially_sold';
      }
      return true;
    }
    return false;
  };

  // Release a slot
  Lead.prototype.releaseSlot = function() {
    if (this.availableSlots < this.maxSlots) {
      this.availableSlots += 1;
      if (this.availableSlots === this.maxSlots) {
        this.status = 'available';
      } else if (this.availableSlots > 0) {
        this.status = 'partially_sold';
      }
      return true;
    }
    return false;
  };

  return Lead;
};

