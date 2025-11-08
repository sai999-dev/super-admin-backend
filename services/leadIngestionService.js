/**
 * Lead Ingestion Service
 * Handles transformation, validation, and round-robin agency assignment
 */

const supabase = require('../config/supabaseClient');
const logger = require('../utils/logger');

// Keep round-robin state in memory
let agencyIndex = 0;

class LeadIngestionService {
  /**
   * Transform portal-specific payload to standardized lead format
   */
  transformData(payload, portal) {
    try {
      const leadName =
        payload.name ||
        payload.lead_name ||
        payload.full_name ||
        (payload.first_name
          ? `${payload.first_name} ${payload.last_name || ''}`.trim()
          : null) ||
        payload.contact_name ||
        payload.customer_name ||
        'Unknown';

      const email =
        payload.email ||
        payload.email_address ||
        payload.contact_email ||
        payload.customer_email ||
        null;

      const phoneNumber =
        payload.phone ||
        payload.phone_number ||
        payload.phoneNumber ||
        payload.contact_phone ||
        payload.customer_phone ||
        payload.mobile ||
        payload.telephone ||
        null;

      const transformed = {
        portal_id: portal.id,
        lead_name: leadName,
        email: email ? email.toLowerCase() : null,
        phone_number: phoneNumber ? phoneNumber.toString() : null,
        property_type: payload.property_type || null,
        budget_range: payload.budget_range || null,
        preferred_location: payload.preferred_location || null,
        needs: payload.needs || null,
        created_at: new Date().toISOString(),
        raw_payload: payload
      };

      return transformed;
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

    if (!leadData.lead_name || leadData.lead_name.trim() === '') {
      errors.push('Lead name is required');
    }
    if (!leadData.portal_id) {
      errors.push('Portal ID is required');
    }
    if (!leadData.email && !leadData.phone_number) {
      errors.push('Either email or phone number is required');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Assign next active agency in round-robin order
   */
    async getNextAgency() {
    try {
      const { data: agencies, error } = await supabase
        .from('agencies')
        .select('id, agency_name, status')
        .eq('status', 'ACTIVE')
        .order('created_date', { ascending: true });

      if (error) throw error;

      console.log('🔍 Active agencies fetched:', agencies);

      if (!agencies || agencies.length === 0) {
        logger.warn('⚠️ No active agencies found');
        return null;
      }

      const agency = agencies[agencyIndex % agencies.length];
      console.log(`🏢 Round Robin Pick → index=${agencyIndex}, agency_id=${agency.id}, name=${agency.agency_name}`);
      agencyIndex = (agencyIndex + 1) % agencies.length;

      return agency.id;
    } catch (error) {
      logger.error('❌ Error getting next agency:', error.message);
      return null;
    }
  }


  /**
   * Create lead + insert into audit_logs
   */
  async createLead(leadData) {
    try {
      // 1️⃣ Create lead record
      const { data: lead, error: leadError } = await supabase
        .from('leads')
        .insert([leadData])
        .select()
        .single();

      if (leadError) {
        logger.error('❌ Error creating lead:', leadError);
        throw new Error(`Failed to create lead: ${leadError.message}`);
      }

      logger.info(`✅ Lead created successfully with lead_id: ${lead.lead_id}`);

      // 2️⃣ Get next agency in round-robin order
      const assignedAgencyId = await this.getNextAgency();

      // 3️⃣ Create audit log
      const auditLog = {
        lead_id: lead.lead_id, // Same as lead_id from leads table
        lead_data: lead, // Store full JSON of lead
        agency_id: assignedAgencyId, // Assigned agency UUID
        time_stamp: new Date().toISOString(),
        action_status: 'created'
      };

      const { error: auditError } = await supabase
        .from('audit_logs')
        .insert([auditLog]);

      if (auditError) {
        logger.error(
          `⚠️ Failed to insert audit log for lead ${lead.lead_id}:`,
          auditError
        );
      } else {
        logger.info(
          `📝 Lead ${lead.lead_id} successfully logged in audit_logs with agency ${assignedAgencyId}`
        );
      }

      return lead;
    } catch (error) {
      logger.error('💥 Unexpected error in createLead():', error.message);
      throw error;
    }
  }

  /**
   * Main lead processing pipeline
   */
  async processLead(payload, portal) {
    try {
      const transformedData = this.transformData(payload, portal);
      const validation = this.validate(transformedData);

      if (!validation.valid) {
        return {
          success: false,
          message: 'Lead validation failed',
          errors: validation.errors
        };
      }

      const leadResult = await this.createLead(transformedData);

      return {
        success: true,
        lead_id: leadResult.lead_id,
        data: transformedData
      };
    } catch (error) {
      logger.error('Error processing lead:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }
}

module.exports = new LeadIngestionService();
