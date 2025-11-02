const express = require('express');
const router = express.Router();
const supabase = require('../config/supabaseClient');
const bcrypt = require('bcryptjs');

/**
 * USER MANAGEMENT ROUTES - SUPER ADMIN PORTAL
 * Connects to: frontend/scripts/app.js - renderUsersTable()
 * Database: Supabase users table
 */

// GET /api/admin/users - List all users with pagination and filters
router.get('/users', async (req, res) => {
  try {
    const { page = 1, limit = 25, role, search, agency_id } = req.query;
    
    let query = supabase
      .from('users')
      .select('*', { count: 'exact' });
    
    // Filter by role
    if (role) {
      query = query.eq('role', role);
    }
    
    // Filter by agency
    if (agency_id) {
      query = query.eq('agency_id', agency_id);
    }
    
    // Search by name or email
    if (search) {
      query = query.or(`email.ilike.%${search}%`);
    }
    
    // Only show active users by default
    query = query.eq('is_active', true);
    
    // Pagination
    const offset = (page - 1) * limit;
    query = query
      .range(offset, offset + parseInt(limit) - 1)
      .order('created_at', { ascending: false });
    
    const { data, error, count } = await query;
    
    if (error) throw error;
    
    res.json({
      success: true,
      data: {
        users: data,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count,
          totalPages: Math.ceil(count / limit)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch users', 
      error: error.message 
    });
  }
});

// GET /api/admin/users/:id - Get user details with activity history
router.get('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get user details
    const { data: user, error: userError } = await supabase
      .from('users')
      .select(`
        *,
        agencies(id, business_name, email, contact_phone)
      `)
      .eq('id', id)
      .single();
    
    if (userError) throw userError;
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }
    
    // Get user's recent activity from audit logs (if table exists)
    let recentActivity = [];
    try {
      const { data: activity } = await supabase
        .from('audit_logs')
        .select('action, entity_type, entity_id, created_at')
        .eq('user_id', id)
        .order('created_at', { ascending: false })
        .limit(10);
      
      if (activity) recentActivity = activity;
    } catch (err) {
      console.log('Audit logs not available');
    }
    
    res.json({ 
      success: true, 
      data: { 
        user: {
          ...user,
          password_hash: undefined // Never send password hash to frontend
        },
        recentActivity 
      } 
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch user details', 
      error: error.message 
    });
  }
});

// POST /api/admin/users - Create new user
router.post('/users', async (req, res) => {
  try {
    const { name, email, password, role, agency_id, permissions } = req.body;
    
    // Validation
    if (!name || !email || !password || !role) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields: name, email, password, role' 
      });
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid email format' 
      });
    }
    
    // Validate role
    const validRoles = ['super_admin', 'admin', 'agency_admin', 'agent', 'support'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ 
        success: false, 
        message: `Invalid role. Must be one of: ${validRoles.join(', ')}` 
      });
    }
    
    // Check if email already exists
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();
    
    if (existing) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email already exists' 
      });
    }
    
    // Hash password
    const password_hash = await bcrypt.hash(password, 10);
    
    // Create user
    const { data, error } = await supabase
      .from('users')
      .insert({
        name,
        email,
        password_hash,
        role,
        agency_id: agency_id || null,
        permissions: permissions || [],
        is_verified: true, // Admin-created users are pre-verified
        two_factor_enabled: false,
        is_active: true,
        created_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (error) throw error;
    
    // Log creation to audit logs (if table exists)
    try {
      await supabase
        .from('audit_logs')
        .insert({
          user_id: req.user?.id || null, // From auth middleware
          action: 'CREATE_USER',
          entity_type: 'user',
          entity_id: data.id,
          changes: { created_user: data.email },
          ip_address: req.ip,
          created_at: new Date().toISOString()
        });
    } catch (err) {
      console.log('Audit log not recorded');
    }
    
    res.status(201).json({ 
      success: true, 
      message: 'User created successfully',
      data: { 
        user: {
          ...data,
          password_hash: undefined // Never send password hash
        }
      } 
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create user', 
      error: error.message 
    });
  }
});

