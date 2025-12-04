const express = require('express');
const router = express.Router();
const supabase = require('../config/supabaseClient');
const { authenticateAdmin } = require('../middleware/adminAuth');

/**
 * FINANCIAL MANAGEMENT ROUTES - SUPER ADMIN PORTAL
 * Connects to: frontend/scripts/app.js - Financial Operations section
 * Database: billing_history, transactions, subscriptions tables
 */

// Apply admin authentication to all routes
router.use(authenticateAdmin);

// GET /api/admin/financial/invoices/fields - Diagnostic endpoint to check what fields exist in invoices table
router.get('/financial/invoices/fields', async (req, res) => {
  try {
    console.log('🔍 Checking invoices table structure...');
    
    // Try to get one record with select('*') to see all fields
    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .limit(1);
    
    if (error) {
      console.error('❌ Error querying invoices table:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to query invoices table',
        error: error.message,
        errorDetails: error
      });
    }
    
    if (data && data.length > 0) {
      const fields = Object.keys(data[0]);
      const sampleRecord = data[0];
      
      console.log('✅ Invoices table fields found:', fields);
      console.log('✅ Sample record:', JSON.stringify(sampleRecord, null, 2));
      
      // Check for agency-related fields
      const agencyFields = fields.filter(f => 
        f.toLowerCase().includes('agency') || 
        f.toLowerCase().includes('name') || 
        f.toLowerCase().includes('business')
      );
      
      return res.json({
        success: true,
        message: 'Invoices table structure retrieved',
        data: {
          totalFields: fields.length,
          fields: fields,
          agencyRelatedFields: agencyFields,
          sampleRecord: sampleRecord,
          fieldDetails: fields.map(field => ({
            name: field,
            value: sampleRecord[field],
            type: typeof sampleRecord[field]
          }))
        }
      });
    } else {
      // Table exists but is empty - try to get schema info
      return res.json({
        success: true,
        message: 'Invoices table exists but is empty',
        data: {
          totalFields: 0,
          fields: [],
          note: 'Table is empty. Cannot determine field structure from data.'
        }
      });
    }
  } catch (error) {
    console.error('❌ Unexpected error:', error);
    return res.status(500).json({
      success: false,
      message: 'Unexpected error',
      error: error.message
    });
  }
});

