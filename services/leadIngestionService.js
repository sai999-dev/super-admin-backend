/**
 * Lead Ingestion Service
 * Handles transformation, validation, industry + zipcode-based round robin assignment,
 * and logging of leads from external portals.
 */

const supabase = require('../config/supabaseClient');
const logger = require('../utils/logger');

// --- Utility function: calculate numeric distance between zipcodes ---
function calculateZipDistance(zip1, zip2) {
  if (!zip1 || !zip2) return Infinity;
  const num1 = parseInt(zip1.toString().replace(/\D/g, ''), 10);
  const num2 = parseInt(zip2.toString().replace(/\D/g, ''), 10);
  if (isNaN(num1) || isNaN(num2)) return Infinity;
  return Math.abs(num1 - num2);
}

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
      zipcode: payload.zipcode || payload.zip_code || payload.zip || null,
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

  /** Industry + zipcode-based Round-robin agency assignment */
  async getNextAgency(leadIndustry, leadZip) {
    try {
      // 1️⃣ Get all ACTIVE agencies in same industry
      const { data: agencies, error: agencyError } = await supabase
        .from('agencies')
        .select('id, agency_name, industry, zipcodes, status')
        .eq('status', 'ACTIVE');

      if (agencyError) throw agencyError;
      if (!agencies?.length) {
        logger.warn('⚠️ No active agencies available.');
        return null;
      }

      // Filter by matching industry
      const sameIndustryAgencies = agencies.filter(
        (a) =>
          a.industry &&
          a.industry.toLowerCase().trim() === leadIndustry.toLowerCase().trim()
      );

      let filteredAgencies = sameIndustryAgencies.length
        ? sameIndustryAgencies
        : agencies; // fallback to all

      // 2️⃣ If zipcode present, try to find the nearest one
      let selectedAgency = null;
      if (leadZip && filteredAgencies.length > 0) {
        let minDistance = Infinity;
        for (const agency of filteredAgencies) {
          if (!agency.zipcodes) continue;

          // agency.zipcodes may be a comma-separated list (e.g. "10001,10002,10003")
          const zipList = agency.zipcodes.split(',').map((z) => z.trim());
          for (const z of zipList) {
            const distance = calculateZipDistance(leadZip, z);
            if (distance < minDistance) {
              minDistance = distance;
              selectedAgency = agency;
            }
          }
        }

        if (selectedAgency) {
          console.log(
            `📍 Nearest agency found: ${selectedAgency.agency_name} (${selectedAgency.id}) for ZIP ${leadZip}`
          );
          return selectedAgency.id;
        }
      }

      // 3️⃣ If no zipcode match → use round-robin by industry
      const key = leadIndustry.toLowerCase().replace(/\s+/g, '_');
      const stateTable = 'round_robin_state'; // persistent state
      let { data: state, error: stateError } = await supabase
        .from(stateTable)
        .select('id, last_agency_index, industry_key')
        .eq('industry_key', key)
        .limit(1)
        .single();

      if (stateError && stateError.code === 'PGRST116') {
        const { data: newState, error: insertError } = await supabase
          .from(stateTable)
          .insert([{ industry_key: key, last_agency_index: 0 }])
          .select()
          .single();
        if (insertError) throw insertError;
        state = newState;
      }

      const currentIndex = state?.last_agency_index || 0;
      const nextIndex = (currentIndex + 1) % filteredAgencies.length;
      const selected = filteredAgencies[nextIndex];

      // Update round robin state
      await supabase
        .from(stateTable)
        .update({ last_agency_index: nextIndex })
        .eq('id', state?.id);

      console.log(
        `🏢 Assigned via Industry Round-Robin → ${selected.agency_name} (${selected.id})`
      );
      return selected.id;
    } catch (err) {
      logger.error('❌ getNextAgency error:', err.message);
      return null;
    }
  }

  /** Main lead ingestion workflow */
  async processLead(payload, portal) {
    try {
      // 1️⃣ Transform & validate
      const transformed = this.transformData(payload, portal);
      const validation = this.validate(transformed);
      if (!validation.valid) {
        return { success: false, message: 'Validation failed', errors: validation.errors };
      }

      // 2️⃣ Insert lead into unified_leads
      const { data: newLead, error: leadError } = await supabase
        .from('unified_leads')
        .insert([transformed])
        .select()
        .single();

      if (leadError) throw new Error(`Failed to insert lead: ${leadError.message}`);
      console.log(`✅ Unified lead created: ${newLead.lead_id || newLead.id}`);

      // 3️⃣ Find best agency (industry + zipcode)
      const agencyId = await this.getNextAgency(newLead.industry, newLead.zipcode);

      // 4️⃣ Insert into audit_logs
      const auditLog = {
        lead_id: newLead.lead_id || newLead.id,
        lead_data: newLead,
        agency_id: agencyId,
        time_stamp: new Date().toISOString(),
        action_status: agencyId ? 'assigned' : 'unassigned',
      };

      const { error: auditError } = await supabase.from('audit_logs').insert([auditLog]);
      if (auditError) logger.error('⚠️ Failed to insert audit log:', auditError);
      else console.log(`📝 Audit log created for ${newLead.lead_id || newLead.id}`);

      return {
        success: true,
        message: 'Lead processed successfully',
        lead_id: newLead.lead_id || newLead.id,
        assigned_agency: agencyId,
      };
    } catch (err) {
      logger.error('💥 processLead error:', err);
      return { success: false, message: err.message };
    }
  }
}

module.exports = new LeadIngestionService();
