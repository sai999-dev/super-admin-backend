/**
 * Mobile Leads Controller
 * Handles all lead management operations for mobile app
 */

const supabase = require('../config/supabaseClient');

/**
 * GET /api/mobile/leads
 * Get agency's assigned leads with filters
 * Uses audit_logs and unified_leads tables
 */
async function getLeads(req, res) {
  try {
    const agencyId = req.agency.id;
    const { status, from_date, to_date, limit = 50, page = 1 } = req.query;

    // Build query from audit_logs
    let query = supabase
      .from('audit_logs')
      .select('*')
      .eq('agency_id', agencyId);

    // Apply status filter
    if (status) {
      query = query.eq('action_status', status);
    }

    // Apply date filters
    if (from_date) {
      query = query.gte('created_at', from_date);
    }
    if (to_date) {
      query = query.lte('created_at', to_date);
    }

    // Get total count
    const { count } = await supabase
      .from('audit_logs')
      .select('*', { count: 'exact', head: true })
      .eq('agency_id', agencyId);

    // Apply pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);
    query = query.range(offset, offset + parseInt(limit) - 1);
    query = query.order('created_at', { ascending: false });

    const { data: auditLogs, error } = await query;

    if (error) throw error;

    // Transform audit_logs to lead format
    const leads = (auditLogs || []).map(log => {
      const leadData = log.lead_data || {};
      return {
        id: log.lead_id || leadData.id,
        first_name: leadData.first_name || leadData.firstName || leadData.lead_name || leadData.name || 'Unknown',
        last_name: leadData.last_name || leadData.lastName || '',
        phone: leadData.phone_number || leadData.phone || '',
        email: leadData.email || '',
        city: leadData.city || '',
        zipcode: leadData.zipcode || leadData.zip || '',
        state: leadData.state || '',
        address: leadData.address || leadData.street || '',
        urgency_level: leadData.urgency_level || leadData.urgency || 'MODERATE',
        notes: leadData.notes || leadData.description || '',
        service_type: leadData.service_type || leadData.serviceType || '',
        industry: leadData.industry || log.industry || '',
        status: log.action_status || 'assigned',
        created_at: log.created_at,
        assigned_at: log.created_at,
        budget_range: leadData.budget_range || leadData.budget || '',
        property_type: leadData.property_type || '',
        timeline: leadData.timeline || '',
        assignment_status: log.action_status,
        assignment_id: log.id
      };
    });

    res.json({
      success: true,
      leads,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count || 0,
        totalPages: Math.ceil((count || 0) / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching leads:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch leads',
      error: error.message
    });
  }
}

/**
 * GET /api/mobile/leads/:id
 * Get detailed information for a specific lead
 * Uses audit_logs and unified_leads tables
 */
async function getLeadById(req, res) {
  try {
    const agencyId = req.agency.id;
    const leadId = parseInt(req.params.id);

    // Get from audit_logs
    const { data: auditLog, error: auditError } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('lead_id', leadId)
      .eq('agency_id', agencyId)
      .single();

    if (auditError || !auditLog) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found or not assigned to your agency'
      });
    }

    // Get lead notes if available
    let notes = [];
    try {
      const { data: leadNotes } = await supabase
        .from('lead_notes')
        .select('*')
        .eq('lead_id', leadId)
        .eq('agency_id', agencyId)
        .order('created_at', { ascending: false });
      notes = leadNotes || [];
    } catch (e) {
      // Table might not exist, use lead_data.notes field instead
      const leadData = auditLog.lead_data || {};
      if (leadData.notes) {
        notes = [{ note_text: leadData.notes, created_at: auditLog.created_at }];
      }
    }

    // Get interactions if available
    let interactions = [];
    try {
      const { data: leadInteractions } = await supabase
        .from('lead_interactions')
        .select('*')
        .eq('lead_id', leadId)
        .eq('agency_id', agencyId)
        .order('created_at', { ascending: false })
        .limit(10);
      interactions = leadInteractions || [];
    } catch (e) {
      // Table might not exist, that's ok
    }

    // Transform audit_log to lead format
    const leadData = auditLog.lead_data || {};
    const transformedLead = {
      id: auditLog.lead_id || leadData.id,
      first_name: leadData.first_name || leadData.firstName || leadData.lead_name || leadData.name || 'Unknown',
      last_name: leadData.last_name || leadData.lastName || '',
      phone: leadData.phone_number || leadData.phone || '',
      email: leadData.email || '',
      city: leadData.city || '',
      zipcode: leadData.zipcode || leadData.zip || '',
      state: leadData.state || '',
      address: leadData.address || leadData.street || '',
      urgency_level: leadData.urgency_level || leadData.urgency || 'MODERATE',
      notes: leadData.notes || leadData.description || '',
      service_type: leadData.service_type || leadData.serviceType || '',
      industry: leadData.industry || auditLog.industry || '',
      status: auditLog.action_status || 'assigned',
      created_at: auditLog.created_at,
      assigned_at: auditLog.created_at,
      budget_range: leadData.budget_range || leadData.budget || '',
      property_type: leadData.property_type || '',
      timeline: leadData.timeline || '',
      assignment_status: auditLog.action_status,
      assignment_id: auditLog.id,
      notes: notes,
      interactions: interactions
    };

    res.json({
      success: true,
      data: transformedLead
    });
  } catch (error) {
    console.error('Error fetching lead:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch lead',
      error: error.message
    });
  }
}

