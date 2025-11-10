/**
 * Lead ID Generator
 * Generates sequential unique IDs for leads (e.g., LEAD-00001, LEAD-00002)
 */

const supabase = require('../config/supabaseClient');

class LeadIdGenerator {
  /**
   * Generate the next sequential lead ID
   * @returns {Promise<string>} Next lead ID (e.g., "LEAD-00008")
   */
  async generateNextLeadId() {
    try {
      // Get the highest existing lead_id from audit_logs that matches LEAD-XXXXX pattern
      const { data: existingLogs, error: fetchError } = await supabase
        .from('audit_logs')
        .select('lead_id')
        .like('lead_id', 'LEAD-%')
        .order('time_stamp', { ascending: false })
        .limit(1000);

      if (fetchError && fetchError.code !== '42P01') {
        // Table exists but query failed - log and continue
        console.warn('⚠️ Error fetching existing lead IDs:', fetchError.message);
      }

      let maxNumber = 0;

      if (existingLogs && existingLogs.length > 0) {
        // Extract numbers from existing LEAD-XXXXX IDs
        for (const log of existingLogs) {
          if (log.lead_id && typeof log.lead_id === 'string' && log.lead_id.startsWith('LEAD-')) {
            const match = log.lead_id.match(/LEAD-(\d+)/);
            if (match) {
              const num = parseInt(match[1], 10);
              if (num > maxNumber) {
                maxNumber = num;
              }
            }
          }
        }
      }

      // Generate next ID
      const nextNumber = maxNumber + 1;
      const leadId = `LEAD-${String(nextNumber).padStart(5, '0')}`;

      console.log(`✅ Generated new lead ID: ${leadId} (next number: ${nextNumber})`);
      return leadId;

    } catch (error) {
      console.error('❌ Error generating lead ID:', error);
      // Fallback: use timestamp-based ID if sequence generation fails
      const fallbackId = `LEAD-${Date.now().toString().slice(-8)}`;
      console.warn(`⚠️ Using fallback ID: ${fallbackId}`);
      return fallbackId;
    }
  }

  /**
   * Generate lead ID synchronously (for testing or when async is not needed)
   * Uses timestamp as fallback
   * @returns {string} Lead ID
   */
  generateFallbackId() {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    return `LEAD-${timestamp.toString().slice(-8)}-${random.toString().padStart(3, '0')}`;
  }
}

module.exports = new LeadIdGenerator();

