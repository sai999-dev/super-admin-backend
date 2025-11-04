/**
 * Lead Data Validator
 * Validates lead data at middleware and service level
 */

class LeadValidator {
  /**
   * Validate lead creation payload
   * @param {Object} payload - Lead payload
   * @returns {Object} - Validation result
   */
  static validateLeadPayload(payload) {
    const errors = [];

    // Required fields
    if (!payload.lead_name && !payload.name && !payload.full_name) {
      errors.push('Lead name is required');
    }

    if (!payload.email && !payload.phone_number && !payload.phone) {
      errors.push('Either email or phone number is required');
    }

    // Email validation
    if (payload.email || payload.email_address) {
      const email = payload.email || payload.email_address;
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        errors.push('Invalid email format');
      }
    }

    // Phone validation
    if (payload.phone || payload.phone_number || payload.phoneNumber) {
      const phone = payload.phone || payload.phone_number || payload.phoneNumber;
      const phoneRegex = /^[\d\s\-\(\)\+]+$/;
      if (!phoneRegex.test(phone) || phone.replace(/\D/g, '').length < 10) {
        errors.push('Invalid phone number format (minimum 10 digits required)');
      }
    }

    // Territory validation
    if (!payload.zipcode && !payload.zip_code && !payload.postal_code && !payload.zip) {
      if (!payload.city && !payload.location?.city) {
        errors.push('Either zipcode or city is required for territory matching');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate webhook signature using HMAC
   * @param {string} signature - Webhook signature (from header)
   * @param {string} secret - Secret key
   * @param {Object|string} payload - Request payload (object or JSON string)
   * @returns {boolean} - Valid signature
   */
  static validateWebhookSignature(signature, secret, payload) {
    try {
      if (!signature || !secret) {
        return false;
      }

      const crypto = require('crypto');
      
      // Convert payload to string if it's an object
      const payloadString = typeof payload === 'string' 
        ? payload 
        : JSON.stringify(payload);
      
      // Create HMAC hash
      const hmac = crypto.createHmac('sha256', secret);
      hmac.update(payloadString);
      const expectedSignature = hmac.digest('hex');
      
      // Compare signatures (constant-time comparison to prevent timing attacks)
      // Signature might be in format "sha256=<hash>" or just the hash
      const receivedHash = signature.includes('=') 
        ? signature.split('=')[1] 
        : signature;
      
      return crypto.timingSafeEqual(
        Buffer.from(expectedSignature, 'hex'),
        Buffer.from(receivedHash, 'hex')
      );
    } catch (error) {
      console.error('Error validating webhook signature:', error);
      return false;
    }
  }

  /**
   * Sanitize lead data
   * @param {Object} payload - Raw payload
   * @returns {Object} - Sanitized payload
   */
  static sanitize(payload) {
    const sanitized = { ...payload };

    // Remove potentially dangerous fields
    delete sanitized.__proto__;
    delete sanitized.constructor;

    // Trim string values
    Object.keys(sanitized).forEach(key => {
      if (typeof sanitized[key] === 'string') {
        sanitized[key] = sanitized[key].trim();
      }
    });

    return sanitized;
  }
}

module.exports = LeadValidator;

