/**
 * Document Verification Controller
 * Handles document upload and verification for mobile and admin
 */

const supabase = require('../config/supabaseClient');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

// For file storage - configure based on your setup
// Options: S3, local filesystem, Supabase Storage
const STORAGE_TYPE = process.env.STORAGE_TYPE || 'local'; // 'local', 's3', 'supabase'

/**
 * Helper: Save file to storage
 */
async function saveFile(file, agencyId) {
  const timestamp = Date.now();
  const randomStr = crypto.randomBytes(8).toString('hex');
  const ext = path.extname(file.originalname);
  const fileName = `${agencyId}_${timestamp}_${randomStr}${ext}`;

  if (STORAGE_TYPE === 'local') {
    // Local filesystem storage
    const uploadDir = path.join(__dirname, '..', 'uploads', 'verification-documents');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    const filePath = path.join(uploadDir, fileName);
    fs.writeFileSync(filePath, file.buffer);
    return {
      file_path: `/uploads/verification-documents/${fileName}`,
      file_name: file.originalname,
      storage_type: 'local'
    };
  } else if (STORAGE_TYPE === 's3') {
    // AWS S3 storage (implement if needed)
    // const AWS = require('aws-sdk');
    // ... S3 upload logic
    throw new Error('S3 storage not yet implemented');
  } else if (STORAGE_TYPE === 'supabase') {
    // Supabase Storage
    const { data, error } = await supabase.storage
      .from('verification-documents')
      .upload(`${agencyId}/${fileName}`, file.buffer, {
        contentType: file.mimetype,
        upsert: false
      });

    if (error) throw error;

    const { data: { publicUrl } } = supabase.storage
      .from('verification-documents')
      .getPublicUrl(`${agencyId}/${fileName}`);

    return {
      file_path: `${agencyId}/${fileName}`,
      file_name: file.originalname,
      storage_type: 'supabase',
      public_url: publicUrl
    };
  }

  throw new Error('Invalid storage type');
}

/**
 * POST /api/mobile/auth/upload-document
 * Upload company verification document
 */
async function uploadDocument(req, res) {
  try {
    const agencyId = req.agency.id;
    const file = req.file;

    if (!file) {
      return res.status(400).json({
        success: false,
        message: 'Document file is required'
      });
    }

    // Validate file type
    const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
    if (!allowedTypes.includes(file.mimetype)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid file type. Only PDF, PNG, and JPG are allowed.'
      });
    }

    // Validate file size (10MB max)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return res.status(413).json({
        success: false,
        message: 'File size exceeds 10MB limit'
      });
    }

    const { document_type = 'other', description } = req.body;

    // Save file
    const fileInfo = await saveFile(file, agencyId);

    // Insert document record
    const { data: document, error } = await supabase
      .from('verification_documents')
      .insert({
        agency_id: agencyId,
        document_type,
        file_name: fileInfo.file_name,
        file_path: fileInfo.file_path,
        file_size: file.size,
        mime_type: file.mimetype,
        description: description || null,
        verification_status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    // Send notification to admin (if notifications enabled)
    try {
      // Get admin users
      const { data: admins } = await supabase
        .from('users')
        .select('id')
        .eq('role', 'super_admin')
        .eq('is_active', true);

      // Create notifications for admins (if notifications table exists)
      if (admins && admins.length > 0) {
        const notifications = admins.map(admin => ({
          user_id: admin.id,
          title: 'New Document Upload',
          message: `Agency ${agencyId} uploaded a verification document`,
          type: 'document_uploaded',
          related_document_id: document.id,
          created_at: new Date().toISOString()
        }));

        await supabase.from('notifications').insert(notifications);
      }
    } catch (e) {
      // Notifications might not be set up yet
      console.warn('Could not send admin notification:', e.message);
    }

    res.json({
      success: true,
      message: 'Document uploaded successfully. Awaiting admin review.',
      data: {
        document_id: document.id,
        verification_status: document.verification_status,
        uploaded_at: document.created_at
      }
    });
  } catch (error) {
    console.error('Error uploading document:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload document',
      error: error.message
    });
  }
}

/**
 * GET /api/mobile/auth/verification-status
 * Get current verification status
 */
