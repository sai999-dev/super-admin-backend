/**
 * Lead Distribution Service
 * Implements intelligent lead distribution algorithm with:
 * - Territory/industry matching
 * - Round-robin distribution
 * - Subscription limit handling
 * - Fair allocation across agencies
 */

import { supabase } from '../config/supabaseClient.js';

class LeadDistributionService {
  /**
   * Main distribution function - assigns lead to appropriate agency
   * @param {Object} lead - Lead object with territory, industry, etc.
   * @returns {Object} - Distribution result with agency assignment
   */
  async distributeLead(lead) {
    try {
      console.log(`📊 Starting distribution for lead ${lead.id}`);

      // Step 1: Find eligible agencies based on territory and industry
      const eligibleAgencies = await this.findEligibleAgencies(
        lead.territory || lead.zipcode,
        lead.industry_type
      );

      if (eligibleAgencies.length === 0) {
        console.log('⚠️ No eligible agencies found');
        return {
          success: false,
          message: 'No agencies available for this territory/industry',
          lead_id: lead.id
        };
      }

      // Step 2: Filter agencies by subscription limits
      const agenciesWithCapacity = await this.filterBySubscriptionLimits(eligibleAgencies);

      if (agenciesWithCapacity.length === 0) {
        console.log('⚠️ All agencies at capacity');
        return {
          success: false,
          message: 'All agencies have reached their subscription limits',
          lead_id: lead.id
        };
      }

      // Step 3: Apply round-robin to select agency
      const selectedAgency = await this.selectAgencyRoundRobin(
        agenciesWithCapacity,
        lead.territory || lead.zipcode
      );

      // Step 4: Assign lead to agency
      const assignment = await this.assignLeadToAgency(lead.id, selectedAgency.id);

      // Step 5: Update distribution sequence
      await this.updateDistributionSequence(selectedAgency.id, lead.territory || lead.zipcode);

      console.log(`✅ Lead ${lead.id} assigned to agency ${selectedAgency.business_name}`);

      return {
        success: true,
        lead_id: lead.id,
        agency_id: selectedAgency.id,
        agency_name: selectedAgency.business_name,
        assignment_id: assignment.id,
        distribution_method: 'round-robin'
      };

    } catch (error) {
      console.error('❌ Lead distribution error:', error);
      return {
        success: false,
        message: error.message,
        lead_id: lead.id
      };
    }
  }

  /**
   * Find agencies matching territory and industry
   * @param {string} territory - Zipcode or city
   * @param {string} industry - Industry type
   * @returns {Array} - Eligible agencies
   */
  async findEligibleAgencies(territory, industry) {
    try {
      // Query agencies with active subscriptions covering this territory
      const { data: agencies, error } = await supabase
        .from('agencies')
        .select(`
          id,
          business_name,
          industry_type,
          is_active,
          subscription_plan_id,
          subscriptions:agency_subscriptions!inner(
            id,
            territories,
            status,
            is_active
          )
        `)
        .eq('is_active', true)
        .eq('subscriptions.is_active', true)
        .eq('subscriptions.status', 'active');

      if (error) throw error;

      // Filter by territory match
      const matchingAgencies = agencies.filter(agency => {
        // Check if agency's subscribed territories include this lead's territory
        const territories = agency.subscriptions[0]?.territories || [];
        return territories.some(t => 
          t.zipcode === territory || 
          t.city === territory ||
          territory.startsWith(t.zipcode?.substring(0, 3)) // Partial zipcode match
        );
      });

      // Prioritize agencies matching the industry
      const industryMatches = matchingAgencies.filter(a => a.industry_type === industry);
      
      // Return industry matches first, then all matches
      return industryMatches.length > 0 ? industryMatches : matchingAgencies;

    } catch (error) {
      console.error('Error finding eligible agencies:', error);
      return [];
    }
  }

