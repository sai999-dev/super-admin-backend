/**
 * Lead Ingestion Service
 * Handles transformation and validation of leads from public portals
 */

const supabase = require('../config/supabaseClient');
const logger = require('../utils/logger');

class LeadIngestionService {
  constructor() {
    this.lastAssignedIndex = 0; // for round-robin tracking
  }

  /**
   * Transform portal-specific payload to standardized lead format
   * @param {Object} payload - Raw payload from portal
   * @param {Object} portal - Portal configuration
   * @returns {Object} - Transformed lead data
   */
  transformData(payload, portal) {
    try {
      console.log('📥 Received payload:', JSON.stringify(payload, null, 2));

      let leadName =
        payload.name ||
        payload.lead_name ||
        payload.full_name ||
        (payload.first_name ? `${payload.first_name} ${payload.last_name || ''}`.trim() : null) ||
        payload.contact_name ||
        payload.customer_name ||
        null;

      if (!leadName) {
        const serviceType = payload.service_type || payload.serviceType;
        const careNeed = payload.care_need || payload.careNeed || payload.needs;
        if (serviceType && careNeed) leadName = `${serviceType} - ${careNeed}`;
        else leadName = serviceType || careNeed || 'Unknown';
      }

      let email =
        payload.email ||
        payload.email_address ||
        payload.emailAddress ||
        payload.contact_email ||
        payload.customer_email ||
        null;

      if (!email && payload.contact && payload.contact.includes('@')) email = payload.contact;

      let phoneNumber =
        payload.phone ||
        payload.phone_number ||
        payload.phoneNumber ||
        payload.contact_phone ||
        payload.customer_phone ||
        payload.mobile ||
        payload.telephone ||
        null;

      if (!phoneNumber && payload.contact) {
        const contact = payload.contact.toString().trim();
        const digitsOnly = contact.replace(/\D/g, '');
        if (digitsOnly.length >= 7) phoneNumber = contact;
      }

      const city = payload.city || payload.location?.city || null;
      const state = payload.state || payload.location?.state || payload.state_code || null;
      const zipcode =
        payload.zipcode ||
        payload.zip_code ||
        payload.zipCode ||
        payload.postal_code ||
        payload.zip ||
        null;

      let industry = payload.industry || payload.industry_type || portal.industry || 'non_healthcare';
      if (industry.toLowerCase().includes('hospice')) industry = 'healthcare_hospice';
      else if (industry.toLowerCase().includes('home_health')) industry = 'healthcare_homehealth';
      else industry = 'non_healthcare';

      const transformed = {
        portal_id: portal.id,
        portal_code: portal.portal_code || null,
        industry,
        lead_name: leadName.trim(),
        email: email ? email.toLowerCase().trim() : null,
        phone_number: phoneNumber ? phoneNumber.toString().replace(/\D/g, '').slice(0, 20) : null,
        city: city ? city.trim() : null,
        state: state ? state.trim().toUpperCase().slice(0, 2) : null,
        zipcode: zipcode ? zipcode.toString().trim().slice(0, 10) : null,
        contact_email: email || null,
        contact_phone: phoneNumber || null,
        lead_data: {
          ...payload,
          source: payload.source || portal.portal_name || 'unknown',
          address: payload.address || payload.street_address || payload.full_address || null,
          submitted_at: new Date().toISOString(),
          transformed_at: new Date().toISOString()
        }
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
    if (!leadData.lead_name || leadData.lead_name.trim() === '') errors.push('Lead name is required');
    if (!leadData.portal_id) errors.push('Portal ID is required');
    if (!leadData.industry) errors.push('Industry is required');

    if (leadData.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(leadData.email)) errors.push('Invalid email format');
    }

    if (leadData.phone_number) {
      const phoneStr = leadData.phone_number.toString().trim();
      if (phoneStr === '') errors.push('Phone number cannot be empty if provided');
    }

    if (!leadData.lead_data || typeof leadData.lead_data !== 'object')
      errors.push('Lead data (lead_data) is required');

    return { valid: errors.length === 0, errors };
  }

  /**
   * Process complete lead ingestion flow
   */
  async processLead(payload, portal) {
    try {
      const transformedData = this.transformData(payload, portal);
      const validation = this.validate(transformedData);

      if (!validation.valid) {
        return { success: false, message: 'Lead validation failed', errors: validation.errors };
      }

      const duplicateCheck = await this.checkDuplicates(transformedData);
      if (duplicateCheck.isDuplicate) {
        return { success: false, message: 'Duplicate lead detected' };
      }

      const leadResult = await this.createLead(transformedData);

      return { success: true, lead_id: leadResult.lead_id, data: transformedData };
    } catch (error) {
      logger.error('Error processing lead:', error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Check for duplicate leads
   */
  async checkDuplicates(leadData) {
    try {
      if (leadData.email) {
        const { data: emailMatch } = await supabase
          .from('leads')
          .select('id')
          .eq('email', leadData.email.toLowerCase())
          .gte('created_at', new Date(Date.now() - 86400000).toISOString())
          .limit(1)
          .single();
        if (emailMatch) return { isDuplicate: true };
      }

      if (leadData.phone_number) {
        const normalized = leadData.phone_number.replace(/\D/g, '');
        const { data: phoneMatch } = await supabase
          .from('leads')
          .select('id')
          .gte('created_at', new Date(Date.now() - 86400000).toISOString())
          .limit(10);
        if (phoneMatch?.some(p => p.phone_number?.replace(/\D/g, '').endsWith(normalized.slice(-10))))
          return { isDuplicate: true };
      }

      return { isDuplicate: false };
    } catch (error) {
      logger.warn('Duplicate check error:', error.message);
      return { isDuplicate: false };
    }
  }

  /**
   * 🔁 Assign next agency in round-robin order
   */
  async assignAgencyRoundRobin() {
    try {
      const { data: agencies, error } = await supabase
        .from('agencies')
        .select('id')
        .eq('status', 'active')
        .eq('is_active', true)
        .order('created_at', { ascending: true });

      if (error) {
        logger.error('❌ Error fetching agencies:', error);
        throw error;
      }

      if (!agencies || agencies.length === 0) {
        logger.warn('⚠️ No active agencies found for round-robin assignment');
        return null;
      }

      const index = this.lastAssignedIndex % agencies.length;
      const selectedAgency = agencies[index];
      this.lastAssignedIndex = (this.lastAssignedIndex + 1) % agencies.length;

      logger.info(`🎯 Round-robin assigned agency ${selectedAgency.id} (${index + 1}/${agencies.length})`);
      return selectedAgency.id;
    } catch (err) {
      logger.error('❌ Error in assignAgencyRoundRobin:', err.message);
      return null;
    }
  }

  /**
   * Create lead, assign agency, and log in audit_logs
   */
  async createLead(leadData) {
    try {
      const { data: lead, error } = await supabase.from('leads').insert([leadData]).select().single();
      if (error) throw new Error(`Failed to create lead: ${error.message}`);

      logger.info(`✅ Lead created: ${lead.lead_id}`);

      // 🔁 Round-robin agency assignment
      const agency_id = await this.assignAgencyRoundRobin();

      // 🔄 Update lead with assigned agency_id
      if (agency_id) {
        const { error: updateError } = await supabase
          .from('leads')
          .update({ agency_id })
          .eq('lead_id', lead.lead_id);

        if (updateError) {
          logger.error(`❌ Failed to update lead ${lead.lead_id} with agency_id:`, updateError);
        } else {
          lead.agency_id = agency_id; // Update local object
          logger.info(`✅ Lead ${lead.lead_id} assigned to agency ${agency_id}`);
        }
      }

      // 📝 Log in audit_logs
      const auditLog = {
        lead_id: lead.lead_id,
        lead_data: lead,
        agency_id: agency_id || null,
        time_stamp: new Date().toISOString(),
        action_status: agency_id ? 'assigned_to_agency' : 'created_without_agency'
      };

      const { error: auditError } = await supabase.from('audit_logs').insert([auditLog]);
      if (auditError)
        logger.error(`⚠️ Failed to log audit for lead ${lead.lead_id}:`, auditError);
      else
        logger.info(`📝 Logged lead ${lead.lead_id} in audit_logs (agency: ${agency_id || 'none'})`);

      return lead;
    } catch (error) {
      logger.error('💥 Error in createLead():', error.message);
      throw error;
    }
  }
}

module.exports = new LeadIngestionService();
