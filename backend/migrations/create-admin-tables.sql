-- Migration: Create Admin Tables
-- Description: Creates tables for super admin functionality and activity logging
-- Date: 2025-10-29

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- Table: admin_activity_logs
-- Description: Stores all admin actions for audit trail
-- =====================================================

CREATE TABLE IF NOT EXISTS admin_activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_id UUID NOT NULL,
    admin_email VARCHAR(255) NOT NULL,
    action VARCHAR(100) NOT NULL,
    resource VARCHAR(100) NOT NULL,
    resource_id UUID,
    details JSONB DEFAULT '{}',
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for admin_activity_logs
CREATE INDEX idx_admin_activity_logs_admin_id ON admin_activity_logs(admin_id);
CREATE INDEX idx_admin_activity_logs_action ON admin_activity_logs(action);
CREATE INDEX idx_admin_activity_logs_resource ON admin_activity_logs(resource);
CREATE INDEX idx_admin_activity_logs_created_at ON admin_activity_logs(created_at DESC);
CREATE INDEX idx_admin_activity_logs_resource_id ON admin_activity_logs(resource_id);

-- =====================================================
-- Update users/agencies table for admin role
-- =====================================================

-- Add role column to agencies table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='agencies' AND column_name='role') THEN
        ALTER TABLE agencies ADD COLUMN role VARCHAR(50) DEFAULT 'agency';
    END IF;
END $$;

-- Add is_active column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='agencies' AND column_name='is_active') THEN
        ALTER TABLE agencies ADD COLUMN is_active BOOLEAN DEFAULT true;
    END IF;
END $$;

-- Add last_login column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='agencies' AND column_name='last_login') THEN
        ALTER TABLE agencies ADD COLUMN last_login TIMESTAMP;
    END IF;
END $$;

-- Create index on role
CREATE INDEX IF NOT EXISTS idx_agencies_role ON agencies(role);
CREATE INDEX IF NOT EXISTS idx_agencies_is_active ON agencies(is_active);

-- =====================================================
-- Table: users (if separate from agencies)
-- For systems with separate user management
-- =====================================================

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'agency' CHECK (role IN ('super_admin', 'admin', 'agency', 'user')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_login TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for users
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);

-- =====================================================
-- Comments for documentation
-- =====================================================

COMMENT ON TABLE admin_activity_logs IS 'Audit trail for all super admin actions';
COMMENT ON COLUMN admin_activity_logs.action IS 'Type of action performed (e.g., CREATE_USER, DELETE_LEAD)';
COMMENT ON COLUMN admin_activity_logs.resource IS 'Resource type affected (e.g., users, leads, agencies)';
COMMENT ON COLUMN admin_activity_logs.details IS 'JSON object with additional context about the action';

COMMENT ON TABLE users IS 'User accounts including super admins and regular users';
COMMENT ON COLUMN users.role IS 'User role: super_admin, admin, agency, or user';

-- =====================================================
-- Sample Data: Create default super admin user
-- Password: admin123 (change this immediately in production!)
-- =====================================================

-- Insert default super admin if not exists
INSERT INTO users (name, email, password_hash, role, is_active)
VALUES (
    'Super Admin',
    'admin@leadmarketplace.com',
    '$2a$10$YQ5YZXy4XYZd.HEw9n9YCO5pYbLQxV1xH8rLZYxvZ8hKJ7tF4L.Pm', -- bcrypt hash of 'admin123'
    'super_admin',
    true
)
ON CONFLICT (email) DO NOTHING;

-- Alternative: Update existing agency to super_admin
-- UPDATE agencies 
-- SET role = 'super_admin' 
-- WHERE email = 'your-admin@email.com';

COMMENT ON TABLE users IS 'Default admin credentials: admin@leadmarketplace.com / admin123 (CHANGE IN PRODUCTION!)';