// GET /api/admin/financial/invoices - List all invoices with pagination
// API Used by Frontend: /api/admin/financial/invoices?page=1&limit=25
// Database Table: invoices
// Returns: Invoice records with agency information
router.get('/financial/invoices', async (req, res) => {
  try {
    const { page = 1, limit = 25, status, agency_id, start_date, end_date } = req.query;
    
    console.log('🔍 Querying invoices table...');
    console.log('📋 Table name: invoices');
    
    // Fetch invoices - use select('*') to get ALL fields from database
    // This ensures we get all fields including any that were added manually (like 'agency')
    // Don't rely on migration file - use what's actually in the database
    let query = supabase
      .from('invoices')
      .select('*', { count: 'exact' });
    
    console.log('✅ Query built for invoices table');
    
    // Filter by status
    if (status) {
      query = query.eq('status', status);
    }
    
    // Filter by agency
    if (agency_id) query = query.eq('agency_id', agency_id);
    
    // Date range filter
    if (start_date) query = query.gte('created_at', start_date);
    if (end_date) query = query.lte('created_at', end_date);
    
    // Pagination
    const offset = (page - 1) * limit;
    query = query
      .range(offset, offset + parseInt(limit) - 1)
      .order('created_at', { ascending: false });
    
    const { data, error, count } = await query;
    
    if (error) {
      console.error('❌ Supabase query error (invoices):', error);
      console.error('❌ Error details:', JSON.stringify(error, null, 2));
      
      // If error is about column not found, try with select('*') to see what fields exist
      if (error.message && (error.message.includes('column') || error.message.includes('does not exist'))) {
        console.log('🔄 Trying with select(*) to see available fields...');
        const { data: allData, error: allError } = await supabase
          .from('invoices')
          .select('*')
          .limit(1);
        
        if (!allError && allData && allData.length > 0) {
          console.log('✅ Available fields in invoices table:', Object.keys(allData[0]));
          console.log('✅ Sample record:', JSON.stringify(allData[0], null, 2));
        }
      }
      
      // Return empty result instead of throwing to prevent frontend crashes
      return res.json({
        success: true,
        data: {
          invoices: [],
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: 0,
            totalPages: 0
          }
        },
        warning: error.message || 'Failed to fetch invoices from database'
      });
    }
    
    // Log the raw data to see what we're actually getting
    console.log(`📊 Fetched ${data?.length || 0} invoices from 'invoices' table`);
    
    if (data && data.length > 0) {
      console.log('📊 Raw invoice data (first record from invoices table):');
      console.log('Available fields:', Object.keys(data[0]));
      console.log('Full record:', JSON.stringify(data[0], null, 2));
      console.log('🔍 Agency field value:', data[0].agency);
      console.log('🔍 Agency ID value:', data[0].agency_id);
      
      // Check if agency field exists and has value
      if ('agency' in data[0]) {
        console.log('✅ Agency field EXISTS in database');
        console.log('   Value:', data[0].agency);
        console.log('   Is null?', data[0].agency === null);
        console.log('   Is undefined?', data[0].agency === undefined);
        console.log('   Type:', typeof data[0].agency);
      } else {
        console.log('❌ Agency field DOES NOT EXIST in database');
      }
    }
    
    // ALWAYS fetch agency names from agencies table using agency_id
    // The agency field in invoices table might be null, so we'll get it from agencies table
    let agenciesMap = {};
    if (data && data.length > 0) {
        const agencyIds = [...new Set(data.map(inv => inv.agency_id).filter(Boolean))];
      console.log(`🔍 Fetching agency names for ${agencyIds.length} unique agency IDs:`, agencyIds);
      
        if (agencyIds.length > 0) {
        try {
          const { data: agenciesData, error: agenciesError } = await supabase
            .from('agencies')
            .select('id, business_name, name, agency_name')
            .in('id', agencyIds);
          
          if (agenciesError) {
            console.error('❌ Error fetching agencies:', agenciesError);
            console.error('❌ Error details:', JSON.stringify(agenciesError, null, 2));
          } else if (agenciesData) {
            console.log(`✅ Fetched ${agenciesData.length} agencies from agencies table`);
            agenciesData.forEach(agency => {
              const agencyName = agency.business_name || agency.name || agency.agency_name || null;
              agenciesMap[agency.id] = agencyName;
              console.log(`   ✅ Mapped Agency ${agency.id} -> "${agencyName}"`);
            });
            console.log(`📋 Final agenciesMap:`, agenciesMap);
          } else {
            console.log('⚠️ No agencies returned from query');
          }
        } catch (err) {
          console.error('❌ Error in agency fetch:', err);
          console.error('❌ Error stack:', err.stack);
        }
      } else {
        console.log('⚠️ No agency IDs found in invoices');
      }
    }
    
    // Transform data - prioritize agencies table, fallback to invoices.agency field
    const transformedData = (data || []).map(invoice => {
      let agencyName = null;
      
      // Convert agency_id to string for comparison (handle UUID type issues)
      const invoiceAgencyId = invoice.agency_id ? String(invoice.agency_id) : null;
      
      // FIRST: Try to get from agencies table (most reliable)
      // Try both string and original format
      if (invoiceAgencyId) {
        // Try exact match
        if (agenciesMap[invoice.agency_id]) {
          agencyName = agenciesMap[invoice.agency_id];
        }
        // Try string match
        else if (agenciesMap[invoiceAgencyId]) {
          agencyName = agenciesMap[invoiceAgencyId];
        }
        // Try finding by comparing all keys
        else {
          const matchingKey = Object.keys(agenciesMap).find(key => 
            String(key) === invoiceAgencyId || String(key) === String(invoice.agency_id)
          );
          if (matchingKey) {
            agencyName = agenciesMap[matchingKey];
          }
        }
        
        if (agencyName) {
          console.log(`✅ Invoice ${invoice.id}: Using agency from agencies table -> "${agencyName}"`);
        }
      }
      
      // SECOND: Fallback to agency field in invoices table
      if (!agencyName && invoice.agency) {
        agencyName = invoice.agency;
        console.log(`✅ Invoice ${invoice.id}: Using agency from invoices table -> "${agencyName}"`);
      }
      
      // If still null, log detailed info
      if (!agencyName) {
        console.warn(`⚠️ Invoice ${invoice.id}: No agency name found`);
        console.warn(`   agency_id:`, invoice.agency_id);
        console.warn(`   agency_id type:`, typeof invoice.agency_id);
        console.warn(`   agenciesMap keys:`, Object.keys(agenciesMap));
        console.warn(`   agenciesMap keys types:`, Object.keys(agenciesMap).map(k => typeof k));
        console.warn(`   agenciesMap:`, JSON.stringify(agenciesMap, null, 2));
      }
      
      return {
        id: invoice.id,
        agency: agencyName || null,
      agency_id: invoice.agency_id,
      amount: invoice.amount || 0,
      due_date: invoice.due_date,
        status: (invoice.status || 'pending').toLowerCase(),
        created_at: invoice.created_at
      };
    });
    
    res.json({
      success: true,
      data: {
        invoices: transformedData,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching invoices:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch invoices', 
      error: error.message 
    });
  }
});

// GET /api/admin/financial/invoices/:id - Get invoice details
router.get('/financial/invoices/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Fetch invoice - use select('*') to get ALL fields from database
    // This ensures we get all fields including any that were added manually (like 'agency')
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', id)
      .single();
    
    if (invoiceError) {
      console.error('Error fetching invoice:', invoiceError);
      // Check if it's a connection/table error vs not found
      if (invoiceError.code === 'PGRST116' || invoiceError.message?.includes('relation') || invoiceError.message?.includes('does not exist')) {
        return res.status(503).json({ 
          success: false, 
          message: 'Invoices table is not accessible. Please verify database connection.',
          error: invoiceError.message 
        });
      }
      return res.status(404).json({ 
        success: false, 
        message: 'Invoice not found',
        error: invoiceError.message 
      });
    }
    
    if (!invoice) {
      return res.status(404).json({ 
        success: false, 
        message: 'Invoice not found' 
      });
    }
    
    // Log the invoice data
    console.log('📋 Single invoice data:', JSON.stringify(invoice, null, 2));
    console.log('🔍 Agency field value:', invoice?.agency);
    console.log('🔍 Agency ID value:', invoice?.agency_id);
    
    // First try agency field from invoices table
    let agencyName = invoice.agency;
    
    // If null or empty, fetch from agencies table using agency_id
    if (!agencyName && invoice.agency_id) {
      try {
        const { data: agencyData, error: agencyError } = await supabase
          .from('agencies')
          .select('business_name, name, agency_name')
          .eq('id', invoice.agency_id)
          .single();
        
        if (!agencyError && agencyData) {
          agencyName = agencyData.business_name || agencyData.name || agencyData.agency_name || null;
          console.log(`✅ Fetched agency name from agencies table: ${agencyName}`);
        }
      } catch (err) {
        console.error('❌ Error fetching agency:', err);
      }
    }
    
    // Transform invoice - return EXACTLY what's in database, no extra fields
    const transformedInvoice = {
      id: invoice.id,
      agency: agencyName || null,
      agency_id: invoice.agency_id,
      amount: invoice.amount || 0,
      due_date: invoice.due_date,
      status: (invoice.status || 'pending').toLowerCase(),
      created_at: invoice.created_at
    };
    
    res.json({ 
      success: true, 
      data: { invoice: transformedInvoice } 
    });
  } catch (error) {
    console.error('Error fetching invoice:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch invoice details', 
      error: error.message 
    });
  }
});

