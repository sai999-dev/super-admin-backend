/**
 * Check webhook data and portal configuration
 */

const supabase = require('../config/supabaseClient');

async function checkWebhookData() {
  try {
    console.log('🔍 Checking webhook configuration and recent data...\n');

    const portalCode = 'local-backend-1762278750d';
    const apiKey = 'prt_live_65437d1979e559cb9185d46c1adccb3a';

    // Check portal
    console.log('1️⃣ Checking portal configuration...');
    const { data: portal, error: portalError } = await supabase
      .from('portals')
      .select('*')
      .eq('portal_code', portalCode)
      .single();

    if (portalError || !portal) {
      console.log(`   ❌ Portal "${portalCode}" not found!`);
      console.log(`   Error: ${portalError?.message || 'Not found'}`);
      return;
    }

    console.log(`   ✅ Portal found: "${portal.portal_name}"`);
    console.log(`   - ID: ${portal.id}`);
    console.log(`   - Code: ${portal.portal_code}`);
    console.log(`   - API Key: ${portal.api_key}`);
    console.log(`   - Status: ${portal.portal_status || portal.status || 'N/A'}`);
    console.log(`   - Industry: ${portal.industry || 'N/A'}`);

    // Check if API key matches
    if (portal.api_key !== apiKey) {
      console.log(`   ⚠️  API key mismatch!`);
      console.log(`   Expected: ${apiKey}`);
      console.log(`   Found: ${portal.api_key}`);
    } else {
      console.log(`   ✅ API key matches!`);
    }

    // Check leads from this portal
    console.log('\n2️⃣ Checking leads from this portal...');
    const { data: portalLeads, error: leadsError } = await supabase
      .from('leads')
      .select('*')
      .eq('portal_id', portal.id)
      .order('created_at', { ascending: false })
      .limit(10);

    if (leadsError) {
      console.log(`   ❌ Error: ${leadsError.message}`);
    } else if (!portalLeads || portalLeads.length === 0) {
      console.log(`   📭 No leads found from this portal.`);
      console.log(`   💡 This means the webhook hasn't received data yet, or the data wasn't saved.`);
    } else {
      console.log(`   ✅ Found ${portalLeads.length} lead(s) from this portal:\n`);
      portalLeads.forEach((lead, index) => {
        console.log(`   📋 Lead #${index + 1}:`);
        console.log(`      Name: ${lead.lead_name || 'N/A'}`);
        console.log(`      Email: ${lead.email || lead.contact_email || 'N/A'}`);
        console.log(`      Phone: ${lead.phone_number || lead.contact_phone || 'N/A'}`);
        console.log(`      Created: ${lead.created_at}`);
        if (lead.lead_data) {
          console.log(`      Raw Data: ${JSON.stringify(lead.lead_data).substring(0, 100)}...`);
        }
        console.log('');
      });
    }

    // Check all recent leads
    console.log('3️⃣ Checking all recent leads (last 5)...');
    const { data: allLeads } = await supabase
      .from('leads')
      .select('id, lead_name, portal_id, created_at')
      .order('created_at', { ascending: false })
      .limit(5);

    if (allLeads && allLeads.length > 0) {
      console.log(`   Found ${allLeads.length} recent lead(s):`);
      allLeads.forEach(lead => {
        const isFromPortal = lead.portal_id === portal.id;
        console.log(`   ${isFromPortal ? '✅' : '⚠️ '} ${lead.lead_name} (Portal ID: ${lead.portal_id?.substring(0, 8)}...) - ${lead.created_at}`);
      });
    }

    console.log('\n' + '='.repeat(80));
    console.log('✅ Check complete!\n');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkWebhookData();


