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
      // Basic transformation - extract common fields
      // This can be extended to support portal-specific schemas
      const transformed = {
        portal_id: portal.id,
        lead_name: payload.name || payload.lead_name || payload.full_name || 'Unknown',
        email: payload.email || payload.email_address || null,
        phone_number: payload.phone || payload.phone_number || payload.phoneNumber || null,
        city: payload.city || payload.location?.city || null,
        state: payload.state || payload.location?.state || payload.state_code || null,
        zipcode: payload.zipcode || payload.zip_code || payload.postal_code || payload.zip || null,
        zip_code: payload.zipcode || payload.zip_code || payload.postal_code || payload.zip || null,
        address: payload.address || payload.street_address || payload.full_address || null,
        industry_type: payload.industry || payload.industry_type || portal.industry || 'non_healthcare',
        source: payload.source || portal.portal_name || 'unknown',
        payload: payload, // Keep original for reference
        status: 'new',
        created_at: new Date().toISOString()
      };

      // Extract territory from zipcode
      if (transformed.zipcode) {
        transformed.territory = transformed.zipcode;
      } else if (transformed.city && transformed.state) {
        transformed.territory = `${transformed.city}, ${transformed.state}`;
      }

      return transformed;
    } catch (error) {
      logger.error('Error transforming lead data:', error);
      throw new Error(`Failed to transform lead data: ${error.message}`);
    }
  }

  /**
   * Validate transformed lead data
   * @param {Object} leadData - Transformed lead data
   * @returns {Object} - Validation result
   */
  validate(leadData) {
    const errors = [];

    // Required fields
    if (!leadData.lead_name || leadData.lead_name.trim() === '') {
      errors.push('Lead name is required');
    }

    if (!leadData.portal_id) {
      errors.push('Portal ID is required');
    }

    // Contact validation
    if (!leadData.email && !leadData.phone_number) {
      errors.push('Either email or phone number is required');
    }

    // Email format validation
    if (leadData.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(leadData.email)) {
        errors.push('Invalid email format');
      }
    }

    // Phone format validation (basic)
    if (leadData.phone_number) {
      const phoneRegex = /^[\d\s\-\(\)\+]+$/;
      if (!phoneRegex.test(leadData.phone_number)) {
        errors.push('Invalid phone number format');
      }
    }

    // Territory validation (zipcode or city/state)
    if (!leadData.zipcode && !leadData.city) {
      errors.push('Either zipcode or city is required for territory matching');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Process complete lead ingestion flow
   * @param {Object} payload - Raw payload from portal
   * @param {Object} portal - Portal configuration
   * @returns {Object} - Processing result
   */
  async processLead(payload, portal) {
    try {
      // Step 1: Transform data
      const transformedData = this.transformData(payload, portal);

      // Step 2: Validate
      const validation = this.validate(transformedData);

      if (!validation.valid) {
        return {
          success: false,
          message: 'Lead validation failed',
          errors: validation.errors,
          data: transformedData
        };
      }

      // Step 3: Check for duplicates (optional - based on email or phone)
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

      // Step 4: Create lead in database
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
   * Check for duplicate leads
   * @param {Object} leadData - Lead data to check
   * @returns {Object} - Duplicate check result
   */
  async checkDuplicates(leadData) {
    try {
      const checks = [];

      // Check by email
      if (leadData.email) {
        const { data: emailMatch } = await supabase
          .from('leads')
          .select('id, created_at')
          .eq('email', leadData.email.toLowerCase())
          .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // Last 24 hours
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

      // Check by phone
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

      return {
        isDuplicate: false
      };

    } catch (error) {
      logger.warn('Error checking duplicates:', error.message);
      // Don't fail on duplicate check errors - allow lead creation
      return {
        isDuplicate: false
      };
    }
  }

  /**
   * Create lead in database
   * @param {Object} leadData - Transformed and validated lead data
   * @returns {Object} - Created lead record
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