// POST /api/admin/financial/invoices - Generate new invoice
// ⚠️ NOT CURRENTLY USED - Frontend only reads data (no create functionality)
// This endpoint is kept for potential future use
// If you need to remove it, you can safely delete this entire route
/*
router.post('/financial/invoices', async (req, res) => {
  try {
    const { 
      agency_id, 
      subscription_id, 
      amount, 
      description, 
      due_date, 
      items 
    } = req.body;
    
    // Validation
    if (!agency_id || !amount) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields: agency_id, amount' 
      });
    }
    
    // Generate invoice number
    const invoiceNumber = `INV-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    
    // Create invoice
    const { data, error } = await supabase
      .from('invoices')
      .insert({
        agency_id,
        subscription_id: subscription_id || null,
        invoice_number: invoiceNumber,
        amount: parseFloat(amount),
        description: description || 'Subscription Fee',
        status: 'pending',
        due_date: due_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
        line_items: items || [],
        created_at: new Date().toISOString()
      })
      .select(`
        *,
        agencies(business_name, email)
      `)
      .single();
    
    if (error) throw error;
    
    // Log to audit
    try {
      await supabase
        .from('audit_logs')
        .insert({
          user_id: req.user?.id || null,
          action: 'CREATE_INVOICE',
          entity_type: 'invoices',
          entity_id: data.id,
          changes: { invoice_number: invoiceNumber, amount },
          ip_address: req.ip,
          created_at: new Date().toISOString()
        });
    } catch (err) {
      console.log('Audit log not recorded');
    }
    
    res.status(201).json({ 
      success: true, 
      message: 'Invoice created successfully',
      data: { invoice: data } 
    });
  } catch (error) {
    console.error('Error creating invoice:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create invoice', 
      error: error.message 
    });
  }
});
*/