async function getVerificationStatus(req, res) {
  try {
    const agencyId = req.agency.id;

    // Get agency verification status
    const { data: agency, error: agencyError } = await supabase
      .from('agencies')
      .select('id, email, is_verified, verification_status')
      .eq('id', agencyId)
      .single();

    if (agencyError) throw agencyError;

    // Get latest document
    const { data: documents } = await supabase
      .from('verification_documents')
      .select('*')
      .eq('agency_id', agencyId)
      .order('created_at', { ascending: false })
      .limit(1);

    const latestDocument = documents && documents.length > 0 ? documents[0] : null;

    // Determine overall status
    const emailVerified = agency.is_verified || agency.verification_status === 'VERIFIED';
    const documentStatus = latestDocument ? latestDocument.verification_status : 'no_document';

    let overallStatus = 'pending_verification';
    if (emailVerified && documentStatus === 'approved') {
      overallStatus = 'active';
    } else if (documentStatus === 'rejected') {
      overallStatus = 'rejected';
    }

    res.json({
      email_verified: emailVerified,
      document_status: documentStatus,
      overall_status: overallStatus,
      document: latestDocument ? {
        id: latestDocument.id,
        document_type: latestDocument.document_type,
        file_name: latestDocument.file_name,
        verification_status: latestDocument.verification_status,
        uploaded_at: latestDocument.created_at,
        reviewed_at: latestDocument.reviewed_at
      } : null,
      message: documentStatus === 'pending' 
        ? 'Your document is pending admin review'
        : documentStatus === 'approved'
        ? 'Your document has been approved'
        : documentStatus === 'rejected'
        ? 'Your document was rejected. Please upload a new one.'
        : 'Please upload a verification document'
    });
  } catch (error) {
    console.error('Error fetching verification status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch verification status',
      error: error.message
    });
  }
}

/**
 * GET /api/mobile/auth/documents
 * Get all uploaded documents for agency
 */
async function getDocuments(req, res) {
  try {
    const agencyId = req.agency.id;

    const { data: documents, error } = await supabase
      .from('verification_documents')
      .select('*')
      .eq('agency_id', agencyId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      documents: (documents || []).map(doc => ({
        id: doc.id,
        document_type: doc.document_type,
        file_name: doc.file_name,
        verification_status: doc.verification_status,
        uploaded_at: doc.created_at,
        description: doc.description,
        rejection_reason: doc.rejection_reason
      }))
    });
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch documents',
      error: error.message
    });
  }
}

/**
 * GET /api/admin/verification-documents
 * List verification documents (admin)
 */
