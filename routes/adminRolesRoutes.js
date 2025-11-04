const express = require('express');
const router = express.Router();
const supabase = require('../config/supabaseClient');
const { authenticateAdmin } = require('../middleware/adminAuth');

/**
 * ROLES MANAGEMENT ROUTES
 * User Story: US-1.1 - Role-based access control
 * Finance Manager: Access to Financial, Subscriptions, Agencies
 * Operations Manager: Access to Dashboard, Integrations, Portal Registry
 */

// Apply authentication to all routes
router.use(authenticateAdmin);

// GET /api/admin/roles - List all roles
router.get('/roles', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('roles')
      .select('*')
      .eq('is_active', true)
      .order('name');
    
    if (error) throw error;
    
    res.json({
      success: true,
      data: { roles: data || [] }
    });
  } catch (error) {
    console.error('Error fetching roles:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch roles', 
      error: error.message 
    });
  }
});

// GET /api/admin/roles/:id - Get role details
router.get('/roles/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const { data, error } = await supabase
      .from('roles')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) throw error;
    if (!data) {
      return res.status(404).json({ 
        success: false, 
        message: 'Role not found' 
      });
    }
    
    res.json({
      success: true,
      data: { role: data }
    });
  } catch (error) {
    console.error('Error fetching role:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch role details', 
      error: error.message 
    });
  }
});

// POST /api/admin/roles - Create new role
router.post('/roles', async (req, res) => {
  try {
    const { name, display_name, description, permissions } = req.body;
    
    if (!name || !display_name || !permissions) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields: name, display_name, permissions' 
      });
    }
    
    const { data, error } = await supabase
      .from('roles')
      .insert({
        name: name.toLowerCase().replace(/\s+/g, '_'),
        display_name,
        description: description || '',
        permissions,
        is_active: true,
        created_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (error) throw error;
    
    // Log to audit
    try {
      await supabase
        .from('audit_logs')
        .insert({
          user_id: req.user?.id || null,
          action: 'CREATE_ROLE',
          entity_type: 'roles',
          entity_id: data.id,
          changes: { name, permissions },
          ip_address: req.ip,
          created_at: new Date().toISOString()
        });
    } catch (err) {
      console.log('Audit log not recorded');
    }
    
    res.status(201).json({
      success: true,
      message: 'Role created successfully',
      data: { role: data }
    });
  } catch (error) {
    console.error('Error creating role:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create role', 
      error: error.message 
    });
  }
});

// PUT /api/admin/roles/:id - Update role
router.put('/roles/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { display_name, description, permissions, is_active } = req.body;
    
    const updates = {
      updated_at: new Date().toISOString()
    };
    
    if (display_name) updates.display_name = display_name;
    if (description !== undefined) updates.description = description;
    if (permissions) updates.permissions = permissions;
    if (is_active !== undefined) updates.is_active = is_active;
    
    const { data, error } = await supabase
      .from('roles')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    
    // Log to audit
    try {
      await supabase
        .from('audit_logs')
        .insert({
          user_id: req.user?.id || null,
          action: 'UPDATE_ROLE',
          entity_type: 'roles',
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
      message: 'Role updated successfully',
      data: { role: data }
    });
  } catch (error) {
    console.error('Error updating role:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update role', 
      error: error.message 
    });
  }
});

// DELETE /api/admin/roles/:id - Delete role (soft delete)
router.delete('/roles/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if role is in use
    const { count } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('role_id', id)
      .eq('is_active', true);
    
    if (count > 0) {
      return res.status(400).json({ 
        success: false, 
        message: `Cannot delete role. ${count} users are currently assigned to this role.` 
      });
    }
    
    // Soft delete
    const { error } = await supabase
      .from('roles')
      .update({ 
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);
    
    if (error) throw error;
    
    res.json({
      success: true,
      message: 'Role deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting role:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete role', 
      error: error.message 
    });
  }
});

// GET /api/admin/roles/:id/users - Get users assigned to role
router.get('/roles/:id/users', async (req, res) => {
  try {
    const { id } = req.params;
    
    const { data, error } = await supabase
      .from('users')
      .select('id, name, email, is_active, created_at')
      .eq('role_id', id)
      .eq('is_active', true)
      .order('name');
    
    if (error) throw error;
    
    res.json({
      success: true,
      data: { users: data || [] }
    });
  } catch (error) {
    console.error('Error fetching role users:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch users for role', 
      error: error.message 
    });
  }
});

// POST /api/admin/roles/check-permission - Check if user has permission
router.post('/roles/check-permission', async (req, res) => {
  try {
    const { user_id, resource } = req.body;
    
    if (!user_id || !resource) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields: user_id, resource' 
      });
    }
    
    // Get user's role
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('role_id, roles(permissions)')
      .eq('id', user_id)
      .single();
    
    if (userError) throw userError;
    
    if (!user || !user.roles) {
      return res.json({
        success: true,
        data: { hasPermission: false }
      });
    }
    
    const permissions = user.roles.permissions || [];
    const hasPermission = permissions.includes(resource);
    
    res.json({
      success: true,
      data: { 
        hasPermission,
        permissions 
      }
    });
  } catch (error) {
    console.error('Error checking permission:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to check permission', 
      error: error.message 
    });
  }
});

module.exports = router;