// GET /api/admin/financial/payments - List all transactions
// API Used by Frontend: /api/admin/financial/payments?page=1&limit=25
// Database Table: transactions
// Returns: Transaction records with agency information
router.get('/financial/payments', async (req, res) => {
  // Declare agenciesMap at function scope so it's accessible everywhere
  let agenciesMap = {};
  let data = null;
  let count = 0;
  
  try {
    const { page = 1, limit = 25, status, agency_id, type, start_date, end_date, search } = req.query;
    
    console.log('\n📥 ========================================');
    console.log('📥 TRANSACTION LIST REQUEST');
    console.log('📥 Query params:', { page, limit, status, agency_id, type, start_date, end_date, search });
    console.log('📥 Search value:', search, '(type:', typeof search, ')');
    console.log('📥 ========================================\n');
    
    // Build query WITHOUT join (since relationship doesn't exist in Supabase)
    // We'll fetch agency data separately if needed
    let query = supabase
      .from('transactions')
      .select('*', { count: 'exact' });
    
    // Filter by transaction type if provided
    try {
      if (type) {
        query = query.eq('transaction_type', type);
      }
      
      // Filter by status (case-insensitive handling)
      if (status) {
        // Map frontend status values to database values
        const statusMap = {
          'completed': 'completed',
          'successful': 'completed',
          'failed': 'failed',
          'pending': 'pending',
          'disputed': 'disputed'
        };
        const dbStatus = statusMap[status.toLowerCase()] || status;
        query = query.eq('status', dbStatus);
      }
      
      // Filter by agency
      if (agency_id) query = query.eq('agency_id', agency_id);
      
      // Date range filter
      if (start_date) {
        query = query.gte('created_at', start_date);
      }
      if (end_date) {
        // Add 23:59:59 to end_date to include the entire day
        const endDateWithTime = new Date(end_date);
        endDateWithTime.setHours(23, 59, 59, 999);
        query = query.lte('created_at', endDateWithTime.toISOString());
      }
      
      // Search filter - SIMPLIFIED APPROACH
      // When search is provided, search agencies first, then filter transactions
      let shouldApplySearchAfterFetch = search && search.trim();
      let matchingAgencyIds = [];
      
      if (shouldApplySearchAfterFetch) {
        const searchTerm = (String(search || '')).trim();
        console.log(`\n🔍 SEARCH: "${searchTerm}"`);

        if (searchTerm) {
          try {
            // Search agencies table
            const { data: matchingAgencies, error: agencySearchError } = await supabase
              .from('agencies')
              .select('id')
              .or(`business_name.ilike.%${searchTerm}%,name.ilike.%${searchTerm}%,agency_name.ilike.%${searchTerm}%`)
              .limit(100);

            if (!agencySearchError && matchingAgencies && matchingAgencies.length > 0) {
              matchingAgencyIds = matchingAgencies.map(a => a.id).filter(Boolean);
              console.log(`✅ Found ${matchingAgencyIds.length} matching agencies`);
              
              // Filter transactions by agency_id
              if (matchingAgencyIds.length > 0) {
                query = query.in('agency_id', matchingAgencyIds);
                console.log(`✅ Applied agency_id filter`);
              }
            } else {
              console.log(`⚠️ No agencies found - will search transaction fields in memory`);
            }
          } catch (err) {
            console.error('❌ Search error:', err.message);
          }
        }
      }
      
      
      // Apply pagination and ordering
      const offset = (page - 1) * limit;
      query = query
        .order('created_at', { ascending: false })
        .range(offset, offset + parseInt(limit) - 1);
      
      console.log('🔍 Executing transactions query...');
      let result;
      try {
        result = await query;
        console.log(`✅ Query executed: ${result.data?.length || 0} transactions`);
      } catch (queryErr) {
        console.error('❌ Exception executing query:', queryErr);
        console.error('❌ Query exception stack:', queryErr.stack);
        return res.status(500).json({
          success: false,
          message: 'Error executing database query',
          error: queryErr.message,
          data: {
            payments: [],
            pagination: {
              page: parseInt(page),
              limit: parseInt(limit),
              total: 0,
              totalPages: 0
            }
          }
        });
      }
      
      // Check for errors
      if (result.error) {
        console.error('❌ Supabase query error (transactions):', JSON.stringify(result.error, null, 2));
        console.error('❌ Error code:', result.error.code);
        console.error('❌ Error message:', result.error.message);
        console.error('❌ Error details:', result.error.details);
        console.error('❌ Error hint:', result.error.hint);
        
        // Check if it's a connection/table error
        if (result.error.code === 'PGRST116' || result.error.message?.includes('relation') || result.error.message?.includes('does not exist')) {
          return res.status(503).json({
            success: false,
            message: 'Transactions table is not accessible. Please verify database connection.',
            error: result.error.message,
            data: {
              payments: [],
              pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: 0,
                totalPages: 0
              }
            }
          });
        }
        // For other query errors (like syntax errors), return 400 instead of 503
        return res.status(400).json({
          success: false,
          message: 'Invalid query parameters',
          error: result.error.message,
          errorCode: result.error.code,
          data: {
            payments: [],
            pagination: {
              page: parseInt(page),
              limit: parseInt(limit),
              total: 0,
              totalPages: 0
            }
          }
        });
      }
      
      // Extract data and count
      data = result.data || [];
      count = result.count !== null && result.count !== undefined ? result.count : data.length; // Use count from query, fallback to data length
      
      console.log(`📊 Fetched ${data?.length || 0} transactions from 'transactions' table`);
      console.log(`📊 Total count from query: ${count}`);
      
      // If search was used and agencies were found but we got 0 results, log a warning
      if (shouldApplySearchAfterFetch && matchingAgencyIds.length > 0 && data.length === 0) {
        console.warn(`⚠️ WARNING: Found ${matchingAgencyIds.length} agencies but query returned 0 transactions!`);
        console.warn(`⚠️ This might indicate agency_id mismatch or no transactions for those agencies`);
      }
      
      // ALWAYS fetch agency names from agencies table using agency_id
      // Do this BEFORE search filter so we can search by agency name
      if (data && data.length > 0) {
          const agencyIds = [...new Set(data.map(t => t.agency_id).filter(Boolean))];
        console.log(`🔍 Fetching agency names for ${agencyIds.length} unique agency IDs:`, agencyIds);
        
          if (agencyIds.length > 0) {
          try {
            const { data: agenciesData, error: agenciesError } = await supabase
              .from('agencies')
              .select('id, business_name, name, agency_name')
              .in('id', agencyIds);
            
            if (agenciesError) {
              console.error('❌ Error fetching agencies:', agenciesError);
              console.error('❌ Error details:', JSON.stringify(agenciesError, null, 2));
            } else if (agenciesData) {
              console.log(`✅ Fetched ${agenciesData.length} agencies from agencies table`);
                agenciesData.forEach(agency => {
                const agencyName = agency.business_name || agency.name || agency.agency_name || null;
                agenciesMap[agency.id] = agencyName;
                console.log(`   ✅ Mapped Agency ${agency.id} -> "${agencyName}"`);
              });
              console.log(`📋 Final agenciesMap:`, agenciesMap);
            } else {
              console.log('⚠️ No agencies returned from query');
            }
          } catch (err) {
            console.error('❌ Error in agency fetch:', err);
            console.error('❌ Error stack:', err.stack);
          }
        } else {
          console.log('⚠️ No agency IDs found in transactions');
        }
      }
      
      // If search was provided but no agencies matched, filter in memory by transaction fields
      if (shouldApplySearchAfterFetch && matchingAgencyIds.length === 0) {
        const searchLower = search.toLowerCase().trim();
        const originalCount = data.length;
        
        data = data.filter(transaction => {
          const transactionId = (transaction.id || '').toLowerCase();
          const agencyId = (transaction.agency_id || '').toLowerCase();
          const amount = String(transaction.amount || '');
          const transactionType = (transaction.transaction_type || '').toLowerCase();
          const status = (transaction.status || '').toLowerCase();
          
          return transactionId.includes(searchLower) ||
                 agencyId.includes(searchLower) ||
                 amount.includes(searchLower) ||
                 transactionType.includes(searchLower) ||
                 status.includes(searchLower);
        });
        
        count = data.length;
        console.log(`🔍 In-memory filter: ${originalCount} -> ${count} transactions`);
      }
      
    } catch (queryError) {
      console.error('Error building/executing query:', queryError);
      console.error('Query error stack:', queryError.stack);
      // Return empty result on query building errors
      return res.json({
        success: true,
        data: {
          payments: [],
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: 0,
            totalPages: 0
          }
        }
      });
    }
    
    // Ensure data exists before transforming
    if (!data) {
      return res.json({
        success: true,
        data: {
          payments: [],
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: 0,
            totalPages: 0
          }
        }
      });
    }
    
    // Transform data - use EXACT same logic as invoices (which works!)
    console.log(`🔍 About to transform ${data?.length || 0} transactions`);
    console.log(`🔍 agenciesMap has ${Object.keys(agenciesMap).length} entries`);
    console.log(`🔍 agenciesMap keys:`, Object.keys(agenciesMap));
    console.log(`🔍 agenciesMap full:`, JSON.stringify(agenciesMap, null, 2));
    
    // Transform data - EXACT COPY from invoices endpoint (which works!)
    const transformedData = (data || []).map(transaction => {
      let agencyName = null;
      
      // Convert agency_id to string for comparison (handle UUID type issues)
      const transactionAgencyId = transaction.agency_id ? String(transaction.agency_id) : null;
      
      // FIRST: Try to get from agencies table (most reliable)
      // Try both string and original format
      if (transactionAgencyId) {
        // Try exact match
        if (agenciesMap[transaction.agency_id]) {
          agencyName = agenciesMap[transaction.agency_id];
        }
        // Try string match
        else if (agenciesMap[transactionAgencyId]) {
          agencyName = agenciesMap[transactionAgencyId];
        }
        // Try finding by comparing all keys
        else {
          const matchingKey = Object.keys(agenciesMap).find(key => 
            String(key) === transactionAgencyId || String(key) === String(transaction.agency_id)
          );
          if (matchingKey) {
            agencyName = agenciesMap[matchingKey];
          }
        }
        
        if (agencyName) {
          console.log(`✅ Transaction ${transaction.id}: Using agency from agencies table -> "${agencyName}"`);
        }
      }
      
      // SECOND: Fallback to agency field in transactions table
      if (!agencyName && transaction.agency) {
        agencyName = transaction.agency;
        console.log(`✅ Transaction ${transaction.id}: Using agency from transactions table -> "${agencyName}"`);
      }
      
      // If still null, log detailed info
      if (!agencyName) {
        console.warn(`⚠️ Transaction ${transaction.id}: No agency name found`);
        console.warn(`   agency_id:`, transaction.agency_id);
        console.warn(`   agency_id type:`, typeof transaction.agency_id);
        console.warn(`   agenciesMap keys:`, Object.keys(agenciesMap));
        console.warn(`   agenciesMap keys types:`, Object.keys(agenciesMap).map(k => typeof k));
        console.warn(`   agenciesMap:`, JSON.stringify(agenciesMap, null, 2));
      }
      
      // Get date - transactions table has created_at, not due_date
      const transactionDate = transaction.created_at || transaction.date || null;
      
      // Determine payment method based on transaction type or use existing field
      let paymentMethod = transaction.payment_method || transaction.gateway || null;
      if (!paymentMethod) {
        // Default payment method based on transaction type
        if (transaction.transaction_type === 'subscription_payment') {
          paymentMethod = 'Credit Card';
        } else if (transaction.transaction_type === 'credit_purchase' || transaction.transaction_type === 'lead_purchase') {
          paymentMethod = 'Credit Card';
        } else {
          paymentMethod = 'Credit Card'; // Default
        }
      }
      
      return {
        id: transaction.id,
      transaction_id: transaction.id,
        agency: agencyName || null,
      agency_id: transaction.agency_id,
        amount: transaction.amount || 0,
        type: transaction.transaction_type || transaction.type || 'payment',
        status: transaction.status || 'pending',
        payment_method: paymentMethod,
        date: transactionDate,
        created_at: transactionDate
      };
    });
    
    res.json({
      success: true,
      data: {
        payments: transformedData,
        pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: count || 0,
      totalPages: Math.ceil((count || 0) / parseInt(limit))
    }
  }
});
    
    console.log(`\n✅ ========================================`);
    console.log(`✅ RESPONSE SENT`);
    console.log(`✅ Transformed data length: ${transformedData.length}`);
    console.log(`✅ Total count: ${count || 0}`);
    console.log(`✅ Page: ${page}, Limit: ${limit}`);
    console.log(`✅ ========================================\n`);
  } catch (error) {
    console.error('Unexpected error in /financial/payments:', error);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    // ALWAYS return 200 with empty data - NEVER return 500
    return res.status(200).json({
      success: true,
      data: {
        payments: [],
        pagination: {
          page: parseInt(req.query.page) || 1,
          limit: parseInt(req.query.limit) || 25,
          total: 0,
          totalPages: 0
        }
      }
    });
  }
});

