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
      // Log received payload for debugging
      console.log('📥 Received payload:', JSON.stringify(payload, null, 2));
      console.log('📥 Payload keys:', Object.keys(payload));
      
      // Basic transformation - extract common fields
      // Support multiple schema formats including portal-specific schemas
      
      // Try multiple variations of name field
      // For portals with service_type/care_need (or serviceType/careNeed), create a descriptive name
      let leadName = payload.name || 
                     payload.lead_name || 
                     payload.full_name || 
                     (payload.first_name ? `${payload.first_name} ${payload.last_name || ''}`.trim() : null) ||
                     payload.contact_name ||
                     payload.customer_name ||
                     null;
      
      // If no name found, try to create one from portal-specific fields
      // Support both snake_case (service_type, care_need) and camelCase (serviceType, careNeed)
      // Also support "needs" field (alternative to careNeed)
      if (!leadName) {
        const serviceType = payload.service_type || payload.serviceType;
        const careNeed = payload.care_need || payload.careNeed || payload.needs;
        
        if (serviceType && careNeed) {
          leadName = `${serviceType} - ${careNeed}`;
        } else if (serviceType) {
          leadName = serviceType;
        } else if (careNeed) {
          leadName = careNeed;
        } else {
          leadName = 'Unknown';
        }
      }
      
      // Try multiple variations of email field
      let email = payload.email || 
                  payload.email_address || 
                  payload.emailAddress ||
                  payload.contact_email ||
                  payload.customer_email ||
                  null;
      
      // CRITICAL: Check 'contact' field - it might be phone or email
      // If contact looks like an email (contains @), use it as email
      if (!email && payload.contact) {
        const contact = payload.contact.toString().trim();
        // Check if it's an email (contains @)
        if (contact.includes('@')) {
          email = contact;
          console.log('✅ Found email in payload.contact (detected as email)');
        }
      }
      
      // Try multiple variations of phone field
      // IMPORTANT: Map 'phone' (from portal schema) to 'phone_number' (database field)
      // CRITICAL: Check 'phone' FIRST since that's what the portal schema uses
      // Also check 'contact' field which might contain phone number
      let phoneNumber = payload.phone || 
                        payload.phone_number || 
                        payload.phoneNumber ||
                        payload.contact_phone ||
                        payload.customer_phone ||
                        payload.mobile ||
                        payload.telephone ||
                        null;
      
      // CRITICAL: Check 'contact' field - it might be phone or email
      // If contact looks like a phone (digits), use it as phone
      if (!phoneNumber && payload.contact) {
        const contact = payload.contact.toString().trim();
        // Check if it's a phone number (contains mostly digits) - be lenient (7+ digits)
        const digitsOnly = contact.replace(/\D/g, '');
        if (digitsOnly.length >= 7) {
          phoneNumber = contact;
          console.log('✅ Found phone in payload.contact (detected as phone number)');
        }
      }
      
      const city = payload.city || payload.location?.city || null;
      const state = payload.state || payload.location?.state || payload.state_code || null;
      // IMPORTANT: Map 'zip_code' (from portal schema) to 'zipcode' (database field)
      // Support both snake_case (zip_code) and camelCase (zipCode)
      const zipcode = payload.zipcode || 
                      payload.zip_code || 
                      payload.zipCode ||
                      payload.postal_code || 
                      payload.zip || 
                      null;
      
      console.log('📥 Extracted fields:', {
        leadName,
        email: email ? '***' : null,
        phoneNumber: phoneNumber ? '***' : null,
        city,
        state,
        zipcode,
        rawPhone: payload.phone ? '***' : null,
        rawEmail: payload.email ? '***' : null
      });
      
      // Double-check phone extraction (in case it was missed)
      if (!phoneNumber && payload.phone) {
        phoneNumber = payload.phone;
        console.log('✅ Found phone in payload.phone, using it');
      }
      
      // Double-check email extraction (in case it was missed)
      if (!email && payload.email) {
        email = payload.email;
        console.log('✅ Found email in payload.email, using it');
      }
      
      // Final check - log what we have
      console.log('📋 Final extracted values:', {
        hasPhone: !!phoneNumber,
        hasEmail: !!email,
        phoneLength: phoneNumber ? phoneNumber.length : 0,
        emailLength: email ? email.length : 0
      });
      
      // Map industry - convert to database enum values
      let industry = payload.industry || payload.industry_type || portal.industry || 'non_healthcare';
      // Normalize industry values to match database enum
      if (industry.toLowerCase().includes('hospice')) {
        industry = 'healthcare_hospice';
      } else if (industry.toLowerCase().includes('homehealth') || industry.toLowerCase().includes('home_health')) {
        industry = 'healthcare_homehealth';
      } else {
        industry = 'non_healthcare';
      }

      // CRITICAL: Final phone extraction - check ALL possible phone fields one more time
      if (!phoneNumber) {
        // Try every possible phone field name (including camelCase variations)
        const phoneFields = ['phone', 'phone_number', 'phoneNumber', 'contact_phone', 
                            'customer_phone', 'mobile', 'telephone', 'tel', 'cell', 'contact'];
        for (const field of phoneFields) {
          if (payload[field] && payload[field].toString().trim().length > 0) {
            const value = payload[field].toString().trim();
            // Be lenient - accept phone if it has at least 7 digits (very lenient)
            const digitsOnly = value.replace(/\D/g, '');
            if (digitsOnly.length >= 7) {
              phoneNumber = value;
              console.log(`✅ Found phone in payload.${field}:`, phoneNumber ? '***' : null);
              break;
            }
          }
        }
      }
      
      // CRITICAL: Final email extraction - check ALL possible email fields one more time
      if (!email) {
        const emailFields = ['email', 'email_address', 'emailAddress', 'contact_email', 
                            'customer_email', 'e_mail', 'e-mail', 'contact'];
        for (const field of emailFields) {
          if (payload[field] && payload[field].toString().trim().length > 0) {
            const value = payload[field].toString().trim();
            // Only use if it looks like an email (contains @)
            if (value.includes('@')) {
              email = value;
              console.log(`✅ Found email in payload.${field}:`, email ? '***' : null);
              break;
            }
          }
        }
      }
      
      // Build transformed data matching database schema
      const transformed = {
        portal_id: portal.id,
        portal_code: portal.portal_code || null, // Add portal_code for temp_leads table
        industry: industry, // Required field - must match enum
        lead_name: leadName.trim(), // Required field
        email: email ? email.toLowerCase().trim() : null,
        phone_number: phoneNumber ? phoneNumber.toString().replace(/\D/g, '').slice(0, 20) : null,
        city: city ? city.trim() : null,
        state: state ? state.trim().toUpperCase().slice(0, 2) : null,
        zipcode: zipcode ? zipcode.toString().trim().slice(0, 10) : null,
        // Contact fields for deduplication
        contact_email: email ? email.toLowerCase().trim() : null,
        contact_phone: phoneNumber ? phoneNumber.toString().replace(/\D/g, '').slice(0, 20) : null,
        // Store full payload in lead_data (JSONB field)
        // Include all portal-specific fields (service_type, urgency, age_range, care_need, etc.)
        lead_data: {
          ...payload, // Original payload - includes all portal-specific fields
          source: payload.source || portal.portal_name || 'unknown',
          address: payload.address || payload.street_address || payload.full_address || null,
          // Include portal-specific fields for reference
          // Support both snake_case and camelCase field names
          service_type: payload.service_type || payload.serviceType || null,
          serviceType: payload.serviceType || payload.service_type || null,
          urgency: payload.urgency || null,
          age_range: payload.age_range || payload.ageRange || null,
          ageRange: payload.ageRange || payload.age_range || null,
          care_need: payload.care_need || payload.careNeed || payload.needs || null,
          careNeed: payload.careNeed || payload.care_need || payload.needs || null,
          needs: payload.needs || payload.care_need || payload.careNeed || null,
          zipCode: payload.zipCode || payload.zip_code || null,
          zip_code: payload.zip_code || payload.zipCode || null,
          contact: payload.contact || null,
          consent: payload.consent || null,
          portal: payload.portal || portal.portal_name || null,
          campaign: payload.campaign || null,
          medium: payload.medium || null,
          source: payload.source || null,
          submitted_at: payload.submitted_at || new Date().toISOString(),
          transformed_at: new Date().toISOString()
        },
        // Status - removed as it may not exist in schema, let DB use default
        // Pricing fields removed - may not exist in schema
      };

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

    if (!leadData.industry) {
      errors.push('Industry is required');
    } else {
      // Validate industry enum
      const validIndustries = ['healthcare_hospice', 'healthcare_homehealth', 'non_healthcare'];
      if (!validIndustries.includes(leadData.industry)) {
        errors.push(`Industry must be one of: ${validIndustries.join(', ')}`);
      }
    }

    // Contact validation - make it flexible
    // First, try to extract contact info from lead_data if not in top-level
    if (!leadData.email && !leadData.phone_number && leadData.lead_data) {
      console.log('🔍 Checking lead_data for contact info...');
      const dataEmail = leadData.lead_data.email || 
                       leadData.lead_data.email_address ||
                       leadData.lead_data.emailAddress ||
                       leadData.lead_data.contact_email ||
                       leadData.lead_data.customer_email;
      const dataPhone = leadData.lead_data.phone || 
                       leadData.lead_data.phone_number ||
                       leadData.lead_data.phoneNumber ||
                       leadData.lead_data.contact_phone ||
                       leadData.lead_data.customer_phone ||
                       leadData.lead_data.mobile ||
                       leadData.lead_data.telephone;
      
      if (dataEmail && !leadData.email) {
        leadData.email = dataEmail;
        leadData.contact_email = dataEmail;
        console.log('✅ Extracted email from lead_data');
      }
      if (dataPhone && !leadData.phone_number) {
        leadData.phone_number = dataPhone;
        leadData.contact_phone = dataPhone;
        console.log('✅ Extracted phone from lead_data');
      }
    }
    
    // Make email/phone OPTIONAL - only name is required
    // If we have a name, we can create the lead even without email/phone
    // CRITICAL: This validation should NOT block leads that have a name
    if (!leadData.email && !leadData.phone_number) {
      const hasName = leadData.lead_name && 
                      leadData.lead_name.trim() !== '' && 
                      leadData.lead_name !== 'Unknown' &&
                      leadData.lead_name.trim().length > 0;
      
      if (!hasName) {
        errors.push('Lead name is required');
        // Only add email/phone error if we also don't have a name
        errors.push('Either email or phone number is required, or a valid lead name must be provided');
      } else {
        // We have a name - ALLOW the lead creation even without email/phone
        // The lead_data JSONB field will contain all original form data
        console.log('✅ No email/phone provided, but have name - ALLOWING lead creation');
        console.log('   Lead name:', leadData.lead_name);
        console.log('   Lead will be created with name only, all other data stored in lead_data');
        // No error added - lead creation is allowed
      }
    } else {
      // We have email or phone, so validation passes
      console.log('✅ Contact info present:', {
        hasEmail: !!leadData.email,
        hasPhone: !!leadData.phone_number
      });
    }

    // Email format validation
    if (leadData.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(leadData.email)) {
        errors.push('Invalid email format');
      }
    }

    // Phone format validation - be VERY lenient, just check it's not empty if provided
    // Accept any phone format as long as it's not empty
    if (leadData.phone_number) {
      const phoneStr = leadData.phone_number.toString().trim();
      if (phoneStr === '') {
        errors.push('Phone number cannot be empty if provided');
      }
      // Don't validate phone format - accept any format as long as it's not empty
      // This allows international formats, extensions, etc.
    }

    // Ensure lead_data exists (required JSONB field)
    if (!leadData.lead_data || typeof leadData.lead_data !== 'object') {
      errors.push('Lead data (lead_data) is required');
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
    try {
      // Insert into temp_leads table which has all fields from public portal
      // IMPORTANT: Use snake_case column names (PostgreSQL converts unquoted to lowercase)
      const tempLeadInsert = {
        portal_id: leadData.portal_id,
        portal_code: leadData.portal_code || null,
        
        // Public portal form fields - use snake_case for column names
        service_type: leadData.lead_data?.service_type || leadData.lead_data?.serviceType || null,
        urgency: leadData.lead_data?.urgency || null,
        age_range: leadData.lead_data?.age_range || leadData.lead_data?.ageRange || null,
        care_need: leadData.lead_data?.care_need || leadData.lead_data?.careNeed || leadData.lead_data?.needs || null,
        zip_code: leadData.lead_data?.zip_code || leadData.lead_data?.zipCode || null,
        contact: leadData.lead_data?.contact || null,
        source: leadData.lead_data?.source || null,
        consent: leadData.lead_data?.consent || null,
        
        // Standard contact fields
        email: leadData.email || null,
        phone: leadData.phone_number || leadData.lead_data?.phone || null,
        phone_number: leadData.phone_number || null,
        
        // Additional fields
        campaign: leadData.lead_data?.campaign || null,
        medium: leadData.lead_data?.medium || null,
        
        // Lead name
        lead_name: leadData.lead_name || null,
        name: leadData.lead_name || null,
        
        // Raw payload - store everything here including camelCase versions
        raw_payload: {
          ...(leadData.lead_data || {}),
          // Also preserve camelCase in raw_payload
          serviceType: leadData.lead_data?.serviceType || leadData.lead_data?.service_type || null,
          ageRange: leadData.lead_data?.ageRange || leadData.lead_data?.age_range || null,
          careNeed: leadData.lead_data?.careNeed || leadData.lead_data?.care_need || null,
          zipCode: leadData.lead_data?.zipCode || leadData.lead_data?.zip_code || null
        },
        
        // Timestamp
        submitted_at: leadData.lead_data?.submitted_at ? new Date(leadData.lead_data.submitted_at) : new Date()
      };

      console.log('📝 Creating temp_lead with all portal data:', {
        portal_id: tempLeadInsert.portal_id,
        service_type: tempLeadInsert.service_type,
        care_need: tempLeadInsert.care_need,
        contact: tempLeadInsert.contact ? '***' : null,
        email: tempLeadInsert.email ? '***' : null,
        phone: tempLeadInsert.phone ? '***' : null
      });

      const { data: tempLead, error } = await supabase
        .from('temp_leads')
        .insert([tempLeadInsert])
        .select()
        .single();

      if (error) {
        console.error('❌ Supabase error creating temp_lead:', error);
        logger.error('Error creating temp_lead:', error);
        throw new Error(`Failed to create temp_lead: ${error.message}`);
      }

      console.log('✅ Temp lead created successfully:', tempLead.id);
      return tempLead;
    } catch (error) {
      logger.error('Error in createLead:', error);
      throw error;
    }
  }
}

module.exports = new LeadIngestionService();

