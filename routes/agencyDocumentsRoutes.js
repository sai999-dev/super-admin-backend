const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { Client } = require('pg');
const router = express.Router();

// ✅ Database connection (direct client for simplicity)
// Use Supabase as fallback if PostgreSQL connection fails
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
      console.log('✅ Connected to PostgreSQL (agencyDocumentsRoutes)');
      useSupabase = false;
    })
    .catch(err => {
      console.error('❌ PostgreSQL connection failed:', err.message);
      console.log('⚠️ Falling back to Supabase for document operations');
      useSupabase = true;
      if (pgClient) {
        pgClient.end().catch(() => {});
      }
    });
} else {
  console.log('⚠️ PostgreSQL credentials not configured, using Supabase for document operations');
  useSupabase = true;
}

// ✅ Ensure uploads directory exists
const uploadDir = path.join(__dirname, '..', 'uploads', 'documents');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// ✅ Configure multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;
    cb(null, unique);
  },
});
const upload = multer({ storage });

// 🧩 Debug route to confirm backend is running
router.get('/test', (req, res) => {
  res.json({ success: true, message: 'Agency Documents API is live!' });
});

// ✅ POST: Upload document for an agency
router.post('/:agencyId/documents', upload.single('file'), async (req, res) => {
  console.log('📥 Incoming upload request...');
  console.log('📋 Request body keys:', Object.keys(req.body || {}));
  console.log('📋 Request body:', req.body);
  try {
    const { agencyId } = req.params;
    // Accept both document_type (from Flutter) and documentType (camelCase)
    const documentType = req.body.document_type || req.body.documentType || 'business_license';
    const description = req.body.description || '';
    const file = req.file;

    console.log('➡️ agencyId:', agencyId);
    console.log('➡️ document_type (from Flutter):', req.body.document_type);
    console.log('➡️ documentType (camelCase):', req.body.documentType);
    console.log('➡️ Final documentType used:', documentType);
    console.log('➡️ description:', description);
    console.log('➡️ file:', file ? { originalname: file.originalname, size: file.size, mimetype: file.mimetype } : 'No file');

    if (!file) {
      console.log('❌ No file uploaded');
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const filePath = `/uploads/documents/${file.filename}`;

    const insertSQL = `
      INSERT INTO agency_documents
      (agency_id, document_type, file_name, file_path, mime_type, size_bytes, description, status, uploaded_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING', NOW())
      RETURNING *;
    `;

    const values = [
      agencyId,
      documentType,
      file.originalname,
      filePath,
      file.mimetype,
      file.size,
      description,
    ];

    console.log('🧾 Running SQL Insert:', insertSQL);
    console.log('📦 Values:', values);

    let document;
    
    if (useSupabase || !pgClient) {
      // Use Supabase if PostgreSQL is not available
      console.log('💾 Using Supabase for document insert...');
      const { data, error } = await supabase
        .from('agency_documents')
        .insert({
          agency_id: agencyId,
          document_type: documentType,
          file_name: file.originalname,
          file_path: filePath,
          mime_type: file.mimetype,
          size_bytes: file.size,
          description: description || null,
          status: 'PENDING'
        })
        .select()
        .single();

      if (error) {
        console.error('❌ Supabase insert error:', error);
        throw new Error(error.message || 'Failed to save document');
      }
      document = data;
    } else {
      // Use PostgreSQL
      const result = await pgClient.query(insertSQL, values);
      document = result.rows[0];
    }

    console.log('✅ Inserted document:', document);

    return res.status(201).json({
      success: true,
      message: 'Document uploaded successfully',
      document: document,
    });
  } catch (err) {
    console.error('❌ Upload error:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ✅ GET: Fetch all uploaded docs for an agency
router.get('/:agencyId/documents', async (req, res) => {
  try {
    const { agencyId } = req.params;
    console.log('📤 Fetching documents for agency:', agencyId);

    let documents = [];

    if (useSupabase || !pgClient) {
      // Use Supabase if PostgreSQL is not available
      console.log('💾 Using Supabase for document fetch...');
      const { data, error } = await supabase
        .from('agency_documents')
        .select('id, document_type, file_name, file_path, mime_type, status, size_bytes, description, created_at, updated_at')
        .eq('agency_id', agencyId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ Supabase fetch error:', error);
        throw new Error(error.message || 'Failed to fetch documents');
      }
      
      documents = (data || []).map(doc => ({
        id: doc.id,
        document_type: doc.document_type,
        file_name: doc.file_name,
        file_path: doc.file_path,
        mime_type: doc.mime_type,
        status: doc.status,
        uploaded_at: doc.created_at || doc.uploaded_at,
        description: doc.description
      }));
    } else {
      // Use PostgreSQL
      const result = await pgClient.query(
        `SELECT id, document_type, file_name, file_path, mime_type, status, uploaded_at
         FROM agency_documents
         WHERE agency_id = $1
         ORDER BY uploaded_at DESC`,
        [agencyId]
      );
      documents = result.rows;
    }

    console.log('📦 Documents fetched:', documents.length);
    res.json({ success: true, documents: documents });
  } catch (err) {
    console.error('❌ Fetch error:', err.message);
    console.error('❌ Error stack:', err.stack);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ✅ Serve uploaded files for preview
router.get('/files/:filename', (req, res) => {
  const filePath = path.join(uploadDir, req.params.filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, message: 'File not found' });
  }
  res.sendFile(filePath);
});

module.exports = router;