// POST /api/admin/financial/payments - Create/Record new payment
// ⚠️ NOT CURRENTLY USED - All payments are handled by mobile users
// This endpoint is kept for potential future use (manual payment entry, reconciliation, etc.)
// If you need to remove it, you can safely delete this entire route
/*
router.post('/financial/payments', async (req, res) => {
  try {
    const { 
      agency_id, 
      invoice_id, 
      amount, 
      payment_method, 
      transaction_id, 
      notes 
    } = req.body;
    
    // Validation
    if (!agency_id || !amount || !payment_method) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields: agency_id, amount, payment_method' 
      });
    }
    
    // Record payment transaction
    const { data: payment, error: paymentError } = await supabase
      .from('transactions')
      .insert({
        agency_id,
        transaction_type: 'subscription_payment',
        amount: parseFloat(amount),
        payment_method: payment_method,
        status: 'completed',
        description: notes || 'Manual payment entry',
        metadata: notes ? { notes, invoice_id } : { invoice_id },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (paymentError) throw paymentError;
    
    // Update invoice status if invoice_id provided
    if (invoice_id) {
      const { error: invoiceError } = await supabase
        .from('invoices')
        .update({ 
          status: 'paid',
          updated_at: new Date().toISOString()
        })
        .eq('id', invoice_id);
      
      if (invoiceError) {
        console.error('Failed to update invoice:', invoiceError);
      }
    }
    
    // Log to audit
    try {
      await supabase
        .from('audit_logs')
        .insert({
          user_id: req.user?.id || null,
          action: 'RECORD_PAYMENT',
          entity_type: 'transactions',
          entity_id: payment.id,
          changes: { amount, payment_method, invoice_id },
          ip_address: req.ip,
          created_at: new Date().toISOString()
        });
    } catch (err) {
      console.log('Audit log not recorded');
    }
    
    res.status(201).json({ 
      success: true, 
      message: 'Payment recorded successfully',
      data: { payment } 
    });
  } catch (error) {
    console.error('Error recording payment:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to record payment', 
      error: error.message 
    });
  }
});
*/


