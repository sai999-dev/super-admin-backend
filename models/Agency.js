module.exports = (sequelize, DataTypes) => {
  const Agency = sequelize.define('Agency', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    businessName: {
      type: DataTypes.STRING(150),
      allowNull: false,
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
      allowNull: false,
      field: 'password_hash'
    },
    phoneNumber: {
      type: DataTypes.STRING(30),
      allowNull: true,
      field: 'phone_number'
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
      type: DataTypes.ENUM('active', 'suspended', 'deleted'),
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
    }
  }, {
    tableName: 'agencies',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        fields: ['email']
      },
      {
        fields: ['status']
      },
      {
        fields: ['is_active']
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

  return Agency;
};

