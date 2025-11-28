// utils/agencyDocumentValidator.js
const { REQUIRED_DOCUMENT_TYPES } = require('../config/constants');

/**
 * Validate uploaded agency documents.
 * 
 * @param {Array} docs - list of documents uploaded by agency
 * @returns {Object} { isComplete, missing }
 */
function validateAgencyDocuments(docs) {
  const uploadedTypes = docs.map(d => d.document_type);

  const missing = REQUIRED_DOCUMENT_TYPES.filter(type => !uploadedTypes.includes(type));

  return {
    isComplete: missing.length === 0,
    missing
  };
}

module.exports = { validateAgencyDocuments };