/**
 * PUT /api/mobile/leads/:id/accept
 * Accept a lead assignment
 * Uses audit_logs table
 */
async function acceptLead(req, res) {
  try {
    const agencyId = req.agency.id;
    const leadId = parseInt(req.params.id);
    const { notes } = req.body;

    // Verify lead is assigned to agency
    const { data: auditLog, error: auditError } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('lead_id', leadId)
      .eq('agency_id', agencyId)
      .eq('action_status', 'assigned')
      .single();

    if (auditError || !auditLog) {
      return res.status(404).json({
        success: false,
        message: 'Lead assignment not found or already processed'
      });
    }

    // Update audit_log status
    const updateData = {
      action_status: 'contacted'
    };

    // Update lead_data with notes if provided
    if (notes) {
      const leadData = auditLog.lead_data || {};
      leadData.notes = notes;
      updateData.lead_data = leadData;
    }

    const { error: updateError } = await supabase
      .from('audit_logs')
      .update(updateData)
      .eq('id', auditLog.id);

    if (updateError) throw updateError;

    // Create notification (if notifications table exists)
    try {
      await supabase.from('notifications').insert({
        agency_id: agencyId,
        title: 'Lead Accepted',
        message: `You accepted a lead assignment`,
        type: 'lead_accepted',
        related_lead_id: leadId
      });
    } catch (e) {
      // Notifications table might not exist
    }

    res.json({
      success: true,
      message: 'Lead accepted successfully'
    });
  } catch (error) {
    console.error('Error accepting lead:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to accept lead',
      error: error.message
    });
  }
}

/**
 * PUT /api/mobile/leads/:id/reject
 * Reject a lead assignment (triggers round-robin reassignment)
 * Uses audit_logs table
 */