// PUT /api/admin/users/:id - Update user information
router.put('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, role, agency_id, permissions, two_factor_enabled, is_active } = req.body;
    
    // Check if user exists
    const { data: existingUser, error: checkError } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single();
    
    if (checkError || !existingUser) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }
    
    // Build updates object (only update provided fields)
    const updates = {
      updated_at: new Date().toISOString()
    };
    
    if (name !== undefined) updates.name = name;
    if (email !== undefined) {
      // Check if new email already exists
      if (email !== existingUser.email) {
        const { data: emailExists } = await supabase
          .from('users')
          .select('id')
          .eq('email', email)
          .neq('id', id)
          .single();
        
        if (emailExists) {
          return res.status(400).json({ 
            success: false, 
            message: 'Email already in use' 
          });
        }
      }
      updates.email = email;
    }
    if (role !== undefined) updates.role = role;
    if (agency_id !== undefined) updates.agency_id = agency_id;
    if (permissions !== undefined) updates.permissions = permissions;
    if (two_factor_enabled !== undefined) updates.two_factor_enabled = two_factor_enabled;
    if (is_active !== undefined) updates.is_active = is_active;
    
    // Update user
    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    
    // Log update to audit logs
    try {
      await supabase
        .from('audit_logs')
        .insert({
          user_id: req.user?.id || null,
          action: 'UPDATE_USER',
          entity_type: 'user',
          entity_id: id,
          changes: updates,
          ip_address: req.ip,
          created_at: new Date().toISOString()
        });
    } catch (err) {
      console.log('Audit log not recorded');
    }
    
    res.json({ 
      success: true, 
      message: 'User updated successfully',
      data: { 
        user: {
          ...data,
          password_hash: undefined
        }
      } 
    });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update user', 
      error: error.message 
    });
  }
});

// PUT /api/admin/users/:id/password - Reset user password
router.put('/users/:id/password', async (req, res) => {
  try {
    const { id } = req.params;
    const { new_password } = req.body;
    
    if (!new_password || new_password.length < 8) {
      return res.status(400).json({ 
        success: false, 
        message: 'Password must be at least 8 characters' 
      });
    }
    
    // Hash new password
    const password_hash = await bcrypt.hash(new_password, 10);
    
    // Update password
    const { data, error } = await supabase
      .from('users')
      .update({ 
        password_hash,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select('id, email')
      .single();
    
    if (error) throw error;
    
    // Log password reset
    try {
      await supabase
        .from('audit_logs')
        .insert({
          user_id: req.user?.id || null,
          action: 'RESET_PASSWORD',
          entity_type: 'user',
          entity_id: id,
          changes: { password_reset: true },
          ip_address: req.ip,
          created_at: new Date().toISOString()
        });
    } catch (err) {
      console.log('Audit log not recorded');
    }
    
    res.json({ 
      success: true, 
      message: 'Password reset successfully' 
    });
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to reset password', 
      error: error.message 
    });
  }
});

// DELETE /api/admin/users/:id - Delete user (soft delete)
router.delete('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if user exists
    const { data: existingUser, error: checkError } = await supabase
      .from('users')
      .select('email, role')
      .eq('id', id)
      .single();
    
    if (checkError || !existingUser) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }
    
    // Prevent deleting super admins (safety check)
    if (existingUser.role === 'super_admin') {
      return res.status(403).json({ 
        success: false, 
        message: 'Cannot delete super admin users' 
      });
    }
    
    // Soft delete by setting is_active = false
    const { data, error } = await supabase
      .from('users')
      .update({ 
        is_active: false, 
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select('id, email')
      .single();
    
    if (error) throw error;
    
    // Log deletion
    try {
      await supabase
        .from('audit_logs')
        .insert({
          user_id: req.user?.id || null,
          action: 'DELETE_USER',
          entity_type: 'user',
          entity_id: id,
          changes: { deleted_user: existingUser.email },
          ip_address: req.ip,
          created_at: new Date().toISOString()
        });
    } catch (err) {
      console.log('Audit log not recorded');
    }
    
    res.json({ 
      success: true, 
      message: 'User deleted successfully' 
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete user', 
      error: error.message 
    });
  }
});

// GET /api/admin/users/stats - Get user statistics
router.get('/users/stats', async (req, res) => {
  try {
    // Total users by role
    const { data: roleStats, error: roleError } = await supabase
      .from('users')
      .select('role')
      .eq('is_active', true);
    
    if (roleError) throw roleError;
    
    const roleCounts = roleStats.reduce((acc, user) => {
      acc[user.role] = (acc[user.role] || 0) + 1;
      return acc;
    }, {});
    
    // Total users
    const totalUsers = roleStats.length;
    
    // Users with 2FA enabled
    const { count: twoFactorCount } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      .eq('two_factor_enabled', true);
    
    // Recent logins (last 24 hours)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    const { count: recentLogins } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .gte('last_login', yesterday.toISOString());
    
    res.json({
      success: true,
      data: {
        totalUsers,
        roleCounts,
        twoFactorEnabled: twoFactorCount || 0,
        recentLogins: recentLogins || 0
      }
    });
  } catch (error) {
    console.error('Error fetching user stats:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch user statistics', 
      error: error.message 
    });
  }
});

module.exports = router;
