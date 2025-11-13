/**
 * Lead Ingestion Service
 * Handles transformation, validation, and intelligent agency assignment
 */

const supabase = require('../config/supabaseClient');
const logger = require('../utils/logger');

// Helper: Compute numeric distance between zipcodes
function zipDistance(zip1, zip2) {
  try {
    const z1 = parseInt(zip1);
    const z2 = parseInt(zip2);
    if (isNaN(z1) || isNaN(z2)) return Number.MAX_SAFE_INTEGER;
    return Math.abs(z1 - z2);
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

class LeadIngestionService {
  /** Transform portal payload to unified_leads schema */
  transformData(payload, portal) {
    return {
      portal_id: portal.id,
      portal_code: portal.portal_code || null,
      industry: payload.industry || portal.industry || 'non_healthcare',
      lead_name:
        payload.name ||
        payload.lead_name ||
        payload.full_name ||
        payload.contact_name ||
        'Unknown',
      email: payload.email || payload.email_address || null,
      phone: payload.phone || payload.phone_number || payload.contact || null,
      phone_number:
        payload.phone || payload.phone_number || payload.contact || null,
      property_type: payload.property_type || payload.propertyType || null,
      budget_range: payload.budget_range || payload.budgetRange || null,
      city: payload.city || null,
      state: payload.state || null,
      zipcode: payload.zipcode || payload.zip_code || null,
      needs: payload.needs || payload.requirements || null,
      additional_details: payload.additional_details || null,
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

  /** Intelligent agency assignment */
  async getNextAgency(leadIndustry, leadZip) {
    try {
      console.log(`🔍 Finding agency for industry="${leadIndustry}" and zipcode="${leadZip}"`);

      const { data: agencies, error } = await supabase
        .from('agencies')
        .select('id, agency_name, industry, zipcodes, status')
        .eq('status', 'ACTIVE');

      if (error) throw error;
      if (!agencies?.length) {
        logger.warn('⚠️ No active agencies found.');
        return null;
      }

      // Filter agencies by same industry
      const sameIndustryAgencies = agencies.filter(
        (a) =>
          a.industry &&
          leadIndustry &&
          a.industry.toLowerCase() === leadIndustry.toLowerCase()
      );

      if (!sameIndustryAgencies.length) {
        console.log('⚠️ No agencies found with same industry — fallback to round robin.');
        return this.roundRobinFallback(agencies);
      }

      // 1️⃣ Try exact zipcode match
      let matchingAgency = null;
      if (leadZip) {
        matchingAgency = sameIndustryAgencies.find((agency) => {
          if (!agency.zipcodes) return false;
          try {
            const zips = JSON.parse(agency.zipcodes);
            return zips.includes(leadZip);
          } catch {
            return false;
          }
        });
      }

      // 2️⃣ If no exact match, find nearest zipcode
      if (!matchingAgency && leadZip) {
        let closestAgency = null;
        let minDistance = Number.MAX_SAFE_INTEGER;

        for (const agency of sameIndustryAgencies) {
          if (!agency.zipcodes) continue;
          try {
            const zips = JSON.parse(agency.zipcodes);
            for (const zip of zips) {
              const dist = zipDistance(leadZip, zip);
              if (dist < minDistance) {
                minDistance = dist;
                closestAgency = agency;
              }
            }
          } catch {
            continue;
          }
        }

        if (closestAgency) {
          console.log(`📍 Nearest zipcode match found → ${closestAgency.agency_name}`);
          matchingAgency = closestAgency;
        }
      }

      // 3️⃣ Fallback to round robin within same industry
      if (!matchingAgency) {
        console.log('♻️ No zipcode match — using round-robin within same industry.');
        return this.roundRobinFallback(sameIndustryAgencies);
      }

      console.log(`🏢 Assigned agency → ${matchingAgency.agency_name} (${matchingAgency.id})`);
      return matchingAgency.id;
    } catch (err) {
      logger.error('❌ getNextAgency error:', err.message);
      return null;
    }
  }

  /** Round-robin fallback assignment (stored in DB) */
  async roundRobinFallback(agencies) {
    try {
      const { data: state } = await supabase
        .from('round_robin_state')
        .select('id, last_agency_index')
        .limit(1)
        .single();

      let nextIndex = 0;
      if (state && typeof state.last_agency_index === 'number') {
        nextIndex = (state.last_agency_index + 1) % agencies.length;
        await supabase
          .from('round_robin_state')
          .update({ last_agency_index: nextIndex })
          .eq('id', state.id);
      } else {
        await supabase.from('round_robin_state').insert([{ last_agency_index: 0 }]);
      }

      const agency = agencies[nextIndex];
      console.log(`♻️ Round-robin fallback → ${agency.agency_name}`);
      return agency.id;
    } catch (error) {
      logger.error('⚠️ Round-robin fallback failed:', error.message);
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
        .select()
        .single();

      if (leadError) throw new Error(`Failed to insert lead: ${leadError.message}`);
      console.log(`✅ Unified lead created: ${newLead.lead_id || newLead.id}`);

      // 3️⃣ Assign agency intelligently
      const agencyId = await this.getNextAgency(newLead.industry, newLead.zipcode);

      // 4️⃣ Log to audit_logs
      const auditLog = {
        lead_id: newLead.lead_id || newLead.id,
        lead_data: newLead,
        agency_id: agencyId,
        time_stamp: new Date().toISOString(),
        action_status: agencyId ? 'assigned' : 'unassigned',
      };

      const { error: auditError } = await supabase.from('audit_logs').insert([auditLog]);
      if (auditError) logger.error('⚠️ Failed to insert audit log:', auditError.message);
      else console.log(`📝 Audit log created for ${newLead.lead_id || newLead.id}`);

      return {
        success: true,
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
