/**
 * Get Actual Database Column Names
 */

const supabase = require('../config/supabaseClient');

async function getActualColumns() {
  console.log('========================================');
  console.log('ACTUAL DATABASE COLUMNS');
  console.log('========================================\n');

  const tables = ['agencies', 'leads', 'territories', 'subscriptions'];

  for (const table of tables) {
    try {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .limit(1);

      if (!error && data && data.length > 0) {
        console.log(`\n📋 ${table.toUpperCase()}:`);
        console.log('Columns:', Object.keys(data[0]).join(', '));
        console.log('\nSample data:');
        console.log(JSON.stringify(data[0], null, 2));
      } else if (!error) {
        console.log(`\n📋 ${table.toUpperCase()}: No data`);
      } else {
        console.log(`\n📋 ${table.toUpperCase()}: Error - ${error.message}`);
      }
    } catch (err) {
      console.log(`\n📋 ${table.toUpperCase()}: Error - ${err.message}`);
    }
  }
}

getActualColumns().then(() => process.exit(0)).catch(console.error);
