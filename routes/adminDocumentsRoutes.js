const express = require('express');
const { Client } = require('pg');
const router = express.Router();
const { authenticateAdmin } = require('../middleware/adminAuth');

// ✅ Use Supabase as fallback if PostgreSQL connection fails
const supabase = require('../config/supabaseClient');
let pgClient = null;
let useSupabase = false;

// Try to connect to PostgreSQL
if (process.env.DB_HOST && process.env.DB_PASSWORD && process.env.DB_PASSWORD !== 'YOUR_SUPABASE_DB_PASSWORD_HERE') {
  pgClient = new Client({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'postgres',
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD,
    ssl: {
      rejectUnauthorized: false // Required for Supabase
    }
  });
  
  pgClient.connect()
    .then(() => {
      console.log('✅ AdminDocuments connected to PostgreSQL');
      useSupabase = false;
    })
    .catch(err => {
      console.error('❌ PostgreSQL connection failed:', err.message);
      console.log('⚠️ Falling back to Supabase for admin document operations');
      useSupabase = true;
      if (pgClient) {
        pgClient.end().catch(() => {});
      }
    });
} else {
  console.log('⚠️ PostgreSQL credentials not configured, using Supabase for admin document operations');
  useSupabase = true;
}

/**
 * GET /api/admin/agencies/:agencyId/documents
 * Fetch uploaded documents for an agency
 */
router.get('/agencies/:agencyId/documents', authenticateAdmin, async (req, res) => {
  try {
    const { agencyId } = req.params;
    console.log('📤 Admin fetching documents for agency:', agencyId);

    let documents = [];

    if (useSupabase || !pgClient) {
      // Use Supabase if PostgreSQL is not available
      console.log('💾 Using Supabase for admin document fetch...');
      const { data, error } = await supabase
        .from('agency_documents')
        .select('id, agency_id, document_type, file_name, file_path, mime_type, size_bytes, description, status, uploaded_at, reviewed_at, reviewed_by')
        .eq('agency_id', agencyId)
        .order('uploaded_at', { ascending: false });

      if (error) {
        console.error('❌ Supabase fetch error:', error);
        throw new Error(error.message || 'Failed to fetch documents');
      }
      
      documents = (data || []).map(doc => ({
        id: doc.id,
        agency_id: doc.agency_id,
        document_type: doc.document_type,
        file_name: doc.file_name,
        file_path: doc.file_path,
        mime_type: doc.mime_type,
        size_bytes: doc.size_bytes,
        description: doc.description || '',
        status: doc.status || 'PENDING',
        uploaded_at: doc.uploaded_at || null,
        verified_at: doc.reviewed_at || null,
        verified_by: doc.reviewed_by || null
      }));
    } else {
      // Use PostgreSQL - use uploaded_at column (not created_at)
      const result = await pgClient.query(
        `SELECT id, agency_id, document_type, file_name, file_path,
                mime_type, size_bytes, description, status,
                uploaded_at, reviewed_at, reviewed_by
         FROM agency_documents
         WHERE agency_id = $1
         ORDER BY uploaded_at DESC`,
        [agencyId]
      );
      // Map database columns to API response format
      documents = result.rows.map(row => ({
        id: row.id,
        agency_id: row.agency_id,
        document_type: row.document_type,
        file_name: row.file_name,
        file_path: row.file_path,
        mime_type: row.mime_type,
        size_bytes: row.size_bytes,
        description: row.description || '',
        status: row.status || 'PENDING',
        uploaded_at: row.uploaded_at,
        verified_at: row.reviewed_at || null,
        verified_by: row.reviewed_by || null
      }));
    }

    console.log(`✅ Fetched ${documents.length} documents for agency ${agencyId}`);
    res.status(200).json({ success: true, documents: documents });
  } catch (err) {
    console.error('❌ Error fetching admin documents:', err);
    console.error('❌ Error stack:', err.stack);
    res.status(500).json({ success: false, message: err.message || 'Failed to fetch documents' });
  }
});

/**
 * PATCH /api/admin/agencies/:agencyId/documents/:docId/verify
 * Update document verification status
 */
router.patch('/agencies/:agencyId/documents/:docId/verify', authenticateAdmin, async (req, res) => {
  try {
    const { agencyId, docId } = req.params;
    const { status = 'APPROVED', verifiedBy = 'SuperAdmin' } = req.body;

    console.log('🔐 Verifying document:', { docId, agencyId, status, verifiedBy });

    if (useSupabase || !pgClient) {
      // Use Supabase
      const { data, error } = await supabase
        .from('agency_documents')
        .update({
          status: status,
          reviewed_by: verifiedBy,
          reviewed_at: new Date().toISOString()
        })
        .eq('id', docId)
        .eq('agency_id', agencyId)
        .select()
        .single();

      if (error) {
        console.error('❌ Supabase update error:', error);
        throw new Error(error.message || 'Failed to update document');
      }

      if (!data) {
        return res.status(404).json({ success: false, message: 'Document not found' });
      }

      res.json({ success: true, message: 'Verification updated', document: data });
    } else {
      // Use PostgreSQL
      const update = await pgClient.query(
        `UPDATE agency_documents
         SET status = $1, reviewed_by = $2, reviewed_at = NOW()
         WHERE id = $3 AND agency_id = $4
         RETURNING *`,
        [status, verifiedBy, docId, agencyId]
      );

      if (update.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Document not found' });
      }

      res.json({ success: true, message: 'Verification updated', document: update.rows[0] });
    }
  } catch (err) {
    console.error('❌ Verify error:', err);
    console.error('❌ Error stack:', err.stack);
    res.status(500).json({ success: false, message: err.message || 'Failed to verify document' });
  }
});

module.exports = router;

