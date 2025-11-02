/*
  Seed or update a Super Admin user in Supabase `users` table.
  Usage: node backend/scripts/seedSuperAdmin.js [email] [password]
  - Falls back to ADMIN_EMAIL/ADMIN_PASSWORD env vars or defaults.
*/

const bcrypt = require('bcryptjs');
const supabase = require('../config/supabaseClient');

async function main() {
  const email = process.argv[2] || process.env.ADMIN_EMAIL || 'admin@example.com';
  const password = process.argv[3] || process.env.ADMIN_PASSWORD || 'Admin@123';

  console.log(`Seeding super admin: ${email}`);

  // Hash password
  const password_hash = await bcrypt.hash(password, 10);

  // Check if user exists
  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('email', email)
    .limit(1);

  if (existing && existing.length > 0) {
    const id = existing[0].id;
    console.log('User exists. Updating role/password/is_active...');
    const { error } = await supabase
      .from('users')
      .update({
        password_hash,
        role: 'super_admin',
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) throw error;
  } else {
    console.log('Creating new super admin user...');
    const { error } = await supabase
      .from('users')
      .insert([{
        email,
        password_hash,
        role: 'super_admin',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }]);

    if (error) throw error;
  }

  console.log('✅ Super admin ready. You can login with these credentials.');
}

main().catch(err => { console.error('❌ Seed failed:', err.message); process.exit(1); });