async function listDocuments(req, res) {
  try {
    const { status, page = 1, limit = 20, agency_id } = req.query;

    let query = supabase
      .from('verification_documents')
      .select(`
        *,
        agencies (
          id,
          agency_name,
          business_name,
          email
        )
      `)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('verification_status', status);
    }

    if (agency_id) {
      query = query.eq('agency_id', agency_id);
    }

    // Get total count
    const { count } = await supabase
      .from('verification_documents')
      .select('*', { count: 'exact', head: true });

    // Apply pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);
    query = query.range(offset, offset + parseInt(limit) - 1);

    const { data: documents, error } = await query;

    if (error) throw error;

    res.json({
      success: true,
      documents: (documents || []).map(doc => ({
        id: doc.id,
        agency_id: doc.agency_id,
        agency_name: doc.agencies?.agency_name || doc.agencies?.business_name,
        agency_email: doc.agencies?.email,
        document_type: doc.document_type,
        file_name: doc.file_name,
        verification_status: doc.verification_status,
        uploaded_at: doc.created_at,
        reviewed_at: doc.reviewed_at,
        rejection_reason: doc.rejection_reason
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count || 0,
        totalPages: Math.ceil((count || 0) / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error listing documents:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to list documents',
      error: error.message
    });
  }
}

/**
 * GET /api/admin/verification-documents/:id/download
 * Download document file
 */
async function downloadDocument(req, res) {
  try {
    const documentId = parseInt(req.params.id);

    const { data: document, error } = await supabase
      .from('verification_documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (error || !document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    // Handle different storage types
    if (STORAGE_TYPE === 'local') {
      const filePath = path.join(__dirname, '..', document.file_path);
      if (fs.existsSync(filePath)) {
        res.setHeader('Content-Type', document.mime_type || 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${document.file_name}"`);
        return res.sendFile(filePath);
      } else {
        return res.status(404).json({
          success: false,
          message: 'File not found on server'
        });
      }
    } else if (STORAGE_TYPE === 'supabase') {
      // Generate signed URL for Supabase storage
      const { data, error: urlError } = await supabase.storage
        .from('verification-documents')
        .createSignedUrl(document.file_path, 3600); // 1 hour expiry

      if (urlError) throw urlError;

      return res.redirect(data.signedUrl);
    }

    throw new Error('Storage type not configured for downloads');
  } catch (error) {
    console.error('Error downloading document:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to download document',
      error: error.message
    });
  }
}

/**
 * PUT /api/admin/verification-documents/:id/approve
 * Approve document
 */
async function approveDocument(req, res) {
  try {
    const documentId = parseInt(req.params.id);
    const adminId = req.admin.id;
    const { notes } = req.body;

    const { data: document, error: fetchError } = await supabase
      .from('verification_documents')
      .select('*, agencies (*)')
      .eq('id', documentId)
      .single();

    if (fetchError || !document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    // Update document
    const { data: updated, error: updateError } = await supabase
      .from('verification_documents')
      .update({
        verification_status: 'approved',
        reviewed_by: adminId,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', documentId)
      .select()
      .single();

    if (updateError) throw updateError;

    // Update agency verification status
    await supabase
      .from('agencies')
      .update({
        is_verified: true,
        verification_status: 'VERIFIED',
        updated_at: new Date().toISOString()
      })
      .eq('id', document.agency_id);

    // Send notification to agency
    try {
      await supabase.from('notifications').insert({
        agency_id: document.agency_id,
        title: 'Document Approved',
        message: 'Your verification document has been approved. Your account is now fully verified.',
        type: 'document_approved',
        related_document_id: documentId,
        created_at: new Date().toISOString()
      });
    } catch (e) {
      console.warn('Could not send notification:', e.message);
    }

    res.json({
      success: true,
      message: 'Document approved successfully',
      data: {
        document_id: updated.id,
        verification_status: updated.verification_status,
        reviewed_at: updated.reviewed_at
      }
    });
  } catch (error) {
    console.error('Error approving document:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve document',
      error: error.message
    });
  }
}

/**
 * PUT /api/admin/verification-documents/:id/reject
 * Reject document
 */
async function rejectDocument(req, res) {
  try {
    const documentId = parseInt(req.params.id);
    const adminId = req.admin.id;
    const { rejection_reason, notes } = req.body;

    if (!rejection_reason) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required'
      });
    }

    const { data: document, error: fetchError } = await supabase
      .from('verification_documents')
      .select('*, agencies (*)')
      .eq('id', documentId)
      .single();

    if (fetchError || !document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    // Update document
    const { data: updated, error: updateError } = await supabase
      .from('verification_documents')
      .update({
        verification_status: 'rejected',
        reviewed_by: adminId,
        reviewed_at: new Date().toISOString(),
        rejection_reason,
        updated_at: new Date().toISOString()
      })
      .eq('id', documentId)
      .select()
      .single();

    if (updateError) throw updateError;

    // Send notification to agency
    try {
      await supabase.from('notifications').insert({
        agency_id: document.agency_id,
        title: 'Document Rejected',
        message: `Your verification document was rejected: ${rejection_reason}. Please upload a new document.`,
        type: 'document_rejected',
        related_document_id: documentId,
        created_at: new Date().toISOString()
      });
    } catch (e) {
      console.warn('Could not send notification:', e.message);
    }

    res.json({
      success: true,
      message: 'Document rejected',
      data: {
        document_id: updated.id,
        verification_status: updated.verification_status,
        rejection_reason: updated.rejection_reason,
        reviewed_at: updated.reviewed_at
      }
    });
  } catch (error) {
    console.error('Error rejecting document:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject document',
      error: error.message
    });
  }
}

module.exports = {
  uploadDocument,
  getVerificationStatus,
  getDocuments,
  listDocuments,
  downloadDocument,
  approveDocument,
  rejectDocument
};

