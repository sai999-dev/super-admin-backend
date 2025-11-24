/**
 * Mobile Leads Controller
 * Handles all lead management operations for mobile app
 */

const supabase = require('../config/supabaseClient');

/**
 * GET /api/mobile/leads
 * Get agency's assigned leads with filters
 */
async function getLeads(req, res) {
  try {
    const agencyId = req.agency.id;
    const { status, from_date, to_date, limit = 50, page = 1 } = req.query;

    // Build query - fetch lead_assignments first, then get leads separately
    // This avoids the relationship cache issue
    let query = supabase
      .from('lead_assignments')
      .select('*')
      .eq('agency_id', agencyId);

    // Apply filters
    if (status) {
      query = query.eq('status', status);
    }

    if (from_date || to_date) {
      let leadsQuery = supabase.from('leads').select('id');
      if (from_date) {
        leadsQuery = leadsQuery.gte('created_at', from_date);
      }
      if (to_date) {
        leadsQuery = leadsQuery.lte('created_at', to_date);
      }
      const { data: filteredLeads } = await leadsQuery;
      if (filteredLeads && filteredLeads.length > 0) {
        query = query.in('lead_id', filteredLeads.map(l => l.id));
      } else {
        // No leads match date filter
        return res.json({
          success: true,
          leads: [],
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: 0,
            totalPages: 0
          }
        });
      }
    }

    // Get total count
    const { count } = await supabase
      .from('lead_assignments')
      .select('*', { count: 'exact', head: true })
      .eq('agency_id', agencyId);

    // Apply pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);
    query = query.range(offset, offset + parseInt(limit) - 1);
    query = query.order('assigned_at', { ascending: false });

    const { data: assignments, error } = await query;

    if (error) throw error;

    // Get lead IDs from assignments
    const leadIds = (assignments || []).map(a => a.lead_id).filter(Boolean);
    
    // Fetch leads separately to avoid relationship cache issue
    let leadsData = [];
    if (leadIds.length > 0) {
      const { data: leads, error: leadsError } = await supabase
        .from('leads')
        .select('id, first_name, last_name, email, phone, address, city, state, zipcode, status, source, notes, assigned_at, created_at, updated_at')
        .in('id', leadIds);
      
      if (leadsError) {
        console.error('Error fetching leads:', leadsError);
        throw leadsError;
      }
      
      // Create a map of lead_id -> lead data
      const leadsMap = new Map((leads || []).map(l => [l.id, l]));
      
      // Transform response by combining assignment and lead data
      leadsData = (assignments || [])
        .filter(a => leadsMap.has(a.lead_id))
        .map(a => ({
          ...leadsMap.get(a.lead_id),
          assignment_status: a.status,
          assignment_id: a.id,
          assigned_at: a.assigned_at,
          accepted_at: a.accepted_at,
          rejected_at: a.rejected_at
        }));
    }
    
    const leads = leadsData;

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
 */
async function getLeadById(req, res) {
  try {
    const agencyId = req.agency.id;
    const leadId = parseInt(req.params.id);

    // Verify lead is assigned to agency
    const { data: assignment, error: assignmentError } = await supabase
      .from('lead_assignments')
      .select('*, leads (*)')
      .eq('lead_id', leadId)
      .eq('agency_id', agencyId)
      .single();

    if (assignmentError || !assignment) {
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
      // Table might not exist, use lead.notes field instead
      if (assignment.leads && assignment.leads.notes) {
        notes = [{ note_text: assignment.leads.notes, created_at: assignment.leads.updated_at }];
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

    const leadData = {
      ...assignment.leads,
      assignment_status: assignment.status,
      assignment_id: assignment.id,
      assigned_at: assignment.assigned_at,
      accepted_at: assignment.accepted_at,
      rejected_at: assignment.rejected_at,
      notes,
      interactions
    };

    res.json({
      success: true,
      data: leadData
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
 */
async function acceptLead(req, res) {
  try {
    const agencyId = req.agency.id;
    const leadId = parseInt(req.params.id);
    const { notes } = req.body;

    // Verify lead is assigned to agency
    const { data: assignment, error: assignmentError } = await supabase
      .from('lead_assignments')
      .select('*')
      .eq('lead_id', leadId)
      .eq('agency_id', agencyId)
      .eq('status', 'pending')
      .single();

    if (assignmentError || !assignment) {
      return res.status(404).json({
        success: false,
        message: 'Lead assignment not found or already processed'
      });
    }

    // Update lead assignment
    const { error: updateError } = await supabase
      .from('lead_assignments')
      .update({
        status: 'accepted',
        accepted_at: new Date().toISOString()
      })
      .eq('id', assignment.id);

    if (updateError) throw updateError;

    // Update lead status
    const { error: leadUpdateError } = await supabase
      .from('leads')
      .update({
        status: 'contacted',
        assigned_to_agency_id: agencyId,
        assigned_at: new Date().toISOString(),
        accepted_at: new Date().toISOString(),
        notes: notes || undefined,
        updated_at: new Date().toISOString()
      })
      .eq('id', leadId);

    if (leadUpdateError) {
      console.warn('Error updating lead status:', leadUpdateError);
      // Continue anyway - assignment was updated
    }

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
 */
async function rejectLead(req, res) {
  try {
    const agencyId = req.agency.id;
    const leadId = parseInt(req.params.id);
    const { reason } = req.body;

    // Verify lead is assigned to agency
    const { data: assignment, error: assignmentError } = await supabase
      .from('lead_assignments')
      .select('*, leads (*)')
      .eq('lead_id', leadId)
      .eq('agency_id', agencyId)
      .eq('status', 'pending')
      .single();

    if (assignmentError || !assignment) {
      return res.status(404).json({
        success: false,
        message: 'Lead assignment not found or already processed'
      });
    }

    const lead = assignment.leads;

    // Update lead assignment
    const { error: updateError } = await supabase
      .from('lead_assignments')
      .update({
        status: 'rejected',
        rejected_at: new Date().toISOString()
      })
      .eq('id', assignment.id);

    if (updateError) throw updateError;

    // Update lead status to pending_reassignment
    const { error: leadUpdateError } = await supabase
      .from('leads')
      .update({
        status: 'pending_reassignment',
        rejection_reason: reason || 'Rejected by agency',
        rejected_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', leadId);

    if (leadUpdateError) {
      console.warn('Error updating lead:', leadUpdateError);
    }

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
      
      // Get full lead data for re-distribution
      const { data: fullLead, error: leadFetchError } = await supabase
        .from('leads')
        .select('*')
        .eq('id', leadId)
        .single();

      if (leadFetchError || !fullLead) {
        throw new Error('Could not fetch lead for re-distribution');
      }

      // Re-distribute, excluding the agency that rejected
      redistributionResult = await leadDistributionService.distributeLead(
        fullLead,
        [agencyId] // Exclude the rejecting agency
      );

      if (redistributionResult.success) {
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

        // Update lead status to assigned
        await supabase
          .from('leads')
          .update({
            status: 'assigned',
            assigned_agency_id: redistributionResult.agency_id,
            assigned_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', leadId);
      } else {
        // No eligible agencies found - set status to unassigned
        await supabase
          .from('leads')
          .update({
            status: 'unassigned',
            updated_at: new Date().toISOString()
          })
          .eq('id', leadId);
      }
    } catch (e) {
      console.error('Could not reassign lead via round-robin:', e.message);
      // Set lead to unassigned if re-distribution failed
      await supabase
        .from('leads')
        .update({
          status: 'unassigned',
          updated_at: new Date().toISOString()
        })
        .eq('id', leadId);
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
 */
async function updateLeadStatus(req, res) {
  try {
    const agencyId = req.agency.id;
    const leadId = parseInt(req.params.id);
    const { status, notes } = req.body;

    // Validate status
    const validStatuses = ['new', 'contacted', 'qualified', 'converted', 'rejected'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    // Verify lead is assigned to agency
    const { data: assignment, error: assignmentError } = await supabase
      .from('lead_assignments')
      .select('*')
      .eq('lead_id', leadId)
      .eq('agency_id', agencyId)
      .single();

    if (assignmentError || !assignment) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found or not assigned to your agency'
      });
    }

    // Get previous status for history
    const { data: currentLead } = await supabase
      .from('leads')
      .select('status')
      .eq('id', leadId)
      .single();

    // Update lead status
    const updates = {
      status,
      updated_at: new Date().toISOString()
    };

    if (notes) {
      updates.notes = notes;
    }

    const { data: updatedLead, error: updateError } = await supabase
      .from('leads')
      .update(updates)
      .eq('id', leadId)
      .select()
      .single();

    if (updateError) throw updateError;

    // Create status history entry (if table exists)
    try {
      await supabase.from('lead_status_history').insert({
        lead_id: leadId,
        previous_status: currentLead?.status || 'unknown',
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
      data: updatedLead
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
 */
async function markLeadViewed(req, res) {
  try {
    const agencyId = req.agency.id;
    const leadId = parseInt(req.params.id);

    // Verify lead is assigned to agency
    const { data: assignment, error: assignmentError } = await supabase
      .from('lead_assignments')
      .select('*')
      .eq('lead_id', leadId)
      .eq('agency_id', agencyId)
      .single();

    if (assignmentError || !assignment) {
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
 */
async function trackCall(req, res) {
  try {
    const agencyId = req.agency.id;
    const leadId = parseInt(req.params.id);
    const { duration_seconds, call_outcome } = req.body;

    // Verify lead is assigned to agency
    const { data: assignment, error: assignmentError } = await supabase
      .from('lead_assignments')
      .select('*')
      .eq('lead_id', leadId)
      .eq('agency_id', agencyId)
      .single();

    if (assignmentError || !assignment) {
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

    // Optionally update lead status to 'contacted' if still 'new'
    const { data: currentLead } = await supabase
      .from('leads')
      .select('status')
      .eq('id', leadId)
      .single();

    if (currentLead && currentLead.status === 'new') {
      await supabase
        .from('leads')
        .update({
          status: 'contacted',
          updated_at: new Date().toISOString()
        })
        .eq('id', leadId);
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
    const { data: assignment, error: assignmentError } = await supabase
      .from('lead_assignments')
      .select('*')
      .eq('lead_id', leadId)
      .eq('agency_id', agencyId)
      .single();

    if (assignmentError || !assignment) {
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
      // Table might not exist, fall back to updating leads.notes
      console.warn('lead_notes table not available, using leads.notes field');
      
      // Append to existing notes
      const { data: currentLead } = await supabase
        .from('leads')
        .select('notes')
        .eq('id', leadId)
        .single();

      const timestamp = new Date().toISOString();
      const existingNotes = currentLead?.notes || '';
      const updatedNotes = existingNotes 
        ? `${existingNotes}\n[${timestamp}]: ${notes.trim()}`
        : `[${timestamp}]: ${notes.trim()}`;

      await supabase
        .from('leads')
        .update({
          notes: updatedNotes,
          updated_at: new Date().toISOString()
        })
        .eq('id', leadId);
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

