/**
 * Lead Distribution Service
 * Implements intelligent lead distribution algorithm with:
 * - Territory/industry matching
 * - Round-robin distribution
 * - Subscription limit handling
 * - Fair allocation across agencies
 */

const supabase = require('../config/supabaseClient');

class LeadDistributionService {
  /**
   * Main distribution function - assigns lead to appropriate agency
   * @param {Object} lead - Lead object with territory, industry, etc.
   * @param {Array} excludeAgencyIds - Optional array of agency IDs to exclude (for re-distribution)
   * @returns {Object} - Distribution result with agency assignment
   */
  async distributeLead(lead, excludeAgencyIds = []) {
    try {
      console.log(`📊 Starting distribution for lead ${lead.id}${excludeAgencyIds.length > 0 ? ` (excluding ${excludeAgencyIds.length} agencies)` : ''}`);

      // Step 1: Find eligible agencies based on territory and industry
      let eligibleAgencies = await this.findEligibleAgencies(
        lead.territory || lead.zipcode || lead.zip_code,
        lead.industry_type || lead.industry
      );

      // Exclude agencies that already rejected this lead (for re-distribution)
      if (excludeAgencyIds && excludeAgencyIds.length > 0) {
        eligibleAgencies = eligibleAgencies.filter(agency => 
          !excludeAgencyIds.includes(agency.id)
        );
        console.log(`🔍 Filtered out ${excludeAgencyIds.length} agencies, ${eligibleAgencies.length} remaining`);
      }

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

      // Step 3: Apply round-robin to select agency (excluding rejected agencies)
      const selectedAgency = await this.selectAgencyRoundRobin(
        agenciesWithCapacity,
        lead.territory || lead.zipcode || lead.zip_code,
        excludeAgencyIds
      );

      // Step 4: Assign lead to agency
      const assignment = await this.assignLeadToAgency(lead.id, selectedAgency.id);

      // Step 5: Update distribution sequence
      await this.updateDistributionSequence(selectedAgency.id, lead.territory || lead.zipcode || lead.zip_code);

      // Step 6: Send push notification to agency
      try {
        const notificationService = require('./notificationService');
        await notificationService.notifyLeadAssigned(selectedAgency.id, lead.id, lead);
      } catch (notifError) {
        // Log but don't fail - notification is non-critical
        console.warn('Failed to send notification (non-critical):', notifError.message);
      }

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
      if (!territory) {
        console.warn('⚠️ No territory provided for lead distribution');
        return [];
      }

      // Query agencies with active subscriptions
      // First, get all active agencies
      const { data: agencies, error } = await supabase
        .from('agencies')
        .select(`
          id,
          business_name,
          industry_type,
          is_active
        `)
        .eq('is_active', true);

      if (error) throw error;

      // Then get their subscriptions with territories
      const eligibleAgencies = [];
      
      for (const agency of agencies || []) {
        // Get agency's active subscriptions
        const { data: subscriptions, error: subError } = await supabase
          .from('agency_subscriptions')
          .select('id, territories, status, is_active')
          .eq('agency_id', agency.id)
          .eq('is_active', true)
          .eq('status', 'active');

        if (subError) {
          console.warn(`Error fetching subscriptions for agency ${agency.id}:`, subError.message);
          continue;
        }

        if (!subscriptions || subscriptions.length === 0) continue;

        // Check if any subscription covers this territory
        const coversTerritory = subscriptions.some(sub => {
          const territories = sub.territories || [];
          if (Array.isArray(territories)) {
            return territories.some(t => {
              const zipcode = t.zipcode || t.zip_code || t;
              const city = t.city || '';
              return zipcode === territory || 
                     city === territory ||
                     (typeof zipcode === 'string' && territory.startsWith(zipcode.substring(0, 3)));
            });
          }
          return false;
        });

        if (coversTerritory) {
          eligibleAgencies.push({
            ...agency,
            subscriptions
          });
        }
      }

      // Prioritize agencies matching the industry
      const industryMatches = eligibleAgencies.filter(a => 
        a.industry_type && industry && a.industry_type.toLowerCase() === industry.toLowerCase()
      );
      
      // Return industry matches first, then all matches
      return industryMatches.length > 0 ? industryMatches : eligibleAgencies;

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
      try {
        // Get agency's subscription plan
        const { data: subscriptions } = await supabase
          .from('agency_subscriptions')
          .select('plan_id')
          .eq('agency_id', agency.id)
          .eq('is_active', true)
          .eq('status', 'active')
          .limit(1)
          .single();

        if (!subscriptions || !subscriptions.plan_id) continue;

        const { data: plan } = await supabase
          .from('subscription_plans')
          .select('max_units, base_units, min_units')
          .eq('id', subscriptions.plan_id)
          .single();

        if (!plan) continue;

        // Get current lead count for this month
        const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
        const { count: leadCount } = await supabase
          .from('lead_assignments')
          .select('*', { count: 'exact', head: true })
          .eq('agency_id', agency.id)
          .gte('assigned_at', startOfMonth);

        // Check if agency has capacity
        const maxLeads = plan.max_units || plan.base_units || 100;
        const currentCount = leadCount || 0;
        
        if (currentCount < maxLeads) {
          agenciesWithCapacity.push({
            ...agency,
            current_lead_count: currentCount,
            max_leads: maxLeads,
            capacity_remaining: maxLeads - currentCount
          });
        }
      } catch (error) {
        console.warn(`Error checking capacity for agency ${agency.id}:`, error.message);
        continue;
      }
    }

    return agenciesWithCapacity;
  }

