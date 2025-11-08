const supabase = require('../config/supabaseClient');
const logger = require('../utils/logger');

class LeadIngestionService {
  /**
   * Transform portal-specific payload to standardized lead format
   */
  transformData(payload, portal) {
    try {
      const transformed = {
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
        status: 'pending',
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
   * Validate transformed lead data
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
   * Main process flow
   */
  async processLead(payload, portal) {
    try {
      const transformedData = this.transformData(payload, portal);
      const validation = this.validate(transformedData);

      if (!validation.valid) {
        return {
          success: false,
          message: 'Lead validation failed',
          errors: validation.errors,
          data: transformedData
        };
      }

      const duplicateCheck = await this.checkDuplicates(transformedData);
      if (duplicateCheck.isDuplicate) {
        logger.warn(`Duplicate lead detected: ${duplicateCheck.reason}`);
        return {
          success: false,
          message: 'Duplicate lead detected',
          duplicate_of: duplicateCheck.duplicateId,
          data: transformedData
        };
      }

      // Create lead and assign agency
      const leadResult = await this.createLead(transformedData);
      return {
        success: true,
        lead_id: leadResult.lead_id,
        data: leadResult
      };
    } catch (error) {
      logger.error('Error processing lead:', error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Check duplicates by email/phone (last 24h)
   */
  async checkDuplicates(leadData) {
    try {
      if (leadData.email) {
        const { data } = await supabase
          .from('leads')
          .select('id')
          .eq('email', leadData.email)
          .gte('created_at', new Date(Date.now() - 86400000).toISOString())
          .limit(1)
          .maybeSingle();
        if (data) return { isDuplicate: true, duplicateId: data.id, reason: 'Email duplicate' };
      }

      if (leadData.phone_number) {
        const normalized = leadData.phone_number.replace(/\D/g, '');
        const { data } = await supabase
          .from('leads')
          .select('id, phone_number')
          .gte('created_at', new Date(Date.now() - 86400000).toISOString());
        if (data && data.some(d => (d.phone_number || '').replace(/\D/g, '').endsWith(normalized.slice(-10))))
          return { isDuplicate: true, reason: 'Phone duplicate' };
      }

      return { isDuplicate: false };
    } catch (err) {
      logger.warn('Duplicate check failed:', err.message);
      return { isDuplicate: false };
    }
  }

  /**
   * --- Persistent Round-Robin Assignment ---
   * Assigns next ACTIVE agency, remembers last used one in DB.
   */
  async assignAgencyRoundRobin() {
    try {
      // 1️⃣ Get all active agencies
      const { data: agencies, error: agenciesError } = await supabase
        .from('agencies')
        .select('id')
        .eq('status', 'ACTIVE')
        .order('created_date', { ascending: true });

      if (agenciesError) throw agenciesError;
      if (!agencies || agencies.length === 0) {
        logger.warn('⚠️ No active agencies found for round-robin.');
        return null;
      }

      // 2️⃣ Fetch last assigned agency
      const { data: state } = await supabase
        .from('agency_assignment_state')
        .select('last_assigned_agency')
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();

      let nextIndex = 0;
      if (state && state.last_assigned_agency) {
        const lastIndex = agencies.findIndex(a => a.id === state.last_assigned_agency);
        nextIndex = (lastIndex + 1) % agencies.length;
      }

      const selectedAgency = agencies[nextIndex];

      // 3️⃣ Update state in DB
      const { error: updateError } = await supabase
        .from('agency_assignment_state')
        .upsert(
          { id: 1, last_assigned_agency: selectedAgency.id, updated_at: new Date().toISOString() },
          { onConflict: 'id' }
        );

      if (updateError) throw updateError;

      logger.info(`🎯 Assigned agency (round-robin): ${selectedAgency.id}`);
      return selectedAgency.id;
    } catch (err) {
      logger.error('❌ Error in round-robin assignment:', err.message);
      return null;
    }
  }

  /**
   * Create lead → assign agency → log in audit_logs
   */
  async createLead(leadData) {
    try {
      // 1️⃣ Insert new lead
      const { data: lead, error } = await supabase
        .from('leads')
        .insert([leadData])
        .select()
        .single();

      if (error) throw error;

      logger.info(`✅ Lead created: ${lead.lead_id}`);

      // 2️⃣ Assign agency (round-robin)
      const agency_id = await this.assignAgencyRoundRobin();

      // 3️⃣ Save in audit_logs
      const { error: auditError } = await supabase.from('audit_logs').insert([
        {
          lead_id: lead.lead_id,
          lead_data: lead,
          agency_id: agency_id || null,
          time_stamp: new Date().toISOString(),
          action_status: agency_id ? 'assigned_to_agency' : 'created_without_agency'
        }
      ]);

      if (auditError)
        logger.error(`⚠️ Failed to insert audit log for lead ${lead.lead_id}:`, auditError);
      else
        logger.info(
          `📝 Lead ${lead.lead_id} logged in audit_logs (agency: ${agency_id || 'none'})`
        );

      return { ...lead, agency_id };
    } catch (error) {
      logger.error('💥 createLead() failed:', error.message);
      throw error;
    }
  }
}

module.exports = new LeadIngestionService();
