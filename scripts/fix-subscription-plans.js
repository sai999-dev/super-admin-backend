/**
 * Fix Subscription Plans to Match Business Logic
 * 
 * Correct Configuration:
 * - Basic Plan: $99 for 3 zipcodes
 * - Premium Plan: $199 for 7 zipcodes  
 * - Business Plan: $299 for 10 zipcodes
 */

require('dotenv').config({ path: 'config.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixPlans() {
  console.log('========================================');
  console.log('FIXING SUBSCRIPTION PLANS');
  console.log('========================================\n');
  
  // Get all plans
  const { data: plans, error } = await supabase
    .from('subscription_plans')
    .select('*');
  
  if (error) {
    console.error('Error fetching plans:', error);
    return;
  }
  
  for (const plan of plans) {
    const name = plan.name.toLowerCase();
    let updates = null;
    
    if (name.includes('basic')) {
      updates = {
        price_per_unit: 99,
        max_units: 3,
        description: 'Starter plan for new agencies. Includes 3 zipcodes.',
        features: {
          zipcodes: 3,
          features: [
            '3 zipcodes included',
            'Unlimited lead access',
            'Email support',
            'Basic analytics',
            'Monthly area changes'
          ]
        }
      };
      console.log('✅ Basic Plan: $99 for 3 zipcodes');
      
    } else if (name.includes('premium')) {
      updates = {
        price_per_unit: 199,
        max_units: 7,
        description: 'Most popular plan. Includes 7 zipcodes with priority features.',
        features: {
          zipcodes: 7,
          features: [
            '7 zipcodes included',
            'Priority lead notifications',
            'Phone & email support',
            'Advanced analytics',
            'Lead scoring system',
            'Monthly area changes'
          ]
        }
      };
      console.log('✅ Premium Plan: $199 for 7 zipcodes');
      
    } else if (name.includes('business')) {
      updates = {
        name: 'Business Plan', // Fix capitalization
        price_per_unit: 299,
        max_units: 10,
        description: 'Scale plan for growing agencies. Includes 10 zipcodes with premium support.',
        features: {
          zipcodes: 10,
          features: [
            '10 zipcodes included',
            'Exclusive lead access',
            '24/7 priority support',
            'Premium analytics & reporting',
            'Lead export (CSV/Excel)',
            'Custom notifications',
            'Bi-weekly area changes'
          ]
        }
      };
      console.log('✅ Business Plan: $299 for 10 zipcodes');
    }
    
    if (updates) {
      const { error: updateError } = await supabase
        .from('subscription_plans')
        .update(updates)
        .eq('id', plan.id);
      
      if (updateError) {
        console.error(`  ❌ Error updating ${plan.name}:`, updateError.message);
      } else {
        console.log(`  ✅ Updated ${plan.name}`);
      }
    }
  }
  
  console.log('\n========================================');
  console.log('VERIFICATION');
  console.log('========================================\n');
  
  // Verify updates
  const { data: updatedPlans } = await supabase
    .from('subscription_plans')
    .select('name, price_per_unit, max_units')
    .order('price_per_unit', { ascending: true });
  
  updatedPlans.forEach(plan => {
    console.log(`${plan.name}: $${plan.price_per_unit} for ${plan.max_units} zipcodes`);
  });
  
  console.log('\n✅ Plans updated successfully!');
}

fixPlans().catch(console.error);
