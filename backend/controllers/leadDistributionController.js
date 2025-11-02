/**
 * Lead Distribution Controller
 * Handles HTTP requests for lead distribution operations
 */

import leadDistributionService from '../services/leadDistributionService.js';
import { supabase } from '../config/supabaseClient.js';

/**
 * Manually trigger lead distribution for a specific lead
 */
export const distributeLeadManually = async (req, res) => {
  try {
    const { leadId } = req.params;

    // Get lead details
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single();

    if (leadError || !lead) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found'
      });
    }

    // Check if lead is already assigned
    if (lead.status === 'assigned' || lead.assigned_agency_id) {
      return res.status(400).json({
        success: false,
        message: 'Lead is already assigned to an agency'
      });
    }

    // Distribute lead
    const result = await leadDistributionService.distributeLead(lead);

    if (result.success) {
      return res.status(200).json({
        success: true,
        message: 'Lead successfully distributed',
        data: result
      });
    } else {
      return res.status(400).json({
        success: false,
        message: result.message,
        data: result
      });
    }

  } catch (error) {
    console.error('Error in distributeLeadManually:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

/**
 * Batch distribute multiple unassigned leads
 */
export const batchDistributeLeads = async (req, res) => {
  try {
    const { limit = 50 } = req.body;

    // Get unassigned leads
    const { data: leads, error } = await supabase
      .from('leads')
      .select('*')
      .or('status.eq.new,status.is.null')
      .is('assigned_agency_id', null)
      .limit(limit);

    if (error) throw error;

    if (!leads || leads.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No unassigned leads found',
        data: {
          total: 0,
          successful: 0,
          failed: 0,
          assignments: [],
          errors: []
        }
      });
    }

    // Batch distribute
    const results = await leadDistributionService.batchDistribute(leads);

    return res.status(200).json({
      success: true,
      message: `Distributed ${results.successful} of ${results.total} leads`,
      data: results
    });

  } catch (error) {
    console.error('Error in batchDistributeLeads:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

/**
 * Get distribution statistics
 */
export const getDistributionStats = async (req, res) => {
  try {
    const { territory } = req.query;

    const stats = await leadDistributionService.getDistributionStats(territory);

    return res.status(200).json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Error in getDistributionStats:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

/**
 * Test distribution eligibility for a lead
 */
export const testDistributionEligibility = async (req, res) => {
  try {
    const { leadId } = req.params;

    // Get lead details
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single();

    if (leadError || !lead) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found'
      });
    }

    // Find eligible agencies (without actually assigning)
    const eligibleAgencies = await leadDistributionService.findEligibleAgencies(
      lead.territory || lead.zipcode,
      lead.industry_type
    );

    // Check capacity
    const agenciesWithCapacity = await leadDistributionService.filterBySubscriptionLimits(
      eligibleAgencies
    );

    return res.status(200).json({
      success: true,
      data: {
        lead_id: lead.id,
        territory: lead.territory || lead.zipcode,
        industry: lead.industry_type,
        eligible_agencies: eligibleAgencies.length,
        agencies_with_capacity: agenciesWithCapacity.length,
        agencies: agenciesWithCapacity.map(a => ({
          id: a.id,
          business_name: a.business_name,
          industry_type: a.industry_type,
          current_leads: a.current_lead_count,
          max_leads: a.max_leads,
          capacity_remaining: a.capacity_remaining
        }))
      }
    });

  } catch (error) {
    console.error('Error in testDistributionEligibility:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

/**
 * Reassign lead to different agency
 */
export const reassignLead = async (req, res) => {
  try {
    const { leadId } = req.params;
    const { agencyId } = req.body;

    if (!agencyId) {
      return res.status(400).json({
        success: false,
        message: 'Agency ID is required'
      });
    }

    // Get lead
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single();

    if (leadError || !lead) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found'
      });
    }

    // Archive old assignment
    if (lead.assigned_agency_id) {
      await supabase
        .from('lead_assignments')
        .update({ status: 'reassigned' })
        .eq('lead_id', leadId)
        .eq('agency_id', lead.assigned_agency_id);
    }

    // Create new assignment
    const assignment = await leadDistributionService.assignLeadToAgency(leadId, agencyId);

    return res.status(200).json({
      success: true,
      message: 'Lead reassigned successfully',
      data: assignment
    });

  } catch (error) {
    console.error('Error in reassignLead:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};
