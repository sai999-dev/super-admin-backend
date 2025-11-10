/**
 * Script to read audit logs from the database
 */
const supabase = require('../config/supabaseClient');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'config.env') });

async function readAuditLogs(limit = 50, offset = 0) {
  try {
    console.log('📖 Reading audit logs from database...\n');
    
    // First, get the total count
    const { count, error: countError } = await supabase
      .from('audit_logs')
      .select('*', { count: 'exact', head: true });
    
    if (countError) {
      console.error('❌ Error getting count:', countError);
    } else {
      console.log(`📊 Total audit logs in database: ${count}\n`);
    }
    
    // Fetch audit logs with limit and offset
    // Note: The actual table uses 'time_stamp' not 'created_at'
    const { data: logs, error } = await supabase
      .from('audit_logs')
      .select('*')
      .order('time_stamp', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (error) {
      console.error('❌ Error reading audit logs:', error);
      return;
    }
    
    if (!logs || logs.length === 0) {
      console.log('📭 No audit logs found in the database.');
      return;
    }
    
    console.log(`✅ Found ${logs.length} audit log(s):\n`);
    console.log('='.repeat(100));
    
    logs.forEach((log, index) => {
      console.log(`\n📝 Log #${index + 1 + offset}:`);
      console.log(`   🔑 Unique Lead ID: ${log.lead_id || 'N/A'}`);
      console.log(`   ID: ${log.id}`);
      console.log(`   Agency ID: ${log.agency_id || 'N/A'}`);
      console.log(`   Action Status: ${log.action_status || 'N/A'}`);
      console.log(`   Time Stamp: ${log.time_stamp || 'N/A'}`);
      
      if (log.lead_data) {
        console.log(`   Lead Data:`);
        const leadData = typeof log.lead_data === 'string' ? JSON.parse(log.lead_data) : log.lead_data;
        console.log(`      - Unique Lead ID: ${leadData.lead_id || log.lead_id || 'N/A'}`);
        console.log(`      - Lead Name: ${leadData.lead_name || leadData.name || 'N/A'}`);
        console.log(`      - Email: ${leadData.email || 'N/A'}`);
        console.log(`      - Phone: ${leadData.phone_number || leadData.phone || 'N/A'}`);
        console.log(`      - Status: ${leadData.status || 'N/A'}`);
        console.log(`      - Source: ${leadData.source || 'N/A'}`);
        console.log(`      - Portal ID: ${leadData.portal_id || 'N/A'}`);
        if (leadData.raw_payload) {
          console.log(`      - Raw Payload: ${JSON.stringify(leadData.raw_payload, null, 8)}`);
        }
      }
      
      console.log('-'.repeat(100));
    });
    
    console.log(`\n📄 Showing ${logs.length} of ${count || '?'} total audit logs`);
    if (count > offset + limit) {
      console.log(`💡 Use: node read-audit-logs.js ${limit} ${offset + limit} to see more`);
    }
    
  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

// Parse command line arguments
const limit = process.argv[2] ? parseInt(process.argv[2]) : 50;
const offset = process.argv[3] ? parseInt(process.argv[3]) : 0;

readAuditLogs(limit, offset)
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });

