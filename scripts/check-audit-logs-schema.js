/**
 * Script to check the actual schema of audit_logs table
 */
const supabase = require('../config/supabaseClient');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'config.env') });

async function checkSchema() {
  try {
    console.log('🔍 Checking audit_logs table schema...\n');
    
    // Try to get one record to see what columns exist
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .limit(1);
    
    if (error) {
      console.error('❌ Error:', error);
      
      // Try to get table info via a different query
      const { data: allData, error: allError } = await supabase
        .from('audit_logs')
        .select('*');
      
      if (allError) {
        console.error('❌ Error with select all:', allError);
      } else {
        console.log('✅ Table exists. Sample record:', JSON.stringify(allData?.[0] || {}, null, 2));
      }
      return;
    }
    
    if (data && data.length > 0) {
      console.log('✅ Sample record structure:');
      console.log(JSON.stringify(data[0], null, 2));
      console.log('\n📋 Available columns:');
      console.log(Object.keys(data[0]).join(', '));
    } else {
      console.log('📭 Table exists but is empty. Checking with a direct query...');
      
      // Try without ordering to see if we can get any data
      const { data: emptyData, error: emptyError } = await supabase
        .from('audit_logs')
        .select('*');
      
      if (emptyError) {
        console.error('❌ Error:', emptyError);
      } else {
        console.log('✅ Table structure check complete. Records:', emptyData?.length || 0);
      }
    }
    
  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

checkSchema()
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });

