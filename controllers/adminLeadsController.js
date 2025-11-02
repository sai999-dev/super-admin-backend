/**
 * Admin Leads Controller
 * Handles HTTP requests for leads management endpoints
 */

const adminLeadsService = require('../services/adminLeadsService');
const { validationResult } = require('express-validator');

class AdminLeadsController {
  
  /**
   * GET /api/admin/leads
   * View all leads with filtering by status, portal, agency, date range
   */
  async getAllLeads(req, res) {
    try {
      // Check for validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      // Extract user context from request
      const user = {
        id: req.user?.id || 'system',
        role: req.user?.role || 'super_admin',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      };

      // Call service to get leads
      const result = await adminLeadsService.getAllLeads(req.query, user);

      res.status(200).json(result);
    } catch (error) {
      console.error('Error in getAllLeads:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
      });
    }
  }

  /**
   * GET /api/admin/leads/:leadId
   * View detailed lead information including raw payload and assignment history
   */
  async getLeadById(req, res) {
    try {
      // Check for validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { leadId } = req.params;

      // Extract user context from request
      const user = {
        id: req.user?.id || 'system',
        role: req.user?.role || 'super_admin',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      };

      // Call service to get lead details
      const result = await adminLeadsService.getLeadById(leadId, user);

      res.status(200).json(result);
    } catch (error) {
      console.error('Error in getLeadById:', error);
      
      if (error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }

      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
      });
    }
  }

  /**
   * PUT /api/admin/leads/:leadId/reassign
   * Manually reassign lead to different agency
   */
  async reassignLead(req, res) {
    try {
      // Check for validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { leadId } = req.params;
      const { agency_id, reason, priority, notes } = req.body;

      // Extract user context from request
      const user = {
        id: req.user?.id || 'system',
        role: req.user?.role || 'super_admin',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      };

      // Call service to reassign lead
      const result = await adminLeadsService.reassignLead(
        leadId, 
        agency_id, 
        user, 
        { reason, priority, notes }
      );

      res.status(200).json(result);
    } catch (error) {
      console.error('Error in reassignLead:', error);
      
      if (error.message.includes('not found') || error.message.includes('already assigned')) {
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }

      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
      });
    }
  }

  /**
   * GET /api/admin/leads/stats
   * Get lead statistics and conversion metrics
   */
  async getLeadStats(req, res) {
    try {
      // Check for validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      // Extract user context from request
      const user = {
        id: req.user?.id || 'system',
        role: req.user?.role || 'super_admin',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      };

      // Call service to get statistics
      const result = await adminLeadsService.getLeadStats(req.query, user);

      res.status(200).json(result);
    } catch (error) {
      console.error('Error in getLeadStats:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
      });
    }
  }

  /**
   * POST /api/admin/leads/export
   * Export lead data to CSV with filtering options
   */
  async exportLeads(req, res) {
    try {
      // Check for validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      // Extract user context from request
      const user = {
        id: req.user?.id || 'system',
        role: req.user?.role || 'super_admin',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      };

      // Call service to export leads
      const result = await adminLeadsService.exportLeads(req.body, user);

      res.status(200).json(result);
    } catch (error) {
      console.error('Error in exportLeads:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
      });
    }
  }

  /**
   * POST /api/admin/leads/archive
   * Archive old leads to maintain system performance
   */
  async archiveLeads(req, res) {
    try {
      // Check for validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { 
        older_than_days = 90, 
        status_filter = ['converted', 'lost'], 
        dry_run = false 
      } = req.body;

      // Extract user context from request
      const user = {
        id: req.user?.id || 'system',
        role: req.user?.role || 'super_admin',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      };

      // Call service to archive leads
      const result = await adminLeadsService.archiveLeads(
        { older_than_days, status_filter, dry_run }, 
        user
      );

      res.status(200).json(result);
    } catch (error) {
      console.error('Error in archiveLeads:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
      });
    }
  }

  /**
   * GET /api/downloads/:filename
   * Serve exported files for download
   */
  async downloadFile(req, res) {
    try {
      const { filename } = req.params;
      const path = require('path');
      const fs = require('fs').promises;

      // Validate filename to prevent directory traversal
      if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        return res.status(400).json({
          success: false,
          message: 'Invalid filename'
        });
      }

      const filePath = path.join('./exports', filename);
      
      // Check if file exists
      try {
        await fs.access(filePath);
      } catch (error) {
        return res.status(404).json({
          success: false,
          message: 'File not found'
        });
      }

      // Set appropriate headers for file download
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      
      // Stream file to response
      const fileStream = require('fs').createReadStream(filePath);
      fileStream.pipe(res);

      // Log download action
      const user = {
        id: req.user?.id || 'anonymous',
        role: req.user?.role || 'guest',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      };

      // Note: In a real application, you might want to log this action
      console.log(`File downloaded: ${filename} by user ${user.id}`);

    } catch (error) {
      console.error('Error in downloadFile:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
      });
    }
  }

  /**
   * Error handling middleware
   */
  static handleError(error, req, res, next) {
    console.error('Unhandled error in AdminLeadsController:', error);
    
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
  }

  /**
   * Async error wrapper
   */
  static asyncHandler(fn) {
    return (req, res, next) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  }

  /**
   * POST /api/admin/leads/:leadId/distribute
   * Manually trigger distribution for a specific lead
   */
  async distributeLeadManually(req, res) {
    try {
      const { leadId } = req.params;
      const user = {
        id: req.user?.id || 'system',
        role: req.user?.role || 'super_admin',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      };

      const result = await adminLeadsService.distributeLead(leadId, user);

      if (result.success) {
        return res.status(200).json({
          success: true,
          message: 'Lead successfully distributed',
          data: result
        });
      } else {
        return res.status(400).json({
          success: false,
          message: result.message,
          data: result
        });
      }
    } catch (error) {
      console.error('Error in distributeLeadManually:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
      });
    }
  }

  /**
   * POST /api/admin/leads/batch-distribute
   * Batch distribute multiple unassigned leads
   */
  async batchDistributeLeads(req, res) {
    try {
      const { limit = 50 } = req.body;
      const user = {
        id: req.user?.id || 'system',
        role: req.user?.role || 'super_admin',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      };

      const result = await adminLeadsService.batchDistribute(limit, user);

      return res.status(200).json({
        success: true,
        message: `Distributed ${result.successful} of ${result.total} leads`,
        data: result
      });
    } catch (error) {
      console.error('Error in batchDistributeLeads:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
      });
    }
  }

  /**
   * GET /api/admin/leads/distribution/stats
   * Get distribution statistics
   */
  async getDistributionStats(req, res) {
    try {
      const { territory } = req.query;

      const stats = await adminLeadsService.getDistributionStats(territory);

      return res.status(200).json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Error in getDistributionStats:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
      });
    }
  }

  /**
   * GET /api/admin/leads/:leadId/eligibility
   * Test distribution eligibility for a lead
   */
  async testDistributionEligibility(req, res) {
    try {
      const { leadId } = req.params;

      const result = await adminLeadsService.testDistributionEligibility(leadId);

      return res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Error in testDistributionEligibility:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
      });
    }
  }

  /**
   * PUT /api/admin/leads/:leadId/reassign (distribution version)
   * Reassign lead to different agency
   */
  async reassignLeadToAgency(req, res) {
    try {
      const { leadId } = req.params;
      const { agencyId } = req.body;
      const user = {
        id: req.user?.id || 'system',
        role: req.user?.role || 'super_admin',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      };

      const result = await adminLeadsService.reassignLeadToAgency(leadId, agencyId, user);

      return res.status(200).json({
        success: true,
        message: 'Lead reassigned successfully',
        data: result
      });
    } catch (error) {
      console.error('Error in reassignLeadToAgency:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
      });
    }
  }
}

// Wrap all methods with async error handler
const methods = [
  'getAllLeads',
  'getLeadById', 
  'reassignLead',
  'getLeadStats',
  'exportLeads',
  'archiveLeads',
  'downloadFile',
  'distributeLeadManually',
  'batchDistributeLeads',
  'getDistributionStats',
  'testDistributionEligibility',
  'reassignLeadToAgency'
];

methods.forEach(method => {
  if (AdminLeadsController.prototype[method]) {
    AdminLeadsController.prototype[method] = AdminLeadsController.asyncHandler(
      AdminLeadsController.prototype[method]
    );
  }
});

module.exports = new AdminLeadsController();