async function rejectLead(req, res) {
  try {
    const agencyId = req.agency.id;
    const leadId = parseInt(req.params.id);
    const { reason } = req.body;

    // Verify lead is assigned to agency
    const { data: auditLog, error: auditError } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('lead_id', leadId)
      .eq('agency_id', agencyId)
      .single();

    if (auditError || !auditLog) {
      return res.status(404).json({
        success: false,
        message: 'Lead assignment not found or already processed'
      });
    }

    // Update audit_log status to rejected
    const leadData = auditLog.lead_data || {};
    leadData.rejection_reason = reason || 'Rejected by agency';

    const { error: updateError } = await supabase
      .from('audit_logs')
      .update({
        action_status: 'rejected',
        lead_data: leadData
      })
      .eq('id', auditLog.id);

    if (updateError) throw updateError;

    // Log rejection action
    try {
      const auditService = require('../services/auditService');
      await auditService.log({
        action: 'lead_rejected',
        resource_type: 'lead',
        resource_id: leadId.toString(),
        metadata: {
          agency_id: agencyId,
          rejection_reason: reason || 'No reason provided'
        },
        status: 'success',
        message: `Lead ${leadId} rejected by agency ${agencyId}`
      });
    } catch (e) {
      console.warn('Could not log rejection:', e.message);
    }

    // Round-robin: Re-assign to next agency (excluding the one that rejected)
    let redistributionResult = null;
    try {
      const leadDistributionService = require('../services/leadDistributionService');

      // Get full lead data from unified_leads
      const { data: fullLead, error: leadFetchError } = await supabase
        .from('unified_leads')
        .select('*')
        .eq('id', leadId)
        .single();

      if (leadFetchError || !fullLead) {
        console.warn('Could not fetch lead from unified_leads for re-distribution');
        // Use lead_data from audit_log as fallback
        redistributionResult = await leadDistributionService.distributeLead(
          auditLog.lead_data,
          [agencyId] // Exclude the rejecting agency
        );
      } else {
        // Re-distribute, excluding the agency that rejected
        redistributionResult = await leadDistributionService.distributeLead(
          fullLead,
          [agencyId] // Exclude the rejecting agency
        );
      }

      if (redistributionResult?.success) {
        // Log successful re-assignment
        try {
          const auditService = require('../services/auditService');
          await auditService.logLeadAssignment(
            leadId.toString(),
            redistributionResult.agency_id,
            redistributionResult.assignment_id,
            'reassigned_after_rejection'
          );
        } catch (e) {
          console.warn('Could not log re-assignment:', e.message);
        }
      }
    } catch (e) {
      console.error('Could not reassign lead via round-robin:', e.message);
    }

    res.json({
      success: true,
      message: redistributionResult?.success
        ? 'Lead rejected and reassigned to another agency successfully'
        : 'Lead rejected. Re-assignment attempted but no eligible agencies found.',
      data: redistributionResult ? {
        reassigned: redistributionResult.success,
        new_agency_id: redistributionResult.agency_id,
        new_assignment_id: redistributionResult.assignment_id
      } : null
    });
  } catch (error) {
    console.error('Error rejecting lead:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject lead',
      error: error.message
    });
  }
}

/**
 * PUT /api/mobile/leads/:id/status
 * Update lead status
 * Uses audit_logs table
 */
async function updateLeadStatus(req, res) {
  try {
    const agencyId = req.agency.id;
    const leadId = parseInt(req.params.id);
    const { status, notes } = req.body;

    // Validate status (using action_status values)
    const validStatuses = ['assigned', 'contacted', 'qualified', 'converted', 'rejected'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    // Verify lead is assigned to agency
    const { data: auditLog, error: auditError } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('lead_id', leadId)
      .eq('agency_id', agencyId)
      .single();

    if (auditError || !auditLog) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found or not assigned to your agency'
      });
    }

    // Get previous status for history
    const previousStatus = auditLog.action_status || 'unknown';

    // Update audit_log with new status
    const leadData = auditLog.lead_data || {};
    if (notes) {
      leadData.notes = notes;
    }

    const { data: updatedLog, error: updateError } = await supabase
      .from('audit_logs')
      .update({
        action_status: status,
        lead_data: leadData
      })
      .eq('id', auditLog.id)
      .select()
      .single();

    if (updateError) throw updateError;

    // Create status history entry (if table exists)
    try {
      await supabase.from('lead_status_history').insert({
        lead_id: leadId,
        previous_status: previousStatus,
        new_status: status,
        changed_by_agency_id: agencyId,
        notes,
        changed_at: new Date().toISOString()
      });
    } catch (e) {
      // Table might not exist, that's ok
    }

    res.json({
      success: true,
      message: 'Lead status updated successfully',
      data: {
        id: leadId,
        status: status,
        ...leadData
      }
    });
  } catch (error) {
    console.error('Error updating lead status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update lead status',
      error: error.message
    });
  }
}

/**
 * PUT /api/mobile/leads/:id/view
 * Mark lead as viewed (analytics tracking)
 * Uses audit_logs table
 */
async function markLeadViewed(req, res) {
  try {
    const agencyId = req.agency.id;
    const leadId = parseInt(req.params.id);

    // Verify lead is assigned to agency
    const { data: auditLog, error: auditError } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('lead_id', leadId)
      .eq('agency_id', agencyId)
      .single();

    if (auditError || !auditLog) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found or not assigned to your agency'
      });
    }

    // Try to track in lead_views table (one view per day)
    try {
      const today = new Date().toISOString().split('T')[0];
      await supabase.from('lead_views').insert({
        lead_id: leadId,
        agency_id: agencyId,
        viewed_at: new Date().toISOString()
      }).select().single();
    } catch (e) {
      // Table might not exist or duplicate key - that's ok
    }

    res.json({
      success: true,
      message: 'Lead marked as viewed'
    });
  } catch (error) {
    console.error('Error marking lead as viewed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark lead as viewed',
      error: error.message
    });
  }
}