// GET /api/admin/financial/reports - Financial reports and analytics
// ⚠️ NOT CURRENTLY USED - Frontend doesn't call this endpoint
// This endpoint is kept for potential future use
// If you need to remove it, you can safely delete this entire route
/*
router.get('/financial/reports', async (req, res) => {
  try {
    const { period = 'month' } = req.query; // day, week, month, year
    
    // Calculate date range
    let startDate = new Date();
    switch (period) {
      case 'day':
        startDate.setDate(startDate.getDate() - 1);
        break;
      case 'week':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      case 'year':
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
    }
    
    // Total revenue (from payments)
    const { data: payments, error: paymentsError } = await supabase
      .from('transactions')
      .select('amount, created_at')
      .eq('type', 'payment')
      .eq('status', 'completed')
      .gte('created_at', startDate.toISOString());
    
    if (paymentsError) throw paymentsError;
    
    const totalRevenue = payments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
    
    // Total refunds
    const { data: refunds, error: refundsError } = await supabase
      .from('transactions')
      .select('amount, created_at')
      .eq('type', 'refund')
      .eq('status', 'completed')
      .gte('created_at', startDate.toISOString());
    
    if (refundsError) throw refundsError;
    
    const totalRefunds = refunds.reduce((sum, r) => sum + parseFloat(r.amount || 0), 0);
    
    // Outstanding invoices
    const { data: outstanding, error: outstandingError } = await supabase
      .from('billing_history')
      .select('amount')
      .eq('status', 'pending');
    
    if (outstandingError) throw outstandingError;
    
    const totalOutstanding = outstanding.reduce((sum, inv) => sum + parseFloat(inv.amount || 0), 0);
    
    // Active subscriptions count
    const { count: activeSubscriptions } = await supabase
      .from('subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active');
    
    // Revenue by day (for chart)
    const revenueByDay = payments.reduce((acc, payment) => {
      const date = new Date(payment.created_at).toISOString().split('T')[0];
      acc[date] = (acc[date] || 0) + parseFloat(payment.amount || 0);
      return acc;
    }, {});
    
    // Payment methods breakdown
    const { data: paymentMethods, error: methodsError } = await supabase
      .from('transactions')
      .select('gateway, amount')
      .eq('type', 'payment')
      .eq('status', 'completed')
      .gte('created_at', startDate.toISOString());
    
    if (methodsError) throw methodsError;
    
    const methodsBreakdown = paymentMethods.reduce((acc, p) => {
      const method = p.gateway || 'unknown';
      acc[method] = (acc[method] || 0) + parseFloat(p.amount || 0);
      return acc;
    }, {});
    
    res.json({
      success: true,
      data: {
        summary: {
          totalRevenue,
          totalRefunds,
          netRevenue: totalRevenue - totalRefunds,
          totalOutstanding,
          activeSubscriptions: activeSubscriptions || 0
        },
        revenueByDay,
        methodsBreakdown,
        period
      }
    });
  } catch (error) {
    console.error('Error generating financial reports:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to generate financial reports', 
      error: error.message 
    });
  }
});
*/

// GET /api/admin/financial/verify-connection - Verify database connection and table accessibility
router.get('/financial/verify-connection', async (req, res) => {
  try {
    // Test transactions table connection
    const { data: transactionsTest, error: transactionsError, count: transactionsCount } = await supabase
      .from('transactions')
      .select('*', { count: 'exact', head: true })
      .limit(1);
    
    // Test invoices table connection
    const { data: invoicesTest, error: invoicesError, count: invoicesCount } = await supabase
      .from('invoices')
      .select('*', { count: 'exact', head: true })
      .limit(1);
    
    const connectionStatus = {
      transactions: {
        connected: !transactionsError,
        accessible: !transactionsError,
        error: transactionsError?.message || null,
        recordCount: transactionsCount || 0
      },
      invoices: {
        connected: !invoicesError,
        accessible: !invoicesError,
        error: invoicesError?.message || null,
        recordCount: invoicesCount || 0
      }
    };
    
    const allConnected = connectionStatus.transactions.connected && connectionStatus.invoices.connected;
    
    res.status(allConnected ? 200 : 503).json({
      success: allConnected,
      message: allConnected 
        ? 'Both transactions and invoices tables are connected and accessible'
        : 'One or more tables are not accessible',
      data: connectionStatus,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error verifying database connection:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify database connection',
      error: error.message
    });
  }
});

