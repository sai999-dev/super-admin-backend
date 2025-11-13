/**
 * Lead Ingestion Service
 * Handles transformation, validation, smart round-robin assignment,
 * and logging of leads from external portals.
 */

const supabase = require('../config/supabaseClient');
const logger = require('../utils/logger');

class LeadIngestionService {
  /** Transform portal payload to unified_leads schema */
  transformData(payload, portal) {
    const mappedIndustry = payload.industry || portal.industry || 'non_healthcare';
    const mappedZipcode = payload.zipcode || payload.zip_code || null;

    console.log(`🧩 Industry: ${mappedIndustry}, Zipcode: ${mappedZipcode}`);

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
        payload.phone || payload.phone_number || payload.contact || null,
      property_type: payload.propertyType || payload.property_type || null,
      budget_range: payload.budgetRange || payload.budget || null,
      preferred_location: payload.preferredLocation || null,
      zipcode: mappedZipcode,
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

  /**
   * Smart Round-Robin Agency Assignment
   * Matches by Industry + Zipcode, falls back to nearest zipcode if none match.
   */
  async getNextAgency(industry, leadZipcode) {
    try {
      // 1️⃣ Fetch all active agencies in the same industry
      const { data: agencies, error: agencyError } = await supabase
        .from('agencies')
        .select('id, agency_name, industry, zipcode, status')
        .eq('status', 'ACTIVE')
        .eq('industry', industry);

      if (agencyError) throw agencyError;
      if (!agencies?.length) {
        logger.warn(`⚠️ No active agencies for industry: ${industry}`);
        return null;
      }

      // 2️⃣ Filter same-zipcode agencies
      let eligibleAgencies = agencies.filter(a => a.zipcode === leadZipcode);

      // 3️⃣ If no exact zip match, find nearest zipcode numerically
      if (!eligibleAgencies.length && leadZipcode) {
        const leadZipNum = Number(leadZipcode);
        let minDistance = Infinity;
        let closestZip = null;

        for (const agency of agencies) {
          if (agency.zipcode) {
            const diff = Math.abs(Number(agency.zipcode) - leadZipNum);
            if (diff < minDistance) {
              minDistance = diff;
              closestZip = agency.zipcode;
            }
          }
        }

        eligibleAgencies = agencies.filter(a => a.zipcode === closestZip);
        console.log(`📍 No exact zip match. Using nearest zipcode ${closestZip} for industry ${industry}`);
      }

      if (!eligibleAgencies.length) {
        console.warn(`⚠️ No eligible agencies found for industry ${industry}`);
        return null;
      }

      // 4️⃣ Fetch or create round-robin state for this (industry + zipcode)
      const targetZip = eligibleAgencies[0].zipcode || 'unknown';
      let { data: state, error: stateError } = await supabase
        .from('round_robin_state')
        .select('id, last_agency_index')
        .eq('industry', industry)
        .eq('zipcode', targetZip)
        .single();

      if (stateError && stateError.code === 'PGRST116') {
        // Initialize if not found
        const { data: newState, error: insertError } = await supabase
          .from('round_robin_state')
          .insert([{ industry, zipcode: targetZip, last_agency_index: 0 }])
          .select()
          .single();
        if (insertError) throw insertError;
        state = newState;
      }

      // 5️⃣ Compute next index and update state
      let nextIndex = 0;
      if (state && typeof state.last_agency_index === 'number') {
        nextIndex = (state.last_agency_index + 1) % eligibleAgencies.length;
      }

      const selected = eligibleAgencies[nextIndex];
      const { error: updateError } = await supabase
        .from('round_robin_state')
        .update({ last_agency_index: nextIndex })
        .eq('industry', industry)
        .eq('zipcode', targetZip);

      if (updateError) {
        logger.error(`⚠️ Failed to update round_robin_state for ${industry}-${targetZip}:`, updateError.message);
      }

      console.log(`🏢 Assigned → ${selected.agency_name} (${selected.id}) [${industry}, ${targetZip}]`);
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

      // 3️⃣ Determine next agency (industry + zipcode based)
      const agencyId = await this.getNextAgency(transformed.industry, transformed.zipcode);

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
