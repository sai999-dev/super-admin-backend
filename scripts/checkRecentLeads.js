/**
 * Quick script to check recent leads in the database
 */

const supabase = require('../config/supabaseClient');

async function checkRecentLeads() {
  try {
    console.log('🔍 Checking for recent leads...\n');

    // Get the 5 most recent leads
    const { data: leads, error } = await supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) {
      console.error('❌ Error fetching leads:', error);
      return;
    }

    if (!leads || leads.length === 0) {
      console.log('📭 No leads found in the database.\n');
      return;
    }

    console.log(`✅ Found ${leads.length} recent lead(s):\n`);
    console.log('='.repeat(80));

    leads.forEach((lead, index) => {
      console.log(`\n📋 Lead #${index + 1}:`);
      console.log(`   ID: ${lead.id}`);
      console.log(`   Name: ${lead.lead_name || 'N/A'}`);
      console.log(`   Email: ${lead.email || lead.contact_email || 'N/A'}`);
      console.log(`   Phone: ${lead.phone_number || lead.contact_phone || 'N/A'}`);
      console.log(`   Location: ${lead.city || 'N/A'}, ${lead.state || 'N/A'} ${lead.zipcode || ''}`);
      console.log(`   Industry: ${lead.industry || 'N/A'}`);
      console.log(`   Status: ${lead.status || 'N/A'}`);
      console.log(`   Portal ID: ${lead.portal_id || 'N/A'}`);
      console.log(`   Created: ${lead.created_at || 'N/A'}`);
      
      // Show lead_data if available
      if (lead.lead_data && typeof lead.lead_data === 'object') {
        console.log(`   Raw Data Keys: ${Object.keys(lead.lead_data).join(', ')}`);
      }
      
      console.log('-'.repeat(80));
    });

    // Check for the specific portal
    const portalCode = 'local-backend-1762278750d';
    const { data: portal } = await supabase
      .from('portals')
      .select('id, portal_name, portal_code')
      .eq('portal_code', portalCode)
      .single();

    if (portal) {
      console.log(`\n🔗 Portal "${portal.portal_name}" (${portal.portal_code}):`);
      const { data: portalLeads } = await supabase
        .from('leads')
        .select('id, lead_name, created_at')
        .eq('portal_id', portal.id)
        .order('created_at', { ascending: false })
        .limit(3);

      if (portalLeads && portalLeads.length > 0) {
        console.log(`   ✅ Found ${portalLeads.length} lead(s) from this portal:`);
        portalLeads.forEach(lead => {
          console.log(`      - ${lead.lead_name} (${lead.created_at})`);
        });
      } else {
        console.log(`   📭 No leads found from this portal yet.`);
      }
    } else {
      console.log(`\n⚠️  Portal "${portalCode}" not found in database.`);
    }

    console.log('\n' + '='.repeat(80));
    console.log('✅ Check complete!\n');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Run the check
checkRecentLeads();


