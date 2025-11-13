/**
 * Lead Ingestion Service
 * Handles transformation, validation, industry + zipcode–based round-robin assignment,
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
      name:
        payload.name ||
        payload.lead_name ||
        payload.full_name ||
        payload.contact_name ||
        'Unknown',
      email: payload.email || payload.email_address || null,
      phone:
        payload.phone ||
        payload.phone_number ||
        payload.contact ||
        null,
      city: payload.city || null,
      state: payload.state || null,
      zipcode: payload.zipcode || payload.zip_code || null,
      country: payload.country || null,
      created_at: new Date().toISOString(),
      raw_payload: payload,
    };
  }

  /** Basic validation */
  validate(leadData) {
    const errors = [];
    if (!leadData.name?.trim()) errors.push('Lead name is required');
    if (!leadData.portal_id) errors.push('Portal ID is required');
    if (!leadData.email && !leadData.phone)
      errors.push('Either email or phone number is required');
    return { valid: errors.length === 0, errors };
  }

  /**
   * Industry + Zipcode–based Round-robin agency assignment
   */
  /** Round-robin agency assignment with industry + zipcode logic */
async getNextAgency(leadIndustry, leadZip) {
  try {
    console.log(`🔍 Finding agency for industry="${leadIndustry}" and zipcode="${leadZip}"`);

    // 1️⃣ Fetch all active agencies
    const { data: agencies, error: agencyError } = await supabase
      .from('agencies')
      .select('id, agency_name, industry, zipcodes, status')
      .eq('status', 'ACTIVE');

    if (agencyError) throw agencyError;
    if (!agencies?.length) {
      logger.warn('⚠️ No active agencies available.');
      return null;
    }

    const safeLeadIndustry = (leadIndustry || '').toLowerCase().trim();

    // 2️⃣ Filter agencies by industry
    const industryAgencies = agencies.filter(
      (a) => a.industry && a.industry.toLowerCase().trim() === safeLeadIndustry
    );

    const filteredAgencies = industryAgencies.length ? industryAgencies : agencies;
    console.log(`🧩 Found ${filteredAgencies.length} agencies for "${safeLeadIndustry}"`);

    // 3️⃣ Try to find nearest zipcode match (works for JSON-like arrays too)
    let selectedAgency = null;
    if (leadZip) {
      let minDistance = Infinity;
      for (const agency of filteredAgencies) {
        if (!agency.zipcodes) continue;

        let zipList = [];
        try {
          // Parse JSON-style text like ["75034","75068"]
          zipList = JSON.parse(agency.zipcodes);
        } catch {
          // Fallback: maybe plain text, split by comma
          zipList = agency.zipcodes.split(',').map(z => z.replace(/[\[\]"]/g, '').trim());
        }

        for (const z of zipList) {
          const distance = Math.abs(parseInt(leadZip) - parseInt(z));
          if (!isNaN(distance) && distance < minDistance) {
            minDistance = distance;
            selectedAgency = agency;
          }
        }
      }

      if (selectedAgency) {
        console.log(`📍 ZIP match → ${selectedAgency.agency_name} (${selectedAgency.id})`);
        return selectedAgency.id;
      }
    }

    // 4️⃣ If no ZIP match, do round robin by industry
    const key = safeLeadIndustry || 'general';
    let { data: state, error: stateError } = await supabase
      .from('round_robin_state')
      .select('id, last_agency_index, industry_key')
      .eq('industry_key', key)
      .maybeSingle();

    if (stateError) throw stateError;

    let lastIndex = state?.last_agency_index ?? -1;
    const nextIndex = (lastIndex + 1) % filteredAgencies.length;
    const selected = filteredAgencies[nextIndex];

    if (state) {
      await supabase
        .from('round_robin_state')
        .update({ last_agency_index: nextIndex })
        .eq('id', state.id);
    } else {
      await supabase
        .from('round_robin_state')
        .insert([{ industry_key: key, last_agency_index: nextIndex }]);
    }

    console.log(`🏢 Round Robin → Assigned ${selected.agency_name} (${selected.id})`);
    return selected.id;
  } catch (err) {
    logger.error('❌ getNextAgency error:', err.message);
    return null;
  }
}


  /** Main lead ingestion workflow */
  async processLead(payload, portal) {
    try {
      // 1️⃣ Transform + Validate
      const transformed = this.transformData(payload, portal);
      const validation = this.validate(transformed);
      if (!validation.valid) {
        return { success: false, message: 'Validation failed', errors: validation.errors };
      }

      // 2️⃣ Save to unified_leads
      const { data: newLead, error: leadError } = await supabase
        .from('unified_leads')
        .insert([transformed])
        .select()
        .single();

      if (leadError) throw new Error(`Failed to insert lead: ${leadError.message}`);
      console.log(`✅ Unified lead created: ${newLead.lead_id || newLead.id}`);

      // 3️⃣ Assign agency (industry + zipcode–based)
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
