/**
 * Script to check if there are any portals in the database
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', 'config.env') });
require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');

// Get Supabase credentials
const supabaseUrl = process.env.SUPABASE_URL_LIVE || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY
  || process.env.SERVICE_KEY
  || process.env.SUPABASE_SERVICE_ROLE_KEY_LIVE 
  || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in config.env');
  console.error('Required: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// Check if credentials are still placeholders
if (supabaseUrl.includes('your-project') || supabaseServiceKey.includes('your-')) {
  console.error('❌ Supabase credentials are still using placeholder values!');
  console.error('\nPlease update config.env with your actual Supabase credentials:');
  console.error('  1. SUPABASE_URL should be: https://your-project-id.supabase.co');
  console.error('  2. SUPABASE_SERVICE_ROLE_KEY should be your actual service role key');
  console.error('\nYou can find these in your Supabase dashboard:');
  console.error('  Settings → API → Project URL and service_role key');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkPortals() {
  try {
    console.log('🔍 Checking for portals in database...\n');
    
    // Query portals table
    const { data: portals, error, count } = await supabase
      .from('portals')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Error querying portals:', error.message);
      
      // Check if it's a connection error
      if (error.message.includes('fetch failed') || error.message.includes('ENOTFOUND')) {
        console.error('\n⚠️  Connection failed. Possible issues:');
        console.error('  1. Invalid Supabase URL');
        console.error('  2. Network connectivity issue');
        console.error('  3. Supabase project might not exist');
      } else if (error.code === 'PGRST301' || error.message.includes('relation') || error.message.includes('does not exist')) {
        console.error('\n⚠️  The "portals" table might not exist in your database.');
        console.error('  You may need to run migrations to create the table.');
      } else {
        console.error('Error details:', error);
      }
      return;
    }

    if (!portals || portals.length === 0) {
      console.log('📭 No portals found in the database.');
      console.log('   The portals table exists but is empty.');
      return;
    }

    console.log(`✅ Found ${portals.length} portal(s) in the database:\n`);
    
    portals.forEach((portal, index) => {
      console.log(`${index + 1}. ${portal.portal_name || portal.name || 'Unnamed Portal'}`);
      console.log(`   ID: ${portal.id}`);
      console.log(`   Code: ${portal.portal_code || portal.slug || 'N/A'}`);
      console.log(`   Type: ${portal.portal_type || portal.authType || 'N/A'}`);
      console.log(`   Industry: ${portal.industry || 'N/A'}`);
      console.log(`   Status: ${portal.portal_status || portal.status || 'N/A'}`);
      console.log(`   Total Leads: ${portal.total_leads || 0}`);
      console.log(`   Created: ${portal.created_at || 'N/A'}`);
      console.log('');
    });

    console.log(`\n📊 Summary: ${portals.length} total portal(s)`);
    
  } catch (error) {
    console.error('❌ Unexpected error:', error.message);
    console.error(error.stack);
  }
}

// Run the check
checkPortals()
  .then(() => {
    console.log('\n✅ Check complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });

