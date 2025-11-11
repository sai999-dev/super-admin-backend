/**
 * Lead Ingestion Service
 * Handles transformation, validation, round-robin assignment,
 * and logging of leads from external portals.
 */

const supabase = require('../config/supabaseClient');
const logger = require('../utils/logger');

class LeadIngestionService {
  /** Transform portal payload to unified_leads schema */
  transformData(payload, portal) {
    const mappedIndustry = payload.industry || portal.industry || 'non_healthcare';

    console.log(`🧩 Industry mapped as → ${mappedIndustry}`);

    return {
      portal_id: portal.id,
      portal_code: portal.portal_code || null,
      industry: mappedIndustry,
      lead_name:
        payload.name ||
        payload.lead_name ||
        payload.full_name ||
        payload.contact_name ||
        'Unknown',
      email: payload.email || payload.email_address || null,
      phone_number:
        payload.phone ||
        payload.phone_number ||
        payload.contact ||
        null,
      property_type: payload.propertyType || payload.property_type || null,
      budget_range: payload.budgetRange || payload.budget || null,
      preferred_location: payload.preferredLocation || null,
      needs: payload.needs || payload.requirements || null,
      additional_details: payload.additionalDetails || null,
      source: portal.portal_name || 'external_portal',
      created_at: new Date().toISOString(),
      raw_payload: payload,
    };
  }

  /** Basic validation */
  validate(leadData) {
    const errors = [];
    if (!leadData.lead_name?.trim()) errors.push('Lead name is required');
    if (!leadData.portal_id) errors.push('Portal ID is required');
    if (!leadData.email && !leadData.phone_number)
      errors.push('Either email or phone number is required');
    return { valid: errors.length === 0, errors };
  }

  /** Round-robin agency assignment persisted in DB */
  async getNextAgency() {
    try {
      const { data: agencies, error: agencyError } = await supabase
        .from('agencies')
        .select('id, agency_name')
        .eq('status', 'ACTIVE')
        .order('created_date', { ascending: true });

      if (agencyError) throw agencyError;
      if (!agencies?.length) {
        logger.warn('⚠️ No active agencies available.');
        return null;
      }

      // Ensure round_robin_state table exists
      let { data: state, error: stateError } = await supabase
        .from('round_robin_state')
        .select('id, last_agency_index')
        .limit(1)
        .single();

      if (stateError && stateError.code === 'PGRST116') {
        // Table empty, insert default row and fetch it
        const { data: newState, error: insertError } = await supabase
          .from('round_robin_state')
          .insert([{ last_agency_index: 0 }])
          .select()
          .single();

        if (insertError) throw insertError;
        state = newState;
      }

      let nextIndex = 0;
      if (state && typeof state.last_agency_index === 'number') {
        nextIndex = (state.last_agency_index + 1) % agencies.length;
      }

      const selected = agencies[nextIndex];
      const { error: updateError } = await supabase
        .from('round_robin_state')
        .update({ last_agency_index: nextIndex })
        .eq('id', state?.id || 1);

      if (updateError) {
        logger.error('⚠️ Failed to update round_robin_state:', updateError.message);
      }

      console.log(`🏢 Assigned via Round-Robin → ${selected.agency_name} (${selected.id})`);
      return selected.id;
    } catch (err) {
      logger.error('❌ getNextAgency error:', err.message);
      return null;
    }
  }

  /** Main lead ingestion workflow */
  async processLead(payload, portal) {
    try {
      // 1️⃣ Transform and validate
      const transformed = this.transformData(payload, portal);
      const validation = this.validate(transformed);
      if (!validation.valid) {
        return { success: false, message: 'Validation failed', errors: validation.errors };
      }

      // 2️⃣ Insert into unified_leads
      const { data: newLead, error: leadError } = await supabase
        .from('unified_leads')
        .insert([transformed])
        .select()
        .single();

      if (leadError) throw new Error(`Failed to insert lead: ${leadError.message}`);
      console.log(`✅ Lead stored → ${newLead.lead_id || newLead.id}`);

      // 3️⃣ Determine next agency
      const agencyId = await this.getNextAgency();

      // 4️⃣ Insert into audit_logs
      const auditLog = {
        lead_id: newLead.lead_id || newLead.id,
        lead_data: newLead,
        agency_id: agencyId,
        time_stamp: new Date().toISOString(),
        action_status: agencyId ? 'assigned' : 'unassigned',
      };

      const { error: auditError } = await supabase.from('audit_logs').insert([auditLog]);
      if (auditError) logger.error('⚠️ Audit log insert failed:', auditError);
      else console.log(`📝 Audit log recorded for ${newLead.lead_id || newLead.id}`);

      return {
        success: true,
        message: 'Lead processed successfully',
        lead_id: newLead.lead_id || newLead.id,
        agency_assigned: agencyId,
      };
    } catch (err) {
      logger.error('💥 processLead error:', err);
      return { success: false, message: err.message };
    }
  }
}

module.exports = new LeadIngestionService();
