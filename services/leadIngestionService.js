/**
 * Lead Ingestion Service
 * Handles transformation and validation of leads from public portals
 */

const supabase = require('../config/supabaseClient');
const logger = require('../utils/logger');

class LeadIngestionService {
  /**
   * Transform portal-specific payload to standardized lead format
   * @param {Object} payload - Raw payload from portal
   * @param {Object} portal - Portal configuration
   * @returns {Object} - Transformed lead data
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
        status: 'pending', // must match your leads_status_check constraint
        created_at: new Date().toISOString(),
        raw_payload: payload // store original data
      };

      return transformed;
    } catch (error) {
      logger.error('Error transforming lead data:', error);
      throw new Error(`Failed to transform lead data: ${error.message}`);
    }
  }

  /**
   * Validate transformed lead data
   * @param {Object} leadData
   * @returns {Object}
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

    if (leadData.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(leadData.email)) {
        errors.push('Invalid email format');
      }
    }

    if (leadData.phone_number) {
      const phoneRegex = /^[\d\s\-\(\)\+]+$/;
      if (!phoneRegex.test(leadData.phone_number)) {
        errors.push('Invalid phone number format');
      }
    }

    if (!leadData.needs || leadData.needs.trim() === '') {
      errors.push('Needs field is required');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Process complete lead ingestion flow
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

      const leadResult = await this.createLead(transformedData);

      return {
        success: true,
        lead_id: leadResult.id,
        data: transformedData
      };
    } catch (error) {
      logger.error('Error processing lead:', error);
      return {
        success: false,
        message: error.message,
        error: error
      };
    }
  }

  /**
   * Check for duplicate leads (email or phone in last 24h)
   */
  async checkDuplicates(leadData) {
    try {
      if (leadData.email) {
        const { data: emailMatch } = await supabase
          .from('leads')
          .select('id, created_at')
          .eq('email', leadData.email.toLowerCase())
          .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
          .limit(1)
          .single();

        if (emailMatch) {
          return {
            isDuplicate: true,
            duplicateId: emailMatch.id,
            reason: 'Email already exists in last 24 hours'
          };
        }
      }

      if (leadData.phone_number) {
        const normalizedPhone = leadData.phone_number.replace(/\D/g, '');
        if (normalizedPhone.length >= 10) {
          const { data: phoneMatches } = await supabase
            .from('leads')
            .select('id, phone_number, created_at')
            .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
            .limit(10);

          if (phoneMatches) {
            for (const match of phoneMatches) {
              const matchNormalized = (match.phone_number || '').replace(/\D/g, '');
              if (matchNormalized.length >= 10 &&
                  normalizedPhone.slice(-10) === matchNormalized.slice(-10)) {
                return {
                  isDuplicate: true,
                  duplicateId: match.id,
                  reason: 'Phone number already exists in last 24 hours'
                };
              }
            }
          }
        }
      }

      return { isDuplicate: false };
    } catch (error) {
      logger.warn('Error checking duplicates:', error.message);
      return { isDuplicate: false };
    }
  }

  /**
   * Create lead in Supabase
   */
  async createLead(leadData) {
    const { data: lead, error } = await supabase
      .from('leads')
      .insert([leadData])
      .select()
      .single();

    if (error) {
      logger.error('Error creating lead:', error);
      throw new Error(`Failed to create lead: ${error.message}`);
    }

    return lead;
  }
}

module.exports = new LeadIngestionService();
