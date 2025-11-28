const path = require('path');
const supabase = require('../config/supabaseClient');

exports.uploadAgencyDocument = async (req, res) => {
  console.log("=== UPLOAD DEBUG START ===");
  console.log("req.file exists:", !!req.file);
  if (req.file) {
    console.log("Original filename:", req.file.originalname);
    console.log("MIME type:", req.file.mimetype);
    console.log("File size:", req.file.size);
    console.log("Buffer length:", req.file.buffer?.length);
  }
  console.log("Supabase URL:", process.env.SUPABASE_URL);
  console.log("Service Role Key starts with:", process.env.SUPABASE_SERVICE_ROLE_KEY?.substring(0,5));
  console.log("Bucket name: agency_documents");
  console.log("=== UPLOAD DEBUG END ===");

  try {
    const { agencyId } = req.params;

    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }

    if (!req.file.buffer) {
      console.error('❌ File buffer is missing. File object:', {
        fieldname: req.file.fieldname,
        originalname: req.file.originalname,
        encoding: req.file.encoding,
        mimetype: req.file.mimetype,
        size: req.file.size
      });
      return res.status(400).json({ success: false, message: "File buffer is missing. Make sure multer is configured with memoryStorage()" });
    }

    const originalName = req.file.originalname;
    const fileExt = path.extname(originalName);
    const safeName = `${agencyId}/${Date.now()}-${Math.random().toString().substring(2)}${fileExt}`;

    console.log('📤 Uploading file to Supabase Storage...');
    console.log('📋 File details:', {
      originalName,
      size: req.file.size,
      mimetype: req.file.mimetype,
      bufferLength: req.file.buffer.length,
      safeName
    });

    // Upload to Supabase Storage
    const uploadResult = await supabase.storage
      .from('agency_documents')
      .upload(safeName, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false,
      });

    if (uploadResult.error) {
      console.error("🔥 SUPABASE UPLOAD ERROR ===");
      console.error(uploadResult.error);

      return res.status(500).json({
        success: false,
        message: "Failed to upload file to storage",
        supabase_error: uploadResult.error
      });
    }

    console.log('✅ File uploaded successfully to Supabase Storage');

    // Generate public URL
    const publicUrlResponse = supabase.storage
      .from('agency_documents')
      .getPublicUrl(safeName);

    const fileUrl = publicUrlResponse.data.publicUrl;
    console.log('🔗 Generated public URL:', fileUrl);

    // Save to database
    const insertPayload = {
      agency_id: agencyId,
      document_type: req.body.document_type || 'verification',
      file_name: originalName,
      file_path: safeName,
      file_url: fileUrl,
      mime_type: req.file.mimetype,
      size_bytes: req.file.size,
      description: req.body.description || '',
      status: 'PENDING'
    };

    console.log('💾 Saving to database...', insertPayload);

    const { data: inserted, error: dbError } = await supabase
      .from('agency_documents')
      .insert(insertPayload)
      .select()
      .single();

    if (dbError) {
      console.error('❌ Database insert error:', dbError);
      console.error('❌ Error details:', JSON.stringify(dbError, null, 2));
      return res.status(500).json({ 
        success: false, 
        message: "Failed to save record to DB",
        error: dbError.message || dbError
      });
    }

    console.log('✅ Document saved successfully:', inserted.id);

    res.status(201).json({
      success: true,
      message: "Document uploaded successfully",
      document: inserted,
    });

  } catch (err) {
    console.error("❌ Upload error:", err);
    console.error("❌ Error stack:", err.stack);
    res.status(500).json({ 
      success: false, 
      message: err.message || "Server error",
      error: err.toString()
    });
  }
};

/**
 * listAgencyDocumentsMobile
 * Returns documents for mobile frontend (includes file_url/public url)
 * Called by GET /api/v1/agencies/:agencyId/documents
 */
exports.listAgencyDocumentsMobile = async (req, res) => {
  try {
    const agencyId = req.params.agencyId;
    // If you already set useSupabase / pgClient above in this file, reuse them.
    let documents = [];

    // SUPABASE path (preferred when DB writes file_url)
    if (typeof supabase !== 'undefined') {
      const { data, error } = await supabase
        .from('agency_documents')
        .select('id, agency_id, document_type, file_name, file_path, file_url, mime_type, size_bytes, description, status, uploaded_at, reviewed_at, reviewed_by')
        .eq('agency_id', agencyId)
        .order('uploaded_at', { ascending: false });

      if (error) {
        console.error('Supabase mobile fetch error:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch documents' });
      }

      documents = (data || []).map(d => ({
        id: d.id,
        agency_id: d.agency_id,
        document_type: d.document_type,
        file_name: d.file_name,
        file_path: d.file_path,
        file_url: d.file_url || null,       // public URL stored in DB (preferred)
        mime_type: d.mime_type,
        size_bytes: d.size_bytes,
        description: d.description || '',
        status: d.status || 'PENDING',
        uploaded_at: d.uploaded_at,
        reviewed_at: d.reviewed_at || null,
        reviewed_by: d.reviewed_by || null
      }));

      return res.status(200).json({ success: true, documents });
    }

    // FALLBACK: PostgreSQL
    if (typeof pgClient !== 'undefined' && pgClient) {
      const q = `
        SELECT id, agency_id, document_type, file_name, file_path, file_url, mime_type, size_bytes, description, status, uploaded_at, reviewed_at, reviewed_by
        FROM agency_documents
        WHERE agency_id = $1
        ORDER BY uploaded_at DESC
      `;
      const result = await pgClient.query(q, [agencyId]);
      documents = result.rows.map(row => ({
        id: row.id,
        agency_id: row.agency_id,
        document_type: row.document_type,
        file_name: row.file_name,
        file_path: row.file_path,
        file_url: row.file_url || null,
        mime_type: row.mime_type,
        size_bytes: row.size_bytes,
        description: row.description || '',
        status: row.status || 'PENDING',
        uploaded_at: row.uploaded_at,
        reviewed_at: row.reviewed_at || null,
        reviewed_by: row.reviewed_by || null
      }));

      return res.status(200).json({ success: true, documents });
    }

    // If neither supabase nor pgClient present
    return res.status(500).json({ success: false, message: 'No DB connection configured' });

  } catch (err) {
    console.error('listAgencyDocumentsMobile error:', err);
    res.status(500).json({ success: false, message: err.message || 'Server error' });
  }
};