  /**
   * Filter agencies by subscription capacity
   * @param {Array} agencies - List of agencies to check
   * @returns {Array} - Agencies with remaining capacity
   */
  async filterBySubscriptionLimits(agencies) {
    const agenciesWithCapacity = [];

    for (const agency of agencies) {
      // Get agency's subscription plan limits
      const { data: plan } = await supabase
        .from('subscription_plans')
        .select('max_units, base_units')
        .eq('id', agency.subscription_plan_id)
        .single();

      if (!plan) continue;

      // Get current lead count for this month
      const { count: leadCount } = await supabase
        .from('lead_assignments')
        .select('*', { count: 'only' })
        .eq('agency_id', agency.id)
        .gte('assigned_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString());

      // Check if agency has capacity
      const maxLeads = plan.max_units || plan.base_units || 100;
      if (leadCount < maxLeads) {
        agenciesWithCapacity.push({
          ...agency,
          current_lead_count: leadCount,
          max_leads: maxLeads,
          capacity_remaining: maxLeads - leadCount
        });
      }
    }

    return agenciesWithCapacity;
  }

  /**
   * Select agency using round-robin algorithm
   * @param {Array} agencies - Agencies with capacity
   * @param {string} territory - Territory for sequence tracking
   * @returns {Object} - Selected agency
   */
  async selectAgencyRoundRobin(agencies, territory) {
    try {
      // Get current distribution sequence for this territory
      const { data: sequences, error } = await supabase
        .from('lead_distribution_sequence')
        .select('*')
        .eq('territory', territory)
        .order('last_assigned_at', { ascending: true });

      if (error) throw error;

      // Create map of agency IDs to their last assignment time
      const sequenceMap = new Map(
        sequences?.map(s => [s.agency_id, s.last_assigned_at]) || []
      );

      // Find agency that was assigned longest ago (or never assigned)
      let selectedAgency = agencies[0];
      let oldestAssignment = sequenceMap.get(selectedAgency.id) || '1970-01-01';

      for (const agency of agencies) {
        const lastAssigned = sequenceMap.get(agency.id) || '1970-01-01';
        if (lastAssigned < oldestAssignment) {
          oldestAssignment = lastAssigned;
          selectedAgency = agency;
        }
      }

      return selectedAgency;

    } catch (error) {
      console.error('Error in round-robin selection:', error);
      // Fallback to first agency
      return agencies[0];
    }
  }

  /**
   * Assign lead to agency in database
   * @param {string} leadId - Lead ID
   * @param {string} agencyId - Agency ID
   * @returns {Object} - Assignment record
   */
  async assignLeadToAgency(leadId, agencyId) {
    const { data: assignment, error } = await supabase
      .from('lead_assignments')
      .insert({
        lead_id: leadId,
        agency_id: agencyId,
        assigned_at: new Date().toISOString(),
        assignment_method: 'auto_distribution',
        status: 'assigned'
      })
      .select()
      .single();

    if (error) throw error;

    // Update lead status
    await supabase
      .from('leads')
      .update({ 
        status: 'assigned',
        assigned_agency_id: agencyId,
        assigned_at: new Date().toISOString()
      })
      .eq('id', leadId);

    return assignment;
  }

  /**
   * Update distribution sequence for territory
   * @param {string} agencyId - Agency ID
   * @param {string} territory - Territory
   */
  async updateDistributionSequence(agencyId, territory) {
    const { data: existing } = await supabase
      .from('lead_distribution_sequence')
      .select('*')
      .eq('agency_id', agencyId)
      .eq('territory', territory)
      .single();

    if (existing) {
      // Update existing sequence
      await supabase
        .from('lead_distribution_sequence')
        .update({
          sequence_number: existing.sequence_number + 1,
          last_assigned_at: new Date().toISOString(),
          total_leads_assigned: existing.total_leads_assigned + 1
        })
        .eq('id', existing.id);
    } else {
      // Create new sequence
      await supabase
        .from('lead_distribution_sequence')
        .insert({
          agency_id: agencyId,
          territory: territory,
          sequence_number: 1,
          last_assigned_at: new Date().toISOString(),
          total_leads_assigned: 1
        });
    }
  }

  /**
   * Distribute multiple leads in batch
   * @param {Array} leads - Array of leads to distribute
   * @returns {Object} - Batch distribution results
   */
  async batchDistribute(leads) {
    const results = {
      total: leads.length,
      successful: 0,
      failed: 0,
      assignments: [],
      errors: []
    };

    for (const lead of leads) {
      const result = await this.distributeLead(lead);
      
      if (result.success) {
        results.successful++;
        results.assignments.push(result);
      } else {
        results.failed++;
        results.errors.push(result);
      }
    }

    return results;
  }

  /**
   * Get distribution statistics
   * @param {string} territory - Optional territory filter
   * @returns {Object} - Distribution stats
   */
  async getDistributionStats(territory = null) {
    let query = supabase
      .from('lead_distribution_sequence')
      .select('*');

    if (territory) {
      query = query.eq('territory', territory);
    }

    const { data: sequences, error } = await query;

    if (error) throw error;

    const stats = {
      total_agencies: sequences.length,
      total_leads_distributed: sequences.reduce((sum, s) => sum + s.total_leads_assigned, 0),
      by_agency: sequences.map(s => ({
        agency_id: s.agency_id,
        territory: s.territory,
        leads_assigned: s.total_leads_assigned,
        last_assignment: s.last_assigned_at
      }))
    };

    return stats;
  }
}

export default new LeadDistributionService();
