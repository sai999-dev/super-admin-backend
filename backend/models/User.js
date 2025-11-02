module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define('User', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    agencyId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'agencies',
        key: 'id'
      },
      field: 'agency_id'
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
    fullName: {
      type: DataTypes.STRING(150),
      allowNull: true,
      field: 'full_name'
    },
    role: {
      type: DataTypes.ENUM('super_admin', 'admin', 'agency_owner', 'agency_user'),
      allowNull: false
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'is_active'
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {},
      allowNull: true
    }
  }, {
    tableName: 'users',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        fields: ['email']
      },
      {
        fields: ['agency_id']
      },
      {
        fields: ['role']
      },
      {
        fields: ['is_active']
      }
    ]
  });

  // Instance methods
  User.prototype.toJSON = function() {
    const values = Object.assign({}, this.get());
    // Remove sensitive data
    delete values.passwordHash;
    return values;
  };

  return User;
};

