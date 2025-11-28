const express = require('express');
const router = express.Router();
const { listAgencyDocumentsMobile } = require('../controllers/agencyDocumentsController'); // controller we will update

// GET /api/v1/agencies/:agencyId/documents
// Public/mobile endpoint used by the Flutter app
router.get('/:agencyId/documents', async (req, res) => {
  try {
    await listAgencyDocumentsMobile(req, res);
  } catch (err) {
    console.error('Mobile documents route error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;