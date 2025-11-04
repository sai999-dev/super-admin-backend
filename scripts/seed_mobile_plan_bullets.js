#!/usr/bin/env node
/**
 * Seed or update subscription plan descriptions and features from fixed text.
 * - Loads Supabase client using config.env
 * - Matches plans by name heuristics (basic, growth/premium, professional/business)
 * - Falls back to nearest price if name not found
 * - Updates: description, features (array), plan_name, base_price (to target), is_active
 */

const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Load env from repo root config.env
const root = path.resolve(__dirname, '..', '..');
const envPath = path.join(root, 'config.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
  console.log(`Loaded environment from ${envPath}`);
} else {
  dotenv.config();
  console.warn('config.env not found at repo root; relying on process.env');
}

const supabase = require('../config/supabaseClient');

const targets = [
  {
    key: 'basic',
    name: 'Basic Plan',
    description: 'Basic Plan — $99/month',
    price: 99,
    features: [
      'Up to 3 service areas',
      'Unlimited lead access',
      'Email support',
      'Basic analytics',
      'Monthly area changes',
    ],
  },
  {
    key: 'growth',
    name: 'Growth Plan',
    description: 'Growth Plan — $199/month (Most Popular)',
    price: 199,
    features: [
      'Up to 7 service areas',
      'Priority lead notifications',
      'Phone & email support',
      'Advanced analytics',
      'Lead scoring system',
      'Monthly area changes',
    ],
  },
  {
    key: 'professional',
    name: 'Professional Plan',
    description: 'Professional Plan — $299/month',
    price: 299,
    features: [
      'Up to 15 service areas',
      'Exclusive lead access',
      '24/7 priority support',
      'Premium analytics & reporting',
      'Lead export (CSV/Excel)',
      'Custom notifications',
      'Bi-weekly area changes',
    ],
  },
];

function findMatchForTarget(plans, target) {
  const nameLc = (s) => (s || '').toString().toLowerCase();
  const price = Number(target.price);

  // Try name heuristics
  const nameHeuristics = {
    basic: ['basic'],
    growth: ['growth', 'premium'],
    professional: ['professional', 'business'],
  };
  const needles = nameHeuristics[target.key] || [];

  let match = plans.find((p) => {
    const n2 = nameLc(p.plan_name);
    return needles.some((needle) => n2.includes(needle));
  });

  if (match) return match;

  // Fallback: nearest base_price within +/- 80
  const within = plans
    .map((p) => ({ p, diff: Math.abs(Number(p.base_price || 0) - price) }))
    .filter(({ diff }) => diff <= 80)
    .sort((a, b) => a.diff - b.diff);

  return within.length ? within[0].p : null;
}

async function run() {
  try {
    console.log('Fetching subscription plans...');
    const { data: plans, error } = await supabase
      .from('subscription_plans')
      .select('id, plan_name, base_price, is_active');

    if (error) throw error;

    if (!plans || !plans.length) {
      console.warn('No subscription plans found. Creating three plans...');
      const inserted = [];
      for (let i = 0; i < targets.length; i++) {
        const t = targets[i];
        const now = new Date().toISOString();
        let payload = {
          plan_name: t.name,
          base_price: t.price,
          is_active: true,
          created_at: now,
          description: t.description,
          features: t.features,
          base_units: i === 0 ? 3 : i === 1 ? 7 : 15,
          unit_type: 'zipcode',
          additional_unit_price: 10,
        };

        const dropOrder = ['additional_unit_price','unit_type','base_units','features','description'];
        let lastErr = null;
        for (let attempt = 0; attempt <= dropOrder.length; attempt++) {
          const { data, error: ierr } = await supabase
            .from('subscription_plans')
            .insert(payload)
            .select('id, plan_name, base_price')
            .single();
          if (!ierr) {
            inserted.push(data);
            break;
          }
          lastErr = ierr;
          const msg = (ierr.message || '').toLowerCase();
          const match = msg.match(/could not find the '([^']+)' column/);
          let col = match && match[1];
          if (!col && (ierr.code === 'PGRST204' || msg.includes('pgrst204'))) {
            col = dropOrder[attempt];
          }
          if (col && col in payload) {
            console.warn(`Insert fallback: dropping column ${col}`);
            delete payload[col];
            continue;
          }
          break;
        }
        if (lastErr && inserted.length <= i) {
          throw lastErr;
        }
      }

      console.log('Inserted plans:', inserted);
      console.log('\nDone seeding plan descriptions and features.');
      process.exit(0);
    }

    for (const t of targets.map(x => ({...x, name: x.name.replace('Growth Plan','Premium Plan').replace('Professional Plan','Business Plan')}))) {
      const match = findMatchForTarget(plans, t);
      if (!match) {
        console.warn(`No match found for ${t.name}; skipping update.`);
        continue;
      }

      console.log(`\nUpdating plan ${match.id} -> ${t.name}`);
      let payload = {
        plan_name: t.name,
        description: t.description,
        features: t.features,
        is_active: true,
        base_price: t.price,
        updated_at: new Date().toISOString(),
      };

      const dropOrder = ['features','description'];
      let updated = null; let lastErr = null;
      for (let i = 0; i <= dropOrder.length; i++) {
        const { data, error: uerr } = await supabase
          .from('subscription_plans')
          .update(payload)
          .eq('id', match.id)
          .select()
          .single();
        if (!uerr) { updated = data; break; }
        lastErr = uerr;
        const msg = (uerr.message || '').toLowerCase();
        const m = msg.match(/could not find the '([^']+)' column/);
        let col = m && m[1];
        if (!col && (uerr.code === 'PGRST204' || msg.includes('pgrst204'))) col = dropOrder[i];
        if (col && col in payload) { delete payload[col]; continue; }
        break;
      }
      if (!updated) {
        console.error(`Failed to update ${t.name}:`, lastErr && lastErr.message);
      } else {
        console.log(`Updated:`, { id: updated.id, plan_name: updated.plan_name, base_price: updated.base_price });
      }
    }

    console.log('\nDone seeding plan descriptions and features.');
  } catch (e) {
    console.error('Seed failed:', e);
    process.exit(1);
  }
}

run();
