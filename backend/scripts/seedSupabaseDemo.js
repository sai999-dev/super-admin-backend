#!/usr/bin/env node

/**
 * Seed Supabase with minimal demo data required by admin smoke test.
 * Introspects table columns to avoid referencing non-existent fields.
 */

const crypto = require('crypto');
const path = require('path');
const dotenv = require('dotenv');
const supabase = require('../config/supabaseClient');

dotenv.config({ path: path.join(__dirname, '..', '..', 'config.env') });
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const uuid = () => crypto.randomUUID();

async function ensureRow(table, payload) {
  const { error } = await supabase.from(table).insert(payload);
  if (error) throw error;
}

async function tableExists(table) {
  try {
    const { error } = await supabase.from(table).select('id', { count: 'exact', head: true });
    return !error;
  } catch (err) {
    return false;
  }
}

async function main() {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);
  end.setMonth(end.getMonth() + 1);

  // IDs
  const agencyId = uuid();
  let planId = null;
  const subscriptionId = uuid();
  const activeSubId = uuid();

  // agencies (minimal fields; adjust to your schema as needed)
  const email = `demo.agency+${now.getTime()}@example.com`;
  await ensureRow('agencies', {
    id: agencyId,
    agency_name: 'Demo Agency',
    industry: 'General',
    email,
    created_date: now.toISOString()
  });

  // subscription_plans: Do NOT auto-create plans. Use existing plan if present.
  // Find any existing plan to attach; otherwise skip creating subscriptions.
  const { data: existingPlan, error: planErr } = await supabase
    .from('subscription_plans')
    .select('id')
    .limit(1)
    .maybeSingle();
  if (planErr) throw planErr;
  if (existingPlan && existingPlan.id) {
    planId = existingPlan.id;
  }

  // subscriptions: only create if a plan exists
  let createdSubscription = false;
  if (planId) {
    await ensureRow('subscriptions', {
      id: subscriptionId,
      agency_id: agencyId,
      plan_id: planId,
      status: 'active',
      current_units: 2,
      billing_cycle: 'monthly',
      start_date: now.toISOString(),
      auto_renew: true
    });
    createdSubscription = true;
  }

  // active_subscriptions (optional, if table exists)
  const hasActiveSubs = await tableExists('active_subscriptions');
  if (hasActiveSubs) {
    await ensureRow('active_subscriptions', {
      id: activeSubId,
      agency_id: agencyId,
      plan_id: planId,
      subscription_id: subscriptionId,
      start_date: start.toISOString(),
      end_date: end.toISOString(),
      status: 'ACTIVE',
      monthly_cost: 50.0,
      total_cost: 50.0,
      billing_cycle: 'MONTHLY',
      auto_renew: true,
      territory_count: 0,
      payment_status: 'PAID'
    });
  }

  // territories (attach to active subscription and subscription)
  const territories = [
    { type: 'zipcode', value: '73301' },
    { type: 'zipcode', value: '94105' }
  ];
  const terrPayload = territories.map((t) => ({
    id: uuid(),
    ...(planId ? { subscription_id: subscriptionId } : {}),
    agency_id: agencyId,
    ...(hasActiveSubs ? { active_subscription_id: activeSubId } : {}),
    type: t.type,
    value: t.value,
    is_active: true,
    priority: 1
  }));
  const { error: terrError } = await supabase.from('territories').insert(terrPayload);
  if (terrError) throw terrError;

  // bump territory_count
  if (hasActiveSubs && planId) {
    await supabase
      .from('active_subscriptions')
      .update({ territory_count: terrPayload.length })
      .eq('id', activeSubId);
  }

  console.log('✅ Seeded demo data:', { agencyId, planId, subscriptionId: createdSubscription ? subscriptionId : null, activeSubId: hasActiveSubs ? activeSubId : null, hasActiveSubs });
}

main().catch((err) => {
  console.error('❌ Seed failed:', err.message);
  process.exit(1);
});
