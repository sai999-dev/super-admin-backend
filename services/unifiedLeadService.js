/**
 * Unified Lead Service
 * Handles creation and management of leads in the unified_leads table
 */

const supabase = require('../config/supabaseClient');
const schemaMappingService = require('./schemaMappingService');
const logger = require('../utils/logger');

class UnifiedLeadService {
  /**
   * Create a unified lead from portal data
   * @param {Object} payload - Raw payload from portal
   * @param {string} portalId - Portal identifier
   * @param {string} portalCode - Portal code (optional)
   * @param {Object} customMapping - Custom field mapping (optional)
   * @returns {Object} Created lead record
   */
  async createLead(payload, portalId, portalCode = null, customMapping = null) {
    try {
      // Normalize payload using schema mapping
      const normalized = schemaMappingService.normalizePayload(payload, portalId, customMapping);

      // Prepare data for insertion
      const leadData = {
        portal_id: portalId,
        portal_code: portalCode || null,
        name: normalized.name || null,
        phone: normalized.phone || null,
        email: normalized.email || null,
        city: normalized.city || null,
        state: normalized.state || null,
        zipcode: normalized.zipcode || null,
        country: normalized.country || null,
        extra_fields: normalized.extra_fields || {}
      };

      // Insert into unified_leads table
      const { data, error } = await supabase
        .from('unified_leads')
        .insert([leadData])
        .select()
        .single();

      if (error) {
        logger.error('Error creating unified lead:', error);
        throw new Error(`Failed to create unified lead: ${error.message}`);
      }

      logger.info('✅ Unified lead created successfully:', data.id);
      return {
        success: true,
        lead: data,
        id: data.id
      };
    } catch (error) {
      logger.error('Error in createLead:', error);
      throw error;
    }
  }

  /**
   * Get leads with filtering
   * @param {Object} filters - Filter criteria
   * @returns {Array} Array of leads
   */
  async getLeads(filters = {}) {
    try {
      let query = supabase
        .from('unified_leads')
        .select('*')
        .order('created_at', { ascending: false });

      // Apply filters
      if (filters.portal_id) {
        query = query.eq('portal_id', filters.portal_id);
      }
      if (filters.portal_code) {
        query = query.eq('portal_code', filters.portal_code);
      }
      if (filters.name) {
        query = query.ilike('name', `%${filters.name}%`);
      }
      if (filters.phone) {
        query = query.eq('phone', filters.phone);
      }
      if (filters.email) {
        query = query.eq('email', filters.email);
      }
      if (filters.city) {
        query = query.ilike('city', `%${filters.city}%`);
      }
      if (filters.state) {
        query = query.eq('state', filters.state);
      }
      if (filters.zipcode) {
        query = query.eq('zipcode', filters.zipcode);
      }
      if (filters.start_date) {
        query = query.gte('created_at', filters.start_date);
      }
      if (filters.end_date) {
        query = query.lte('created_at', filters.end_date);
      }

      // Limit results
      const limit = filters.limit || 100;
      query = query.limit(limit);

      const { data, error } = await query;

      if (error) {
        logger.error('Error fetching unified leads:', error);
        throw new Error(`Failed to fetch leads: ${error.message}`);
      }

      return {
        success: true,
        leads: data || [],
        count: data?.length || 0
      };
    } catch (error) {
      logger.error('Error in getLeads:', error);
      throw error;
    }
  }

  /**
   * Get lead by ID
   * @param {number} leadId - Lead ID
   * @returns {Object} Lead record
   */
  async getLeadById(leadId) {
    try {
      const { data, error } = await supabase
        .from('unified_leads')
        .select('*')
        .eq('id', leadId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new Error('Lead not found');
        }
        logger.error('Error fetching unified lead:', error);
        throw new Error(`Failed to fetch lead: ${error.message}`);
      }

      return {
        success: true,
        lead: data
      };
    } catch (error) {
      logger.error('Error in getLeadById:', error);
      throw error;
    }
  }

  /**
   * Query extra_fields using JSONB operators
   * @param {Object} extraFieldFilters - Filters for extra_fields
   * @returns {Array} Array of leads matching extra field criteria
   */
  async getLeadsByExtraFields(extraFieldFilters) {
    try {
      // Build JSONB filter query
      // Note: Supabase PostgREST has limited JSONB query support
      // For complex queries, you might need to use raw SQL
      let query = supabase
        .from('unified_leads')
        .select('*')
        .order('created_at', { ascending: false });

      // Apply JSONB filters
      // Example: extraFieldFilters = { budget: 5000, service_type: 'home_health' }
      for (const [key, value] of Object.entries(extraFieldFilters)) {
        // Use JSONB containment operator
        query = query.contains('extra_fields', { [key]: value });
      }

      const { data, error } = await query;

      if (error) {
        logger.error('Error querying leads by extra fields:', error);
        throw new Error(`Failed to query leads: ${error.message}`);
      }

      return {
        success: true,
        leads: data || [],
        count: data?.length || 0
      };
    } catch (error) {
      logger.error('Error in getLeadsByExtraFields:', error);
      throw error;
    }
  }

  /**
   * Update lead
   * @param {number} leadId - Lead ID
   * @param {Object} updates - Fields to update
   * @returns {Object} Updated lead record
   */
  async updateLead(leadId, updates) {
    try {
      // Merge extra_fields if updating
      if (updates.extra_fields && typeof updates.extra_fields === 'object') {
        // Get current lead to merge extra_fields
        const currentLead = await this.getLeadById(leadId);
        if (currentLead.success) {
          updates.extra_fields = {
            ...currentLead.lead.extra_fields,
            ...updates.extra_fields
          };
        }
      }

      updates.updated_at = new Date().toISOString();

      const { data, error } = await supabase
        .from('unified_leads')
        .update(updates)
        .eq('id', leadId)
        .select()
        .single();

      if (error) {
        logger.error('Error updating unified lead:', error);
        throw new Error(`Failed to update lead: ${error.message}`);
      }

      return {
        success: true,
        lead: data
      };
    } catch (error) {
      logger.error('Error in updateLead:', error);
      throw error;
    }
  }

  /**
   * Delete lead
   * @param {number} leadId - Lead ID
   * @returns {Object} Deletion result
   */
  async deleteLead(leadId) {
    try {
      const { error } = await supabase
        .from('unified_leads')
        .delete()
        .eq('id', leadId);

      if (error) {
        logger.error('Error deleting unified lead:', error);
        throw new Error(`Failed to delete lead: ${error.message}`);
      }

      return {
        success: true,
        message: 'Lead deleted successfully'
      };
    } catch (error) {
      logger.error('Error in deleteLead:', error);
      throw error;
    }
  }
}

module.exports = new UnifiedLeadService();