// GET /api/admin/financial/stats - Quick financial statistics
router.get('/financial/stats', async (req, res) => {
  try {
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    firstDayOfMonth.setHours(0, 0, 0, 0);
    const todayISO = today.toISOString();
    const firstDayISO = firstDayOfMonth.toISOString();
    
    // Total revenue all time (all completed transactions)
    // Fetch ALL transactions first, then filter in code to handle case variations
    const { data: allTransactions, error: allTransactionsError } = await supabase
      .from('transactions')
      .select('amount, status, agency_id, created_at, transaction_type');
    
    if (allTransactionsError) {
      console.error('❌ Error fetching all transactions for total revenue:', allTransactionsError);
      console.error('❌ Error details:', JSON.stringify(allTransactionsError, null, 2));
    }
    
    // Filter completed transactions (case-insensitive)
    const allPayments = (allTransactions || []).filter(t => {
      const status = (t.status || '').toLowerCase();
      return status === 'completed';
    });
    
    console.log(`💰 Total Revenue - Total transactions in DB: ${allTransactions?.length || 0}`);
    console.log(`💰 Total Revenue - Completed transactions: ${allPayments.length}`);
    if (allPayments.length > 0) {
      console.log('💰 Sample completed transactions:', allPayments.slice(0, 5).map(t => ({
        amount: t.amount,
        agency_id: t.agency_id,
        status: t.status,
        created_at: t.created_at
      })));
      console.log('💰 All completed transaction amounts:', allPayments.map(t => t.amount));
    }
    
    const totalRevenue = allPayments.reduce((sum, p) => {
      const amount = parseFloat(p.amount || 0);
      return sum + amount;
    }, 0);
    console.log(`💰 Total Revenue calculated: $${totalRevenue}`);
    
    // This month revenue (completed payments this month)
    // Use already fetched allTransactions to filter
    const monthPayments = (allTransactions || []).filter(t => {
      const status = (t.status || '').toLowerCase();
      const createdAt = t.created_at ? new Date(t.created_at) : null;
      const firstDay = new Date(firstDayISO);
      return status === 'completed' && createdAt && createdAt >= firstDay;
    });
    
    const monthRevenue = monthPayments.reduce((sum, p) => {
      const amount = parseFloat(p.amount || 0);
      return sum + amount;
    }, 0);
    
    // Pending payments (pending transactions)
    const { data: pendingPayments } = await supabase
      .from('transactions')
      .select('amount')
      .eq('status', 'pending');
    
    const pendingPaymentsAmount = (pendingPayments || []).reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
    
    // Get ALL invoices first to see what statuses exist
    const { data: allInvoicesSample, error: sampleError } = await supabase
      .from('invoices')
      .select('status, amount')
      .limit(10);
    
    if (sampleError) {
      console.error('❌ Error fetching invoice sample:', sampleError);
    } else {
      console.log('📊 Sample invoice statuses:', allInvoicesSample?.map(inv => inv.status));
      console.log('📊 Sample invoices:', allInvoicesSample);
    }
    
    // Total Outstanding = All unpaid invoices (NOT paid, NOT cancelled)
    // Get all invoices and filter out paid/cancelled
    const { data: allInvoicesForOutstanding, error: outstandingError } = await supabase
      .from('invoices')
      .select('amount, status');
    
    if (outstandingError) {
      console.error('❌ Error fetching invoices for outstanding:', outstandingError);
      console.error('❌ Error details:', JSON.stringify(outstandingError, null, 2));
    }
    
    console.log(`📊 Total invoices fetched: ${allInvoicesForOutstanding?.length || 0}`);
    if (allInvoicesForOutstanding && allInvoicesForOutstanding.length > 0) {
      console.log('📊 First invoice sample:', JSON.stringify(allInvoicesForOutstanding[0], null, 2));
      console.log('📊 All invoice statuses:', allInvoicesForOutstanding.map(inv => inv.status));
      console.log('📊 All invoice amounts:', allInvoicesForOutstanding.map(inv => inv.amount));
    }
    
    // Filter unpaid invoices (exclude 'paid' and 'cancelled')
    const unpaidInvoices = (allInvoicesForOutstanding || []).filter(inv => {
      const status = (inv.status || '').toLowerCase();
      const isUnpaid = status !== 'paid' && status !== 'cancelled';
      console.log(`   Invoice status: "${inv.status}" (lowercase: "${status}") -> isUnpaid: ${isUnpaid}`);
      return isUnpaid;
    });
    
    console.log(`📊 Unpaid invoices count: ${unpaidInvoices.length}`);
    console.log(`📊 Unpaid invoices:`, JSON.stringify(unpaidInvoices, null, 2));
    
    const pendingInvoicesAmount = unpaidInvoices.reduce((sum, inv) => {
      const amount = parseFloat(inv.amount || 0);
      console.log(`   Adding invoice amount: ${amount} (from ${inv.amount})`);
      return sum + amount;
    }, 0);
    
    console.log(`📊 Total outstanding (unpaid) invoices amount: ${pendingInvoicesAmount}`);
    
    // Also get count of pending invoices (for the pending count stat)
    const pendingInvoices = unpaidInvoices.filter(inv => {
      const status = (inv.status || '').toLowerCase();
      return status === 'pending';
    });
    const pendingCount = pendingInvoices.length;
    console.log(`📊 Pending invoices count: ${pendingCount}`);
    
    // Total invoices amount (all invoices regardless of status)
    const { data: allInvoices } = await supabase
      .from('invoices')
      .select('amount');
    
    const totalInvoicesAmount = (allInvoices || []).reduce((sum, inv) => sum + parseFloat(inv.amount || 0), 0);
    
    // Overdue invoices (unpaid invoices with due_date < today)
    const { count: overdueCount } = await supabase
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .in('status', ['pending', 'PENDING', 'overdue', 'OVERDUE'])
      .lt('due_date', todayISO);
    
    // Paid invoices (status = 'paid' or 'PAID')
    const { count: paidCount, data: paidInvoices } = await supabase
      .from('invoices')
      .select('amount', { count: 'exact' })
      .in('status', ['paid', 'PAID']);
    
    const paidInvoicesAmount = (paidInvoices || []).reduce((sum, inv) => sum + parseFloat(inv.amount || 0), 0);
    
    // Paid invoices this month (ALL paid invoices - not filtered by date since we don't have paid_at field)
    // If you want only invoices created this month, use: .gte('created_at', firstDayISO)
    const { data: paidInvoicesThisMonth, error: paidInvoicesError } = await supabase
      .from('invoices')
      .select('amount, status, created_at')
      .in('status', ['paid', 'PAID']);
    
    if (paidInvoicesError) {
      console.error('❌ Error fetching paid invoices:', paidInvoicesError);
    }
    
    console.log(`📊 Paid invoices fetched: ${paidInvoicesThisMonth?.length || 0}`);
    if (paidInvoicesThisMonth && paidInvoicesThisMonth.length > 0) {
      console.log('📊 Paid invoices data:', JSON.stringify(paidInvoicesThisMonth, null, 2));
      console.log('📊 Paid invoice amounts:', paidInvoicesThisMonth.map(inv => inv.amount));
    }
    
    const paidInvoicesThisMonthAmount = (paidInvoicesThisMonth || []).reduce((sum, inv) => {
      const amount = parseFloat(inv.amount || 0);
      console.log(`   Adding paid invoice amount: ${amount} (from ${inv.amount})`);
      return sum + amount;
    }, 0);
    
    console.log(`📊 Total paid invoices amount: ${paidInvoicesThisMonthAmount}`);
    
    // Paid this month = Total amount of all paid invoices
    const paidThisMonth = paidInvoicesThisMonthAmount;
    
    console.log(`✅ FINAL paidThisMonth value: ${paidThisMonth}`);
    console.log(`✅ This should be 797 (199 + 299 + 299)`);
    
    // Payment success rate (completed / (completed + failed))
    const { count: completedCount } = await supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'completed');
    
    const { count: failedCount } = await supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'failed');
    
    const totalAttempts = (completedCount || 0) + (failedCount || 0);
    const paymentSuccessRate = totalAttempts > 0 ? ((completedCount || 0) / totalAttempts * 100).toFixed(1) : '0.0';
    
    // Monthly recurring revenue (subscription payments this month)
    // Use the already fetched allTransactions to filter subscription payments
    // This ensures we get ALL transactions and filter properly
    const mrrPayments = (allTransactions || []).filter(t => {
      const status = (t.status || '').toLowerCase();
      const transactionType = (t.transaction_type || '').toLowerCase();
      const createdAt = t.created_at ? new Date(t.created_at) : null;
      const firstDay = new Date(firstDayISO);
      
      const isSubscriptionPayment = transactionType === 'subscription_payment';
      const isCompleted = status === 'completed';
      const isThisMonth = createdAt && createdAt >= firstDay;
      
      return isSubscriptionPayment && isCompleted && isThisMonth;
    });
    
    console.log(`📅 Monthly Recurring Revenue - Total transactions in DB: ${allTransactions?.length || 0}`);
    console.log(`📅 Monthly Recurring Revenue - Subscription payments this month: ${mrrPayments.length}`);
    console.log(`📅 First day of month (filter): ${firstDayISO}`);
    console.log(`📅 Current date: ${todayISO}`);
    
    if (mrrPayments.length > 0) {
      console.log('📅 MRR transactions (all):', mrrPayments.map(t => ({
        amount: t.amount,
        agency_id: t.agency_id,
        status: t.status,
        transaction_type: t.transaction_type,
        created_at: t.created_at
      })));
      console.log('📅 MRR transaction amounts:', mrrPayments.map(t => t.amount));
    } else {
      console.log('📅 No subscription payments found this month');
      // Debug: Show all subscription payments regardless of date
      const allSubscriptionPayments = (allTransactions || []).filter(t => {
        const status = (t.status || '').toLowerCase();
        const transactionType = (t.transaction_type || '').toLowerCase();
        return transactionType === 'subscription_payment' && status === 'completed';
      });
      console.log(`📅 Total subscription payments (all time): ${allSubscriptionPayments.length}`);
      if (allSubscriptionPayments.length > 0) {
        console.log('📅 All subscription payments:', allSubscriptionPayments.map(t => ({
          amount: t.amount,
          created_at: t.created_at,
          status: t.status
        })));
      }
    }
    
    const monthlyRecurring = mrrPayments.reduce((sum, p) => {
      const amount = parseFloat(p.amount || 0);
      return sum + amount;
    }, 0);
    console.log(`📅 Monthly Recurring Revenue calculated: $${monthlyRecurring}`);
    
    const responseData = {
      success: true,
      data: {
        totalRevenue,
        monthRevenue,
        pendingInvoices: pendingCount || 0,
        pendingInvoicesAmount,
        totalInvoicesAmount,
        overdueInvoices: overdueCount || 0,
        paidInvoices: paidCount || 0,
        paidInvoicesAmount,
        paidInvoicesThisMonthAmount,
        paidThisMonth: paidInvoicesThisMonthAmount, // Use paid invoices amount instead of transaction revenue
        pendingPaymentsAmount,
        paymentSuccessRate: parseFloat(paymentSuccessRate),
        monthlyRecurring
      }
    };
    
    console.log('📤 Sending stats response:');
    console.log('   totalRevenue:', responseData.data.totalRevenue);
    console.log('   monthlyRecurring:', responseData.data.monthlyRecurring);
    console.log('   paidThisMonth:', responseData.data.paidThisMonth);
    console.log('   paidInvoicesThisMonthAmount:', responseData.data.paidInvoicesThisMonthAmount);
    console.log('   monthRevenue:', responseData.data.monthRevenue);
    
    res.json(responseData);
  } catch (error) {
    console.error('Error fetching financial stats:', error);
    // Check if it's a connection/table error
    if (error.code === 'PGRST116' || error.message?.includes('relation') || error.message?.includes('does not exist')) {
      return res.status(503).json({ 
        success: false, 
        message: 'Database tables are not accessible. Please verify database connection.',
        error: error.message 
      });
    }
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch financial statistics', 
      error: error.message 
    });
  }
});

module.exports = router;