/**
 * POST /api/mobile/leads/:id/call
 * Track phone call made to lead
 * Uses audit_logs table
 */
async function trackCall(req, res) {
  try {
    const agencyId = req.agency.id;
    const leadId = parseInt(req.params.id);
    const { duration_seconds, call_outcome } = req.body;

    // Verify lead is assigned to agency
    const { data: auditLog, error: auditError } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('lead_id', leadId)
      .eq('agency_id', agencyId)
      .single();

    if (auditError || !auditLog) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found or not assigned to your agency'
      });
    }

    // Insert interaction
    try {
      await supabase.from('lead_interactions').insert({
        lead_id: leadId,
        agency_id: agencyId,
        interaction_type: 'phone_call',
        interaction_data: {
          duration_seconds,
          outcome: call_outcome || 'unknown'
        },
        created_at: new Date().toISOString()
      });
    } catch (e) {
      console.warn('Could not insert interaction:', e.message);
    }

    // Optionally update lead status to 'contacted' if still 'assigned'
    if (auditLog.action_status === 'assigned') {
      await supabase
        .from('audit_logs')
        .update({
          action_status: 'contacted'
        })
        .eq('id', auditLog.id);
    }

    // Get updated call count
    let callCount = 0;
    try {
      const { count } = await supabase
        .from('lead_interactions')
        .select('*', { count: 'exact', head: true })
        .eq('lead_id', leadId)
        .eq('agency_id', agencyId)
        .eq('interaction_type', 'phone_call');
      callCount = count || 0;
    } catch (e) {
      callCount = 1; // Fallback
    }

    res.json({
      success: true,
      message: 'Call tracked successfully',
      lead_id: leadId,
      call_count: callCount
    });
  } catch (error) {
    console.error('Error tracking call:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to track call',
      error: error.message
    });
  }
}

/**
 * POST /api/mobile/leads/:id/notes
 * Add notes/comments to a lead
 * Uses audit_logs table
 */
async function addNotes(req, res) {
  try {
    const agencyId = req.agency.id;
    const leadId = parseInt(req.params.id);
    const { notes } = req.body;

    if (!notes || !notes.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Notes text is required'
      });
    }

    // Verify lead is assigned to agency
    const { data: auditLog, error: auditError } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('lead_id', leadId)
      .eq('agency_id', agencyId)
      .single();

    if (auditError || !auditLog) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found or not assigned to your agency'
      });
    }

    // Try to insert into lead_notes table (recommended approach)
    let noteId = null;
    try {
      const { data: newNote, error: noteError } = await supabase
        .from('lead_notes')
        .insert({
          lead_id: leadId,
          agency_id: agencyId,
          note_text: notes.trim(),
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (!noteError && newNote) {
        noteId = newNote.id;
      }
    } catch (e) {
      // Table might not exist, fall back to updating lead_data.notes
      console.warn('lead_notes table not available, using lead_data.notes field');

      const leadData = auditLog.lead_data || {};
      const timestamp = new Date().toISOString();
      const existingNotes = leadData.notes || '';
      const updatedNotes = existingNotes
        ? `${existingNotes}\n[${timestamp}]: ${notes.trim()}`
        : `[${timestamp}]: ${notes.trim()}`;

      leadData.notes = updatedNotes;

      await supabase
        .from('audit_logs')
        .update({
          lead_data: leadData
        })
        .eq('id', auditLog.id);
    }

    res.json({
      success: true,
      message: 'Notes added successfully',
      note_id: noteId,
      lead_id: leadId
    });
  } catch (error) {
    console.error('Error adding notes:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add notes',
      error: error.message
    });
  }
}

module.exports = {
  getLeads,
  getLeadById,
  acceptLead,
  rejectLead,
  updateLeadStatus,
  markLeadViewed,
  trackCall,
  addNotes
};

