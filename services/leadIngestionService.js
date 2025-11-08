/**
 * Lead Ingestion Service
 * Handles transformation, validation, and logging of leads from public portals
 */

const supabase = require('../config/supabaseClient');
const logger = require('../utils/logger');

let agencyIndex = 0; // Round-robin counter

class LeadIngestionService {
  /**
   * Transform incoming data to match unified_leads structure
   */
  transformData(payload, portal) {
    try {
      console.log('📥 Received Payload:', payload);

      const transformed = {
        portal_id: portal.id,
        portal_code: portal.portal_code || null,
        industry: portal.industry || 'non_healthcare',
        lead_name:
          payload.name ||
          payload.lead_name ||
          payload.full_name ||
          payload.contact_name ||
          'Unknown',
        email: payload.email || payload.email_address || null,
        phone_number: payload.phone || payload.phone_number || payload.contact || null,
        city: payload.city || null,
        state: payload.state || null,
        zipcode: payload.zipcode || payload.zip_code || null,
        budget_range: payload.budgetRange || payload.budget || null,
        property_type: payload.propertyType || payload.property_type || null,
        preferred_location: payload.preferredLocation || null,
        needs: payload.needs || payload.requirements || null,
        additional_details: payload.additionalDetails || null,
        source: portal.portal_name || 'external_portal',
        created_at: new Date().toISOString(),
        raw_payload: payload,
      };

      return transformed;
    } catch (error) {
      logger.error('Error transforming lead data:', error);
      throw new Error(`Failed to transform lead data: ${error.message}`);
    }
  }

  /**
   * Basic validation for incoming leads
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
      errors,
    };
  }

  /**
   * Round-robin agency selector
   */
  async getNextAgency() {
    try {
      const { data: agencies, error } = await supabase
        .from('agencies')
        .select('id, agency_name, status')
        .eq('status', 'ACTIVE')
        .order('created_date', { ascending: true });

      if (error) throw error;

      if (!agencies || agencies.length === 0) {
        logger.warn('⚠️ No active agencies found.');
        return null;
      }

      const agency = agencies[agencyIndex % agencies.length];
      console.log(`🏢 Round Robin → Assigned agency: ${agency.agency_name} (${agency.id})`);
      agencyIndex = (agencyIndex + 1) % agencies.length;
      return agency.id;
    } catch (error) {
      logger.error('❌ Error in getNextAgency:', error.message);
      return null;
    }
  }

  /**
   * Process full lead ingestion flow
   */
  async processLead(payload, portal) {
    try {
      // 1️⃣ Transform & validate
      const transformedData = this.transformData(payload, portal);
      const validation = this.validate(transformedData);
      if (!validation.valid) {
        return { success: false, message: 'Lead validation failed', errors: validation.errors };
      }

      // 2️⃣ Insert into unified_leads
      const { data: newLead, error: leadError } = await supabase
        .from('unified_leads')
        .insert([transformedData])
        .select()
        .single();

      if (leadError) {
        console.error('❌ Error creating lead:', leadError);
        throw new Error(`Failed to create lead: ${leadError.message}`);
      }

      console.log(`✅ Lead created successfully: ${newLead.lead_id}`);

      // 3️⃣ Get next agency (round-robin)
      const assignedAgencyId = await this.getNextAgency();

      // 4️⃣ Log in audit_logs
      const auditLog = {
        lead_id: newLead.lead_id, // text ID like LEAD-00001
        lead_data: newLead, // full lead JSON
        agency_id: assignedAgencyId || null,
        time_stamp: new Date().toISOString(),
        action_status: assignedAgencyId ? 'assigned' : 'unassigned',
      };

      console.log('🧾 Inserting into audit_logs:', auditLog);

      const { error: auditError } = await supabase
        .from('audit_logs')
        .insert([auditLog]);

      if (auditError) {
        console.error('⚠️ Failed to log in audit_logs:', auditError);
      } else {
        console.log(`📝 Audit log created for lead ${newLead.lead_id}`);
      }

      return {
        success: true,
        message: 'Lead processed successfully',
        lead_id: newLead.lead_id,
        assigned_agency: assignedAgencyId,
      };
    } catch (error) {
      logger.error('💥 Error processing lead:', error);
      return { success: false, message: error.message };
    }
  }
}

module.exports = new LeadIngestionService();
