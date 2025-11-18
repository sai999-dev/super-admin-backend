/**
 * Lead Ingestion Service
 * Handles transformation, validation, intelligent agency assignment, and logging.
 */

const supabase = require('../config/supabaseClient');
const logger = require('../utils/logger');
const sendLeadNotification = require("../services/sendLeadNotification");


class LeadIngestionService {
  /** Transform portal payload → unified_leads schema */
  transformData(payload, portal) {
    return {
      portal_id: portal.id,
      portal_code: portal.portal_code || null,
      industry: payload.industry || portal.industry || 'General',
      lead_name:
        payload.name ||
        payload.lead_name ||
        payload.full_name ||
        payload.contact_name ||
        'Unknown',
      email: payload.email || payload.email_address || null,
      phone: payload.phone || payload.phone_number || payload.contact || null,
      city: payload.city || null,
      state: payload.state || null,
      zipcode: payload.zipcode || payload.zip_code || null,
      budget_range: payload.budget_range || payload.budgetRange || null,
      property_type: payload.property_type || payload.propertyType || null,
      preferred_location: payload.preferredLocation || null,
      needs: payload.needs || payload.requirements || null,
      additional_details: payload.additional_details || payload.additionalDetails || null,
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
    if (!leadData.email && !leadData.phone)
      errors.push('Either email or phone number is required');
    return { valid: errors.length === 0, errors };
  }

  /** ✅ Smart agency assignment: industry + zipcode + round robin fallback */
  async getNextAgency(leadIndustry, leadZipcode) {
    try {
      console.log(`🔍 Finding agency for industry="${leadIndustry}" and zipcode="${leadZipcode}"`);

      // Step 1️⃣ - Fetch all active agencies with same industry
      const { data: agencies, error } = await supabase
        .from('agencies')
        .select('id, agency_name, industry, zipcodes, status')
        .eq('status', 'ACTIVE');

      if (error) throw error;

      if (!agencies?.length) {
        logger.warn('⚠️ No active agencies found.');
        return null;
      }

      // Step 2️⃣ - Filter by industry (case insensitive)
      let sameIndustry = agencies.filter(
        (a) => a.industry?.toLowerCase() === leadIndustry?.toLowerCase()
      );

      if (!sameIndustry.length) {
        logger.warn('⚠️ No agencies found with same industry — fallback to round robin.');
        return await this.roundRobinFallback(agencies);
      }

      // Step 3️⃣ - Try exact zipcode match (zipcodes stored as string arrays like '["75034"]')
      const exactZipMatches = sameIndustry.filter((agency) => {
        if (!agency.zipcodes) return false;
        try {
          const zips = JSON.parse(agency.zipcodes);
          return Array.isArray(zips) && zips.includes(leadZipcode);
        } catch {
          return false;
        }
      });

      if (exactZipMatches.length > 0) {
        console.log(
          `📍 Found ${exactZipMatches.length} exact zipcode matches → ${exactZipMatches[0].agency_name}`
        );
        return exactZipMatches[0].id;
      }

      // Step 4️⃣ - Find closest zipcode (numerically closest)
      const allWithZip = sameIndustry.filter((a) => a.zipcodes);
      let nearest = null;
      let minDiff = Infinity;

      if (leadZipcode && allWithZip.length > 0) {
        for (const agency of allWithZip) {
          try {
            const zips = JSON.parse(agency.zipcodes);
            for (const zip of zips) {
              const diff = Math.abs(parseInt(zip) - parseInt(leadZipcode));
              if (diff < minDiff) {
                minDiff = diff;
                nearest = agency;
              }
            }
          } catch (err) {
            console.warn(`⚠️ Invalid zipcode JSON for agency ${agency.agency_name}`);
          }
        }
      }

      if (nearest) {
        console.log(`📍 Nearest zipcode match → ${nearest.agency_name}`);
        return nearest.id;
      }

      // Step 5️⃣ - Fallback to round robin
      return await this.roundRobinFallback(sameIndustry);
    } catch (err) {
      logger.error('❌ getNextAgency error:', err.message);
      return null;
    }
  }

  /** ♻️ Round-robin fallback that persists state in DB */
  async roundRobinFallback(agencies) {
    try {
      // Ensure we have at least one active agency
      if (!agencies?.length) return null;

      // Get or create round_robin_state record
      let { data: state, error: stateError } = await supabase
        .from('round_robin_state')
        .select('id, last_agency_index')
        .limit(1)
        .maybeSingle();

      if (stateError && stateError.code !== 'PGRST116') throw stateError;

      if (!state) {
        const { data: newState, error: insertError } = await supabase
          .from('round_robin_state')
          .insert([{ last_agency_index: 0 }])
          .select()
          .single();
        if (insertError) throw insertError;
        state = newState;
      }

      // Compute next agency index
      const nextIndex =
        state.last_agency_index != null
          ? (state.last_agency_index + 1) % agencies.length
          : 0;

      // Update index in DB
      await supabase
        .from('round_robin_state')
        .update({ last_agency_index: nextIndex })
        .eq('id', state.id);

      const agency = agencies[nextIndex];
      console.log(`♻️ Round-robin fallback → ${agency.agency_name}`);
      return agency.id;
    } catch (err) {
      logger.error('⚠️ roundRobinFallback error:', err.message);
      return agencies[0]?.id || null;
    }
  }

  /** Main lead ingestion workflow */
  async processLead(payload, portal) {
    try {
      // 1️⃣ Transform + validate
      const transformed = this.transformData(payload, portal);
      const validation = this.validate(transformed);
      if (!validation.valid)
        return { success: false, message: 'Validation failed', errors: validation.errors };

      // 2️⃣ Insert lead into unified_leads
      const { data: newLead, error: leadError } = await supabase
        .from('unified_leads')
        .insert([transformed])
        .select('id, lead_id, industry, zipcode, lead_name')
        .single();

      if (leadError) throw new Error(`Failed to insert lead: ${leadError.message}`);
      console.log(`✅ Unified lead created: ${newLead.lead_id}`);
      console.log(`📦 Industry: ${newLead.industry}, Zipcode: ${newLead.zipcode}`);

      // 3️⃣ Assign agency
      const agencyId = await this.getNextAgency(newLead.industry, newLead.zipcode);

      // 4️⃣ Insert audit log
      const auditLog = {
        lead_id: newLead.lead_id || newLead.id,
        lead_data: newLead,
        agency_id: agencyId,
        time_stamp: new Date().toISOString(),
        action_status: agencyId ? 'assigned' : 'unassigned',
      };

      const { error: auditError } = await supabase.from('audit_logs').insert([auditLog]);
      if (auditError) logger.error('⚠️ Audit log insert failed:', auditError.message);
      else console.log(`📝 Audit log saved for ${newLead.lead_id}`);

      // 5️⃣ Send notification to agency
      if (agencyId) {
  await sendLeadNotification(agencyId, newLead.lead_name);
}


      return {
        success: true,
        lead_id: newLead.lead_id,
        agency_assigned: agencyId,
      };
    } catch (err) {
      logger.error('💥 processLead error:', err);
      return { success: false, message: err.message };
    }
  }
}

module.exports = new LeadIngestionService();
