const express = require('express');
const router = express.Router();
const multer = require('multer');

// Use memory storage so file is available in req.file.buffer
const upload = multer({ storage: multer.memoryStorage() });

const { uploadAgencyDocument } = require('../controllers/agencyDocumentsController');

// Correct route for Flutter and backend
router.post('/:agencyId/documents', upload.single('file'), uploadAgencyDocument);

module.exports = router;
