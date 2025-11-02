#!/usr/bin/env node
/**
 * Seed a minimal agency user in Supabase and optional trial subscription
 * Usage: node backend/scripts/seedAgencyUser.js email@example.com P@ssw0rd [ZIP1,ZIP2]
 */
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL_LIVE || process.env.SUPABASE_URL || 'https://ioqjonxjptvshdwhbuzv.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY_LIVE || process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlvcWpvbnhqcHR2c2hkd2hidXp2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTQ4MzQyNSwiZXhwIjoyMDc3MDU5NDI1fQ.ncz4UBVevblo9BGNhSezwYGpFopuyyhfYahtd__2eIs';
const supabase = createClient(supabaseUrl, supabaseKey);

const bcrypt = require('bcryptjs');

async function main() {
  const email = process.argv[2] || 'agency@example.com';
  const password = process.argv[3] || 'P@ssw0rd123!';
  const zipArg = process.argv[4] || '';
  const zipcodes = zipArg ? zipArg.split(',').map(z => z.trim()).filter(Boolean) : [];

  console.log('Seeding agency:', email);

  // Upsert agency
  const password_hash = await bcrypt.hash(password, 10);
  let { data: agency, error: aErr } = await supabase
    .from('agencies')
    .select('*')
    .eq('email', email)
    .single();

  if (!agency) {
    const ins = await supabase
      .from('agencies')
      .insert([{ business_name: 'Seeded Agency', email, password_hash, phone_number: '5550001111', verified: true, status: 'active', metadata: { seeded: true } }])
      .select()
      .single();
    if (ins.error) throw ins.error;
    agency = ins.data;
    console.log('Created agency id:', agency.id);
  } else {
    console.log('Agency already exists, id:', agency.id);
  }

  // Ensure a plan exists and create a trial subscription
  const planRes = await supabase
    .from('subscription_plans')
    .select('id, plan_name, base_price')
    .eq('is_active', true)
    .order('base_price', { ascending: true })
    .limit(1)
    .single();
  if (planRes.error) {
    console.warn('No active subscription plan found; skipping subscription creation.');
    return;
  }

  const planId = planRes.data.id;
  const now = new Date();
  const trialEnd = new Date(Date.now() + 14 * 86400 * 1000);
  const nextBilling = new Date(Date.now() + 30 * 86400 * 1000);

  const subIns = await supabase
    .from('subscriptions')
    .insert([{ agency_id: agency.id, plan_id: planId, status: 'trial', start_date: now.toISOString(), trial_end_date: trialEnd.toISOString(), next_billing_date: nextBilling.toISOString(), auto_renew: true }])
    .select()
    .single();
  if (subIns.error) {
    console.warn('Could not create subscription (maybe one exists):', subIns.error.message);
  } else {
    console.log('Created subscription id:', subIns.data.id);

    if (zipcodes.length) {
      const terr = zipcodes.map(z => ({ subscription_id: subIns.data.id, agency_id: agency.id, type: 'zipcode', value: String(z), zipcode: String(z), is_active: true }));
      const terrRes = await supabase.from('territories').insert(terr);
      if (terrRes.error) console.warn('Failed to insert territories:', terrRes.error.message);
      else console.log('Inserted territories:', zipcodes.join(','));
    }
  }

  console.log('✅ Seed complete');
}

main().catch(err => { console.error('❌ Seed failed:', err.message); process.exit(1); });
