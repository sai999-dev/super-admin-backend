/**
 * Schema Mapping Service
 * Maps portal-specific field names to common unified field names
 */

class SchemaMappingService {
  constructor() {
    // Default field mappings for common variations
    // Each portal can have its own custom mapping
    this.defaultMappings = {
      // Name field variations
      name: ['name', 'full_name', 'lead_name', 'contact_name', 'customer_name', 'client_name', 'first_name', 'last_name'],

      // Phone field variations
      phone: ['phone', 'phone_number', 'phoneNumber', 'contact_no', 'contact_phone', 'mobile', 'telephone', 'tel', 'cell', 'contact'],

      // Email field variations
      email: ['email', 'email_address', 'emailAddress', 'contact_email', 'customer_email', 'e_mail', 'e-mail'],

      // Location field variations
      city: ['city', 'location_city', 'address_city', 'town'],
      state: ['state', 'state_code', 'province', 'region'],
      zipcode: ['zipcode', 'zip_code', 'zipCode', 'postal_code', 'postal', 'zip'],
      country: ['country', 'country_code', 'nation'],

      // Industry field variations
      industry: ['industry', 'industry_type', 'business_type', 'sector', 'vertical']
    };
  }

  /**
   * Get field mapping for a specific portal
   * @param {string} portalId - Portal identifier
   * @param {Object} customMapping - Custom mapping override (optional)
   * @returns {Object} Field mapping configuration
   */
  getMapping(portalId, customMapping = null) {
    // If custom mapping provided, use it
    if (customMapping) {
      return this.mergeMappings(this.defaultMappings, customMapping);
    }

    // Check if portal has stored mapping in database (future enhancement)
    // For now, return default mappings
    return this.defaultMappings;
  }

  /**
   * Merge default mappings with custom mappings
   * @param {Object} defaultMappings - Default field mappings
   * @param {Object} customMappings - Custom field mappings
   * @returns {Object} Merged mappings
   */
  mergeMappings(defaultMappings, customMappings) {
    const merged = { ...defaultMappings };
    
    for (const [commonField, customVariations] of Object.entries(customMappings)) {
      if (merged[commonField]) {
        // Merge arrays, removing duplicates
        merged[commonField] = [...new Set([...merged[commonField], ...customVariations])];
      } else {
        merged[commonField] = customVariations;
      }
    }
    
    return merged;
  }

  /**
   * Extract common fields from payload using mapping
   * @param {Object} payload - Raw payload from portal
   * @param {Object} mapping - Field mapping configuration
   * @returns {Object} Extracted common fields
   */
  extractCommonFields(payload, mapping = null) {
    const fieldMapping = mapping || this.defaultMappings;
    const extracted = {};

    // Extract each common field
    for (const [commonField, variations] of Object.entries(fieldMapping)) {
      // Try each variation until we find a match
      for (const variation of variations) {
        if (payload.hasOwnProperty(variation) && payload[variation] !== null && payload[variation] !== undefined && payload[variation] !== '') {
          extracted[commonField] = this.normalizeField(commonField, payload[variation]);
          break; // Found a match, move to next field
        }
      }
    }

    // Special handling for name field - combine first_name and last_name if needed
    if (!extracted.name && payload.first_name) {
      const firstName = payload.first_name;
      const lastName = payload.last_name || '';
      extracted.name = `${firstName} ${lastName}`.trim();
    }

    // Special handling for phone - extract digits only
    if (extracted.phone) {
      extracted.phone = this.normalizePhone(extracted.phone);
    }

    // Special handling for email - lowercase
    if (extracted.email) {
      extracted.email = extracted.email.toLowerCase().trim();
    }

    return extracted;
  }

  /**
   * Normalize field value based on field type
   * @param {string} fieldName - Common field name
   * @param {*} value - Field value
   * @returns {*} Normalized value
   */
  normalizeField(fieldName, value) {
    if (value === null || value === undefined) {
      return null;
    }

    const stringValue = String(value).trim();

    switch (fieldName) {
      case 'phone':
        return this.normalizePhone(stringValue);
      case 'email':
        return stringValue.toLowerCase();
      case 'state':
        return stringValue.toUpperCase().slice(0, 2);
      case 'zipcode':
        return stringValue.slice(0, 10);
      default:
        return stringValue;
    }
  }

  /**
   * Normalize phone number (extract digits only, limit length)
   * @param {string} phone - Phone number
   * @returns {string} Normalized phone number
   */
  normalizePhone(phone) {
    if (!phone) return null;
    // Extract digits only, limit to 20 characters
    const digitsOnly = phone.replace(/\D/g, '');
    return digitsOnly.slice(0, 20) || null;
  }

  /**
   * Get extra fields (fields not mapped to common fields)
   * @param {Object} payload - Raw payload from portal
   * @param {Object} extractedFields - Already extracted common fields
   * @param {Object} mapping - Field mapping configuration
   * @returns {Object} Extra fields
   */
  getExtraFields(payload, extractedFields, mapping = null) {
    const fieldMapping = mapping || this.defaultMappings;
    const extraFields = {};
    
    // Get all mapped field variations
    const mappedVariations = new Set();
    for (const variations of Object.values(fieldMapping)) {
      variations.forEach(variation => mappedVariations.add(variation));
    }

    // Add first_name and last_name to mapped variations if name was extracted
    if (extractedFields.name) {
      mappedVariations.add('first_name');
      mappedVariations.add('last_name');
    }

    // Collect all fields that are not in the mapping
    for (const [key, value] of Object.entries(payload)) {
      if (!mappedVariations.has(key) && value !== null && value !== undefined && value !== '') {
        extraFields[key] = value;
      }
    }

    return extraFields;
  }

  /**
   * Normalize complete payload - extract common fields and extra fields
   * @param {Object} payload - Raw payload from portal
   * @param {string} portalId - Portal identifier
   * @param {Object} customMapping - Custom mapping (optional)
   * @returns {Object} Normalized data with common fields and extra_fields
   */
  normalizePayload(payload, portalId, customMapping = null) {
    const mapping = this.getMapping(portalId, customMapping);
    const commonFields = this.extractCommonFields(payload, mapping);
    const extraFields = this.getExtraFields(payload, commonFields, mapping);

    return {
      ...commonFields,
      extra_fields: extraFields
    };
  }
}

module.exports = new SchemaMappingService();

