/**
 * Script to insert dummy data for Transactions and Invoices tables
 * Run with: node scripts/insert-dummy-financial-data.js
 */

const supabase = require('../config/supabaseClient');

async function insertDummyData() {
  try {
    console.log('🔄 Starting dummy data insertion...\n');

    // Get available agencies
    const { data: agencies, error: agenciesError } = await supabase
      .from('agencies')
      .select('id, business_name')
      .limit(10);

    if (agenciesError) {
      console.error('❌ Error fetching agencies:', agenciesError);
      return;
    }

    if (!agencies || agencies.length === 0) {
      console.error('❌ No agencies found. Please create agencies first.');
      return;
    }

    console.log(`✅ Found ${agencies.length} agencies\n`);

    // Use first 2-3 agencies for dummy data
    const agencyIds = agencies.slice(0, 3).map(a => a.id);
    const today = new Date();
    const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate());
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, today.getDate());

    // ============================================
    // INSERT DUMMY TRANSACTIONS
    // ============================================
    console.log('📊 Inserting dummy transactions...');

    const transactions = [
      // Subscription payments
      {
        agency_id: agencyIds[0],
        transaction_type: 'subscription_payment',
        amount: 99.00,
        status: 'completed',
        payment_method: 'stripe',
        description: 'Monthly subscription payment - Basic Plan',
        created_at: new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        agency_id: agencyIds[0],
        transaction_type: 'subscription_payment',
        amount: 199.00,
        status: 'completed',
        payment_method: 'stripe',
        description: 'Monthly subscription payment - Pro Plan',
        created_at: new Date(today.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        agency_id: agencyIds[1],
        transaction_type: 'subscription_payment',
        amount: 299.00,
        status: 'completed',
        payment_method: 'stripe',
        description: 'Monthly subscription payment - Enterprise Plan',
        created_at: new Date(today.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        agency_id: agencyIds[1],
        transaction_type: 'subscription_payment',
        amount: 99.00,
        status: 'pending',
        payment_method: 'stripe',
        description: 'Monthly subscription payment - Pending',
        created_at: new Date(today.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        agency_id: agencyIds[0],
        transaction_type: 'subscription_payment',
        amount: 199.00,
        status: 'failed',
        payment_method: 'stripe',
        description: 'Monthly subscription payment - Failed',
        failure_reason: 'Card declined',
        created_at: new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString()
      },
      // Credit purchases
      {
        agency_id: agencyIds[0],
        transaction_type: 'credit_purchase',
        amount: 50.00,
        status: 'completed',
        payment_method: 'stripe',
        description: 'Credit purchase - 50 credits',
        created_at: new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        agency_id: agencyIds[1],
        transaction_type: 'credit_purchase',
        amount: 100.00,
        status: 'completed',
        payment_method: 'stripe',
        description: 'Credit purchase - 100 credits',
        created_at: new Date(today.getTime() - 15 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString()
      },
      // Lead purchases
      {
        agency_id: agencyIds[0],
        transaction_type: 'lead_purchase',
        amount: 25.00,
        status: 'completed',
        payment_method: 'stripe',
        description: 'Lead purchase - Single lead',
        created_at: new Date(today.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        agency_id: agencyIds[1],
        transaction_type: 'lead_purchase',
        amount: 75.00,
        status: 'completed',
        payment_method: 'stripe',
        description: 'Lead purchase - 3 leads',
        created_at: new Date(today.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        agency_id: agencyIds[0],
        transaction_type: 'lead_purchase',
        amount: 150.00,
        status: 'completed',
        payment_method: 'stripe',
        description: 'Lead purchase - 6 leads',
        created_at: new Date(today.getTime() - 12 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString()
      }
    ];

    const { data: insertedTransactions, error: transactionsError } = await supabase
      .from('transactions')
      .insert(transactions)
      .select();

    if (transactionsError) {
      console.error('❌ Error inserting transactions:', transactionsError);
    } else {
      console.log(`✅ Inserted ${insertedTransactions?.length || 0} transactions\n`);
    }

    // ============================================
    // INSERT DUMMY INVOICES
    // ============================================
    console.log('📄 Inserting dummy invoices...');

    const invoices = [
      {
        agency_id: agencyIds[0],
        invoice_number: `INV-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}-001`,
        amount_due: 99.00,
        status: 'pending',
        due_date: new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        created_at: new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        agency_id: agencyIds[0],
        invoice_number: `INV-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}-002`,
        amount_due: 199.00,
        status: 'paid',
        due_date: new Date(today.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        created_at: new Date(today.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        agency_id: agencyIds[1],
        invoice_number: `INV-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}-003`,
        amount_due: 299.00,
        status: 'pending',
        due_date: new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(), // Overdue
        created_at: new Date(today.getTime() - 15 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        agency_id: agencyIds[1],
        invoice_number: `INV-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}-004`,
        amount_due: 149.00,
        status: 'paid',
        due_date: new Date(today.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(),
        created_at: new Date(today.getTime() - 20 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        agency_id: agencyIds[0],
        invoice_number: `INV-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}-005`,
        amount_due: 249.00,
        status: 'pending',
        due_date: new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        created_at: new Date(today.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        agency_id: agencyIds[1],
        invoice_number: `INV-${lastMonth.getFullYear()}${String(lastMonth.getMonth() + 1).padStart(2, '0')}-006`,
        amount_due: 99.00,
        status: 'overdue',
        due_date: new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(), // Very overdue
        created_at: new Date(today.getTime() - 45 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        agency_id: agencyIds[0],
        invoice_number: `INV-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}-007`,
        amount_due: 179.00,
        status: 'paid',
        due_date: new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        created_at: new Date(today.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        agency_id: agencyIds[1],
        invoice_number: `INV-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}-008`,
        amount_due: 399.00,
        status: 'pending',
        due_date: new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        created_at: new Date(today.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString()
      }
    ];

    const { data: insertedInvoices, error: invoicesError } = await supabase
      .from('invoices')
      .insert(invoices)
      .select();

    if (invoicesError) {
      console.error('❌ Error inserting invoices:', invoicesError);
      console.error('Error details:', JSON.stringify(invoicesError, null, 2));
    } else {
      console.log(`✅ Inserted ${insertedInvoices?.length || 0} invoices\n`);
    }

    console.log('✅ Dummy data insertion complete!');
    console.log(`\n📊 Summary:`);
    console.log(`   - Transactions: ${insertedTransactions?.length || 0}`);
    console.log(`   - Invoices: ${insertedInvoices?.length || 0}`);

  } catch (error) {
    console.error('❌ Unexpected error:', error);
    console.error(error.stack);
  }
}

// Run the script
insertDummyData()
  .then(() => {
    console.log('\n✅ Script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

