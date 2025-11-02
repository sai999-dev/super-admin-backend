#!/usr/bin/env node

/**
 * Reset subscription plans: deactivate or delete existing plans, then create new ones.
 * - Referenced by active/trial subscriptions => set is_active=false (archive)
 * - Unreferenced => hard delete
 * - Create three fresh plans: Basic, Premium, Enterprise (city-based like the admin screenshot)
 */

const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '..', '..', 'config.env') });
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const supabase = require('../config/supabaseClient');

async function main() {
  console.log('🔧 Resetting subscription plans...');

  // Fetch all plans
  const { data: plans, error: plansErr } = await supabase
    .from('subscription_plans')
    .select('id, plan_name, is_active');
  if (plansErr) throw plansErr;

  // Find referenced plans (active/trial subscriptions)
  const { data: subs, error: subsErr } = await supabase
    .from('subscriptions')
    .select('id, plan_id, status');
  if (subsErr) throw subsErr;

  const referenced = new Set(
    (subs || [])
      .filter(s => ['trial', 'trialing', 'active', 'TRIAL', 'ACTIVE'].includes(String(s.status).toLowerCase()))
      .map(s => s.plan_id)
  );

  // Deactivate referenced; delete unreferenced
  for (const p of plans || []) {
    if (referenced.has(p.id)) {
      const { error } = await supabase
        .from('subscription_plans')
        .update({ is_active: false })
        .eq('id', p.id);
      if (error) throw error;
      console.log(`📦 Archived plan (in-use): ${p.plan_name || p.name || p.id} (${p.id})`);
    } else {
      const { error } = await supabase
        .from('subscription_plans')
        .delete()
        .eq('id', p.id);
      if (error) throw error;
      console.log(`🗑️ Deleted plan (unused): ${p.plan_name || p.name || p.id} (${p.id})`);
    }
  }

  // Create new plans based on screenshot (city-based)
  const newPlans = [
    {
      plan_name: 'Basic Plan',
      base_price: 99,
      is_active: true
    },
    {
      plan_name: 'Premium Plan',
      base_price: 199,
      is_active: true
    },
    {
      plan_name: 'Enterprise Plan',
      base_price: 399,
      is_active: true
    }
  ];

  const { data: created, error: createErr } = await supabase
    .from('subscription_plans')
    .insert(newPlans)
    .select();
  if (createErr) throw createErr;

  console.log('✅ Created plans:', created.map(p => ({ id: p.id, name: p.name })));
  console.log('🎉 Reset complete');
}

main().catch(err => {
  console.error('❌ Reset failed:', err.message);
  process.exit(1);
});
