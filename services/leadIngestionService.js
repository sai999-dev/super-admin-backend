/**
 * Lead Ingestion Service
 * Handles transformation, validation, creation, audit logging, and agency assignment
 */

const supabase = require('../config/supabaseClient');
const logger = require('../utils/logger');

class LeadIngestionService {
  constructor() {
    this.lastAssignedIndex = 0; // Round-robin counter
  }

  /**
   * Transform portal-specific payload to standardized lead format
   */
  transformData(payload, portal) {
    try {
      return {
        portal_id: portal.id,
        lead_name: payload.name || 'Unknown',
        email: payload.email || null,
        phone_number: payload.phone || payload.contact || null,
        property_type: payload.propertyType || null,
        budget_range: payload.budgetRange || null,
        preferred_location: payload.preferredLocation || null,
        timeline: payload.timeline || null,
        needs: payload.needs || null,
        additional_details: payload.additionalDetails || null,
        source: portal.portal_name || 'external_portal',
        status: 'pending', // must match check constraint
        created_at: new Date().toISOString(),
        raw_payload: payload
      };
    } catch (error) {
      logger.error('Error transforming lead data:', error);
      throw new Error(`Failed to transform lead data: ${error.message}`);
    }
  }

  /**
   * Validate lead data
   */
  validate(leadData) {
    const errors = [];

    if (!leadData.lead_name?.trim()) errors.push('Lead name is required');
    if (!leadData.portal_id) errors.push('Portal ID is required');
    if (!leadData.email && !leadData.phone_number)
      errors.push('Either email or phone number is required');

    if (leadData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(leadData.email))
      errors.push('Invalid email format');
    if (leadData.phone_number && !/^[\d\s\-\(\)\+]+$/.test(leadData.phone_number))
      errors.push('Invalid phone number format');
    if (!leadData.needs?.trim()) errors.push('Needs field is required');

    return { valid: errors.length === 0, errors };
  }

  /**
   * Full lead processing flow: transform → validate → create → assign → audit
   */
  async processLead(payload, portal) {
    try {
      // Step 1: Transform
      const transformedData = this.transformData(payload, portal);

      // Step 2: Validate
      const validation = this.validate(transformedData);
      if (!validation.valid) {
        return { success: false, message: 'Lead validation failed', errors: validation.errors };
      }

      // Step 3: Check for duplicates
      const duplicateCheck = await this.checkDuplicates(transformedData);
      if (duplicateCheck.isDuplicate) {
        logger.warn(`Duplicate lead detected: ${duplicateCheck.reason}`);
        return { success: false, message: 'Duplicate lead detected' };
      }

      // Step 4: Create lead
      const lead = await this.createLead(transformedData);
      const lead_id = lead.lead_id; // e.g. "LEAD-00001"

      // Step 5: Assign agency (round robin)
      const assignedAgency = await this.assignAgencyRoundRobin();

      // Step 6: Create audit log entry
      await this.createAuditLog({
        lead_id,
        lead_data: lead,
        agency_id: assignedAgency ? assignedAgency.id : null,
        action_status: 'lead_created'
      });

      return {
        success: true,
        message: 'Lead created and logged successfully',
        lead_id,
        assigned_agency: assignedAgency
      };
    } catch (error) {
      logger.error('Error processing lead:', error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Duplicate check by email/phone (last 24 hours)
   */
  async checkDuplicates(leadData) {
    try {
      // Email check
      if (leadData.email) {
        const { data } = await supabase
          .from('leads')
          .select('id')
          .eq('email', leadData.email)
          .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
          .limit(1)
          .single();
        if (data) return { isDuplicate: true, reason: 'Email duplicate' };
      }

      // Phone check
      if (leadData.phone_number) {
        const normalized = leadData.phone_number.replace(/\D/g, '');
        const { data: matches } = await supabase
          .from('leads')
          .select('phone_number')
          .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

        if (
          matches?.some(
            (m) =>
              (m.phone_number || '').replace(/\D/g, '').slice(-10) === normalized.slice(-10)
          )
        )
          return { isDuplicate: true, reason: 'Phone duplicate' };
      }

      return { isDuplicate: false };
    } catch (error) {
      logger.warn('Error checking duplicates:', error.message);
      return { isDuplicate: false };
    }
  }

  /**
   * Create lead in Supabase
   */
  async createLead(leadData) {
    const { data: lead, error } = await supabase
      .from('leads')
      .insert([leadData])
      .select()
      .single();

    if (error) throw new Error(`Failed to create lead: ${error.message}`);
    logger.info(`✅ Lead created: ${lead.lead_id}`);
    return lead;
  }

  /**
   * Round-robin agency assignment (assign each lead to next ACTIVE agency)
   */
  async assignAgencyRoundRobin() {
    try {
      const { data: agencies, error } = await supabase
        .from('agencies')
        .select('id')
        .eq('status', 'ACTIVE')
        .order('created_date', { ascending: true });

      if (error || !agencies?.length) {
        logger.warn('⚠️ No active agencies found for assignment.');
        return null;
      }

      const index = this.lastAssignedIndex % agencies.length;
      const agency = agencies[index];
      this.lastAssignedIndex = (this.lastAssignedIndex + 1) % agencies.length;

      logger.info(`🎯 Lead assigned to agency ID: ${agency.id}`);
      return agency;
    } catch (error) {
      logger.error('Error during round-robin assignment:', error.message);
      return null;
    }
  }

  /**
   * Log lead creation in audit_logs (with same lead_id)
   */
  async createAuditLog({ lead_id, lead_data, agency_id, action_status }) {
    try {
      const { error } = await supabase.from('audit_logs').insert([
        {
          lead_id, // same ID as in leads table (LEAD-00001)
          lead_data,
          agency_id,
          time_stamp: new Date().toISOString(),
          action_status
        }
      ]);

      if (error) logger.error(`Failed to log lead ${lead_id}: ${error.message}`);
      else logger.info(`📝 Audit log created for lead ${lead_id}`);
    } catch (error) {
      logger.error('Error creating audit log:', error.message);
    }
  }
}

module.exports = new LeadIngestionService();
