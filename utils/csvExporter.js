/**
 * CSV Export Utility
 * Handles CSV generation and file management for lead exports
 */

const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

/**
 * Convert data to CSV format
 * @param {Array} data - Array of objects to convert
 * @param {Array} columns - Column definitions
 * @returns {string} CSV content
 */
const convertToCSV = (data, columns) => {
  if (!data || data.length === 0) {
    return '';
  }

  // Create header row
  const headers = columns.map(col => col.header || col.key).join(',');
  
  // Create data rows
  const rows = data.map(item => {
    return columns.map(col => {
      let value = getNestedValue(item, col.key);
      
      // Format value based on type
      if (col.formatter && typeof col.formatter === 'function') {
        value = col.formatter(value, item);
      } else {
        value = formatValue(value, col.type);
      }
      
      // Escape CSV values
      return escapeCSVValue(value);
    }).join(',');
  });
  
  return [headers, ...rows].join('\n');
};

/**
 * Get nested value from object using dot notation
 * @param {Object} obj - Object to get value from
 * @param {string} key - Dot notation key (e.g., 'user.profile.name')
 * @returns {*} Value or null
 */
const getNestedValue = (obj, key) => {
  return key.split('.').reduce((current, prop) => {
    return current && current[prop] !== undefined ? current[prop] : null;
  }, obj);
};

/**
 * Format value based on type
 * @param {*} value - Value to format
 * @param {string} type - Data type
 * @returns {string} Formatted value
 */
const formatValue = (value, type) => {
  if (value === null || value === undefined) {
    return '';
  }
  
  switch (type) {
    case 'date':
      return value instanceof Date ? value.toISOString() : value;
    case 'currency':
      return typeof value === 'number' ? value.toFixed(2) : value;
    case 'boolean':
      return value ? 'Yes' : 'No';
    case 'array':
      return Array.isArray(value) ? value.join('; ') : value;
    case 'object':
      return typeof value === 'object' ? JSON.stringify(value) : value;
    default:
      return String(value);
  }
};

/**
 * Escape CSV value to handle commas, quotes, and newlines
 * @param {string} value - Value to escape
 * @returns {string} Escaped value
 */
const escapeCSVValue = (value) => {
  if (value === null || value === undefined) {
    return '';
  }
  
  const stringValue = String(value);
  
  // If value contains comma, quote, or newline, wrap in quotes and escape internal quotes
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  
  return stringValue;
};

/**
 * Generate unique filename for export
 * @param {string} prefix - Filename prefix
 * @param {string} extension - File extension
 * @returns {string} Unique filename
 */
const generateFilename = (prefix = 'export', extension = 'csv') => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const uuid = uuidv4().substring(0, 8);
  return `${prefix}_${timestamp}_${uuid}.${extension}`;
};

/**
 * Save CSV content to file
 * @param {string} content - CSV content
 * @param {string} filename - Filename
 * @param {string} directory - Directory path
 * @returns {Promise<string>} Full file path
 */
const saveToFile = async (content, filename, directory = './exports') => {
  // Ensure directory exists
  await fs.mkdir(directory, { recursive: true });
  
  const filePath = path.join(directory, filename);
  await fs.writeFile(filePath, content, 'utf8');
  
  return filePath;
};

/**
 * Delete file after specified time
 * @param {string} filePath - File path to delete
 * @param {number} delayMs - Delay in milliseconds
 */
const scheduleFileDeletion = (filePath, delayMs = 24 * 60 * 60 * 1000) => { // 24 hours default
  setTimeout(async () => {
    try {
      await fs.unlink(filePath);
      console.log(`Deleted export file: ${filePath}`);
    } catch (error) {
      console.error(`Failed to delete export file: ${filePath}`, error);
    }
  }, delayMs);
};

/**
 * Get file stats
 * @param {string} filePath - File path
 * @returns {Promise<Object>} File stats
 */
const getFileStats = async (filePath) => {
  try {
    const stats = await fs.stat(filePath);
    return {
      exists: true,
      size: stats.size,
      created: stats.birthtime,
      modified: stats.mtime
    };
  } catch (error) {
    return {
      exists: false,
      error: error.message
    };
  }
};

/**
 * Lead export column definitions
 */
const LEAD_EXPORT_COLUMNS = [
  { key: 'id', header: 'Lead ID', type: 'string' },
  { key: 'leadName', header: 'Lead Name', type: 'string' },
  { key: 'email', header: 'Email', type: 'string' },
  { key: 'phoneNumber', header: 'Phone', type: 'string' },
  { key: 'city', header: 'City', type: 'string' },
  { key: 'state', header: 'State', type: 'string' },
  { key: 'zipcode', header: 'Zipcode', type: 'string' },
  { key: 'industry', header: 'Industry', type: 'string' },
  { key: 'status', header: 'Status', type: 'string' },
  { key: 'priority', header: 'Priority', type: 'string' },
  { key: 'source', header: 'Source', type: 'string' },
  { key: 'portal.name', header: 'Portal Name', type: 'string' },
  { key: 'assignments.0.agency.businessName', header: 'Assigned Agency', type: 'string' },
  { key: 'assignments.0.status', header: 'Assignment Status', type: 'string' },
  { key: 'assignments.0.assignmentType', header: 'Assignment Type', type: 'string' },
  { key: 'created_at', header: 'Created Date', type: 'date', formatter: (value) => new Date(value).toLocaleDateString() },
  { key: 'updated_at', header: 'Last Updated', type: 'date', formatter: (value) => new Date(value).toLocaleDateString() }
];

/**
 * Export leads to CSV
 * @param {Array} leads - Array of lead objects
 * @param {Object} options - Export options
 * @returns {Promise<Object>} Export result
 */
const exportLeadsToCSV = async (leads, options = {}) => {
  const {
    filename = generateFilename('leads_export'),
    directory = './exports',
    columns = LEAD_EXPORT_COLUMNS,
    includeHeaders = true
  } = options;
  
  try {
    // Convert to CSV
    const csvContent = convertToCSV(leads, columns);
    
    // Save to file
    const filePath = await saveToFile(csvContent, filename, directory);
    
    // Schedule file deletion (24 hours)
    scheduleFileDeletion(filePath);
    
    // Get file stats
    const stats = await getFileStats(filePath);
    
    return {
      success: true,
      filename,
      filePath,
      downloadUrl: `/api/downloads/${filename}`,
      stats,
      recordCount: leads.length
    };
  } catch (error) {
    throw new Error(`CSV export failed: ${error.message}`);
  }
};

/**
 * Create download URL for file
 * @param {string} filename - Filename
 * @param {string} baseUrl - Base URL
 * @returns {string} Download URL
 */
const createDownloadUrl = (filename, baseUrl = '') => {
  return `${baseUrl}/api/downloads/${filename}`;
};

module.exports = {
  convertToCSV,
  generateFilename,
  saveToFile,
  scheduleFileDeletion,
  getFileStats,
  exportLeadsToCSV,
  createDownloadUrl,
  LEAD_EXPORT_COLUMNS,
  escapeCSVValue,
  formatValue,
  getNestedValue
};