  /**
   * Select agency using round-robin algorithm
   * @param {Array} agencies - Agencies with capacity
   * @param {string} territory - Territory for sequence tracking
   * @param {Array} excludeAgencyIds - Optional array of agency IDs to exclude
   * @returns {Object} - Selected agency
   */
  async selectAgencyRoundRobin(agencies, territory, excludeAgencyIds = []) {
    try {
      if (!agencies || agencies.length === 0) {
        throw new Error('No agencies provided for round-robin selection');
      }

      // If only one agency, return it
      if (agencies.length === 1) {
        return agencies[0];
      }

      // Get current distribution sequence for this territory
      // Check if lead_distribution_sequence table exists
      let sequences = [];
      try {
        const { data, error } = await supabase
          .from('lead_distribution_sequence')
          .select('*')
          .eq('territory', territory || 'default')
          .order('last_assigned_at', { ascending: true });

        if (!error && data) {
          sequences = data;
        }
      } catch (error) {
        // Table might not exist - that's okay, we'll use fallback
        console.log('lead_distribution_sequence table not found, using simple round-robin');
      }

      // Filter out excluded agencies from sequences
      const validSequences = sequences.filter(s => !excludeAgencyIds.includes(s.agency_id));
      
      // Create map of agency IDs to their last assignment time
      const sequenceMap = new Map(
        validSequences.map(s => [s.agency_id, s.last_assigned_at])
      );

      // Filter agencies to exclude those in excludeAgencyIds
      const availableAgencies = agencies.filter(agency => 
        !excludeAgencyIds.includes(agency.id)
      );

      if (availableAgencies.length === 0) {
        throw new Error('No agencies available after exclusions');
      }

      // Find agency that was assigned longest ago (or never assigned)
      let selectedAgency = availableAgencies[0];
      let oldestAssignment = sequenceMap.get(selectedAgency.id) || '1970-01-01';

      for (const agency of availableAgencies) {
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
    const assignmentData = {
      lead_id: leadId,
      agency_id: agencyId,
      assigned_at: new Date().toISOString(),
      assignment_method: 'auto_distribution',
      status: 'pending'
    };

    const { data: assignment, error } = await supabase
      .from('lead_assignments')
      .insert(assignmentData)
      .select()
      .single();

    if (error) throw error;

    // Update lead status
    await supabase
      .from('leads')
      .update({ 
        status: 'assigned',
        assigned_agency_id: agencyId,
        assigned_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
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
    try {
      const territoryKey = territory || 'default';
      
      // Check if sequence table exists
      const { data: existing, error: fetchError } = await supabase
        .from('lead_distribution_sequence')
        .select('*')
        .eq('agency_id', agencyId)
        .eq('territory', territoryKey)
        .single();

      if (fetchError && fetchError.code === '42P01') {
        // Table doesn't exist - skip sequence tracking
        return;
      }

      if (existing) {
        // Update existing sequence
        await supabase
          .from('lead_distribution_sequence')
          .update({
            sequence_number: (existing.sequence_number || 0) + 1,
            last_assigned_at: new Date().toISOString(),
            total_leads_assigned: (existing.total_leads_assigned || 0) + 1
          })
          .eq('id', existing.id);
      } else {
        // Create new sequence
        await supabase
          .from('lead_distribution_sequence')
          .insert({
            agency_id: agencyId,
            territory: territoryKey,
            sequence_number: 1,
            last_assigned_at: new Date().toISOString(),
            total_leads_assigned: 1
          });
      }
    } catch (error) {
      // Non-critical - log but don't fail
      console.warn('Error updating distribution sequence:', error.message);
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
    try {
      let query = supabase.from('lead_distribution_sequence').select('*');

      if (territory) {
        query = query.eq('territory', territory);
      }

      const { data: sequences, error } = await query;

      if (error && error.code === '42P01') {
        // Table doesn't exist
        return {
          total_agencies: 0,
          total_leads_distributed: 0,
          by_agency: []
        };
      }

      if (error) throw error;

      const stats = {
        total_agencies: sequences?.length || 0,
        total_leads_distributed: (sequences || []).reduce((sum, s) => sum + (s.total_leads_assigned || 0), 0),
        by_agency: (sequences || []).map(s => ({
          agency_id: s.agency_id,
          territory: s.territory,
          leads_assigned: s.total_leads_assigned || 0,
          last_assignment: s.last_assigned_at
        }))
      };

      return stats;
    } catch (error) {
      console.error('Error getting distribution stats:', error);
      return {
        total_agencies: 0,
        total_leads_distributed: 0,
        by_agency: []
      };
    }
  }
}

module.exports = new LeadDistributionService();
