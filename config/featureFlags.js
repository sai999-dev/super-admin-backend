/**
 * Feature Flags Configuration
 * Centralized feature flag management
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', 'config.env') });

/**
 * Get feature flag value from environment
 * @param {string} flagName - Name of the feature flag
 * @param {boolean} defaultValue - Default value if not set
 * @returns {boolean}
 */
function getFeatureFlag(flagName, defaultValue = false) {
  const value = process.env[flagName];
  if (value === undefined || value === '') return defaultValue;
  return value === 'true' || value === '1' || value === 'yes';
}

module.exports = {
  // API Features
  ENABLE_PORTAL_REGISTRY: getFeatureFlag('ENABLE_PORTAL_REGISTRY', true),
  ENABLE_LEAD_MANAGEMENT: getFeatureFlag('ENABLE_LEAD_MANAGEMENT', true),
  ENABLE_MOBILE_APIS: getFeatureFlag('ENABLE_MOBILE_APIS', true),
  ENABLE_WEBHOOK_MONITORING: getFeatureFlag('ENABLE_WEBHOOK_MONITORING', false),
  
  // Database Query Strategy
  ENABLE_NESTED_SELECTS: getFeatureFlag('ENABLE_NESTED_SELECTS', false),
  
  // Observability
  ENABLE_DETAILED_LOGGING: getFeatureFlag('ENABLE_DETAILED_LOGGING', process.env.NODE_ENV === 'development'),
  ENABLE_ERROR_TRACKING: getFeatureFlag('ENABLE_ERROR_TRACKING', true),
  ENABLE_PERFORMANCE_MONITORING: getFeatureFlag('ENABLE_PERFORMANCE_MONITORING', true),
  
  // Development/Testing
  ENABLE_DEMO_MODE: getFeatureFlag('ENABLE_DEMO_MODE', false),
  ENABLE_SMOKE_TEST_BYPASS: getFeatureFlag('ENABLE_SMOKE_TEST_BYPASS', false),
  
  /**
   * Check if nested PostgREST selects should be used
   * Falls back to manual joins if FKs not ready
   */
  shouldUseNestedSelects() {
    if (!this.ENABLE_NESTED_SELECTS) return false;
    
    // Additional check: ensure we're in production or explicitly enabled
    if (process.env.NODE_ENV === 'production') {
      return this.ENABLE_NESTED_SELECTS;
    }
    
    // In dev, allow nested selects if explicitly enabled
    return this.ENABLE_NESTED_SELECTS;
  }
};

