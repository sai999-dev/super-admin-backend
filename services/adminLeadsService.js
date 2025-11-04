/**
 * Admin Leads Service
 * Business logic for leads management API endpoints
 */

const { Op } = require('sequelize');
const { Lead, LeadAssignment, Portal, Agency, AuditLog, WebhookAudit } = require('../models');
const { 
  calculatePagination, 
  buildPaginationResponse, 
  buildSequelizeOptions, 
  buildSortOptions, 
  buildFilterOptions, 
  buildSearchOptions 
} = require('../utils/paginationHelper');
const { exportLeadsToCSV } = require('../utils/csvExporter');

class AdminLeadsService {
  
  /**
   * Get all leads with filtering, pagination, and sorting
   * @param {Object} queryParams - Query parameters
   * @param {Object} user - Current user context
   * @returns {Promise<Object>} Paginated leads data
   */
  async getAllLeads(queryParams, user) {
    try {
      // Calculate pagination
      const pagination = calculatePagination(queryParams, {
        defaultPage: 1,
        defaultLimit: 25,
        maxLimit: 100
      });

      // Build sort options
      const allowedSortFields = [
        'created_at', 'updated_at', 'lead_name', 'email', 'status', 'priority', 'industry'
      ];
      const order = buildSortOptions(queryParams, allowedSortFields, 'created_at', 'DESC');

      // Build filter options
      const filterMappings = {
        status: 'status',
        portal_id: 'portalId',
        agency_id: 'assignments.agencyId',
        industry: 'industry',
        priority: 'priority',
        created_from: 'created_at',
        created_to: 'created_at',
        assigned_from: 'assignments.assigned_at',
        assigned_to: 'assignments.assigned_at'
      };
      const where = buildFilterOptions(queryParams, filterMappings);

      // Build search options
      const searchFields = ['lead_name', 'email', 'phone_number', 'city', 'zipcode'];
      const searchWhere = buildSearchOptions(queryParams, searchFields, 'search');

      // Combine where conditions
      const finalWhere = {
        ...where,
        ...searchWhere
      };

      // Build include options for related data
      const include = [
        {
          model: Portal,
          as: 'portal',
          attributes: ['id', 'name', 'slug', 'status'],
          required: false
        },
        {
          model: LeadAssignment,
          as: 'assignments',
          attributes: ['id', 'assignment_type', 'status', 'assigned_at', 'accepted_at'],
          include: [
            {
              model: Agency,
              as: 'agency',
              attributes: ['id', 'business_name', 'email', 'status']
            }
          ],
          required: false
        }
      ];

      // Execute query with pagination
      const { count, rows: leads } = await Lead.findAndCountAll({
        where: finalWhere,
        include,
        order,
        ...buildSequelizeOptions(pagination),
        distinct: true // Important for count with includes
      });

      // Build pagination response
      const paginationResponse = buildPaginationResponse(pagination, count);

      // Transform data for response
      const transformedLeads = leads.map(lead => this.transformLeadData(lead));

      return {
        success: true,
        data: transformedLeads,
        pagination: paginationResponse,
        message: `Retrieved ${leads.length} leads successfully`
      };
    } catch (error) {
      throw new Error(`Failed to retrieve leads: ${error.message}`);
    }
  }

  /**
   * Get detailed lead information by ID
   * @param {string} leadId - Lead ID
   * @param {Object} user - Current user context
   * @returns {Promise<Object>} Lead details
   */
  async getLeadById(leadId, user) {
    try {
      const lead = await Lead.findByPk(leadId, {
        include: [
          {
            model: Portal,
            as: 'portal',
            attributes: ['id', 'name', 'slug', 'status', 'webhook_url']
          },
          {
            model: LeadAssignment,
            as: 'assignments',
            attributes: ['id', 'assignment_type', 'status', 'assigned_at', 'accepted_at', 'rejected_at', 'rejection_reason', 'notes'],
            include: [
              {
                model: Agency,
                as: 'agency',
                attributes: ['id', 'business_name', 'email', 'phone_number', 'status']
              }
            ],
            order: [['created_at', 'DESC']]
          },
          {
            model: WebhookAudit,
            as: 'webhookAudits',
            attributes: ['id', 'raw_payload', 'headers', 'status', 'error_message', 'received_at'],
            order: [['received_at', 'DESC']],
            limit: 5
          }
        ]
      });

      if (!lead) {
        throw new Error('Lead not found');
      }

      // Log view action
      await this.logAuditAction(user, 'view_lead', 'Lead', leadId, {
        lead_name: lead.lead_name,
        status: lead.status
      });

      return {
        success: true,
        data: this.transformLeadData(lead),
        message: 'Lead details retrieved successfully'
      };
    } catch (error) {
      throw new Error(`Failed to retrieve lead: ${error.message}`);
    }
  }

  /**
   * Reassign lead to different agency
   * @param {string} leadId - Lead ID
   * @param {string} agencyId - New agency ID
   * @param {Object} user - Current user context
   * @param {Object} options - Reassignment options
   * @returns {Promise<Object>} Reassignment result
   */
  async reassignLead(leadId, agencyId, user, options = {}) {
    try {
      const { reason, priority = 0, notes } = options;

      // Verify lead exists
      const lead = await Lead.findByPk(leadId);
      if (!lead) {
        throw new Error('Lead not found');
      }

      // Verify agency exists and is active
      const agency = await Agency.findByPk(agencyId);
      if (!agency || agency.status !== 'active') {
        throw new Error('Agency not found or inactive');
      }

      // Check if lead is already assigned to this agency
      const existingAssignment = await LeadAssignment.findOne({
        where: {
          leadId,
          agencyId,
          status: ['pending', 'accepted']
        }
      });

      if (existingAssignment) {
        throw new Error('Lead is already assigned to this agency');
      }

      // Create new assignment
      const assignment = await LeadAssignment.create({
        leadId,
        agencyId,
        assignmentType: 'manual',
        status: 'pending',
        assignedBy: user.id,
        assignedAt: new Date(),
        priority,
        notes,
        metadata: {
          reassignment_reason: reason,
          reassigned_by: user.id,
          reassigned_at: new Date()
        }
      });

      // Update lead status
      await lead.update({
        status: 'assigned',
        updated_at: new Date()
      });

      // Log reassignment action
      await this.logAuditAction(user, 'reassign_lead', 'Lead', leadId, {
        lead_name: lead.lead_name,
        new_agency_id: agencyId,
        new_agency_name: agency.business_name,
        reason,
        assignment_id: assignment.id
      });

      // Send notification to agency
      try {
        const notificationService = require('./notificationService');
        const supabase = require('../config/supabaseClient');
        const { data: lead } = await supabase
          .from('leads')
          .select('*')
          .eq('id', leadId)
          .single();
        
        if (lead) {
          await notificationService.notifyLeadAssigned(agencyId, leadId, lead);
        }
      } catch (notifError) {
        // Log but don't fail - notification is non-critical
        console.warn('Failed to send notification (non-critical):', notifError.message);
      }
      // await this.notifyAgency(agencyId, leadId, 'lead_reassigned');

      return {
        success: true,
        data: {
          assignment: assignment.toJSON(),
          lead: {
            id: lead.id,
            status: lead.status,
            updated_at: lead.updated_at
          }
        },
        message: 'Lead reassigned successfully'
      };
    } catch (error) {
      throw new Error(`Failed to reassign lead: ${error.message}`);
    }
  }

  /**
   * Get lead statistics and conversion metrics
   * @param {Object} queryParams - Query parameters for filtering
   * @param {Object} user - Current user context
   * @returns {Promise<Object>} Statistics data
   */
  async getLeadStats(queryParams, user) {
    try {
      const { 
        portal_id, 
        agency_id, 
        industry, 
        date_from, 
        date_to,
        group_by = 'overall' // overall, portal, agency, industry, date
      } = queryParams;

      // Build date filter
      const dateFilter = {};
      if (date_from) dateFilter[Op.gte] = new Date(date_from);
      if (date_to) dateFilter[Op.lte] = new Date(date_to);

      // Base where conditions
      const where = {
        ...(dateFilter.created_at ? { created_at: dateFilter } : {}),
        ...(portal_id ? { portalId } : {}),
        ...(industry ? { industry } : {})
      };

      // Get basic lead counts
      const totalLeads = await Lead.count({ where });
      const distributedLeads = await Lead.count({ 
        where: { ...where, status: 'distributed' } 
      });
      const assignedLeads = await Lead.count({ 
        where: { ...where, status: 'assigned' } 
      });
      const convertedLeads = await Lead.count({ 
        where: { ...where, status: 'converted' } 
      });
      const archivedLeads = await Lead.count({ 
        where: { ...where, status: 'archived' } 
      });

      // Get assignment statistics
      const assignmentWhere = {};
      if (agency_id) assignmentWhere.agencyId = agency_id;
      if (dateFilter.created_at) assignmentWhere.created_at = dateFilter;

      const totalAssignments = await LeadAssignment.count({ where: assignmentWhere });
      const acceptedAssignments = await LeadAssignment.count({ 
        where: { ...assignmentWhere, status: 'accepted' } 
      });
      const rejectedAssignments = await LeadAssignment.count({ 
        where: { ...assignmentWhere, status: 'rejected' } 
      });

      // Calculate conversion rates
      const conversionRate = totalLeads > 0 ? (convertedLeads / totalLeads) * 100 : 0;
      const assignmentAcceptanceRate = totalAssignments > 0 ? (acceptedAssignments / totalAssignments) * 100 : 0;

      // Get portal statistics
      const portalStats = await this.getPortalStats(where);
      
      // Get agency statistics
      const agencyStats = await this.getAgencyStats(assignmentWhere);

      // Get industry breakdown
      const industryStats = await this.getIndustryStats(where);

      // Get time-based trends (last 30 days)
      const trendData = await this.getTrendData(where);

      const stats = {
        overview: {
          total_leads: totalLeads,
          distributed_leads: distributedLeads,
          assigned_leads: assignedLeads,
          converted_leads: convertedLeads,
          archived_leads: archivedLeads,
          conversion_rate: Math.round(conversionRate * 100) / 100
        },
        assignments: {
          total_assignments: totalAssignments,
          accepted_assignments: acceptedAssignments,
          rejected_assignments: rejectedAssignments,
          acceptance_rate: Math.round(assignmentAcceptanceRate * 100) / 100
        },
        portals: portalStats,
        agencies: agencyStats,
        industries: industryStats,
        trends: trendData,
        generated_at: new Date().toISOString()
      };

      return {
        success: true,
        data: stats,
        message: 'Lead statistics retrieved successfully'
      };
    } catch (error) {
      throw new Error(`Failed to retrieve lead statistics: ${error.message}`);
    }
  }

  /**
   * Export leads to CSV
   * @param {Object} queryParams - Export parameters
   * @param {Object} user - Current user context
   * @returns {Promise<Object>} Export result
   */
  async exportLeads(queryParams, user) {
    try {
      // Build filters (similar to getAllLeads)
      const filterMappings = {
        status: 'status',
        portal_id: 'portalId',
        agency_id: 'assignments.agencyId',
        industry: 'industry',
        priority: 'priority',
        created_from: 'created_at',
        created_to: 'created_at'
      };
      const where = buildFilterOptions(queryParams, filterMappings);

      const searchFields = ['lead_name', 'email', 'phone_number', 'city', 'zipcode'];
      const searchWhere = buildSearchOptions(queryParams, searchFields, 'search');

      const finalWhere = {
        ...where,
        ...searchWhere
      };

      // Get all leads (no pagination for export)
      const leads = await Lead.findAll({
        where: finalWhere,
        include: [
          {
            model: Portal,
            as: 'portal',
            attributes: ['id', 'name', 'slug']
          },
          {
            model: LeadAssignment,
            as: 'assignments',
            attributes: ['id', 'assignment_type', 'status', 'assigned_at'],
            include: [
              {
                model: Agency,
                as: 'agency',
                attributes: ['id', 'business_name', 'email']
              }
            ],
            order: [['created_at', 'DESC']]
          }
        ],
        order: [['created_at', 'DESC']]
      });

      // Transform data for export
      const transformedLeads = leads.map(lead => this.transformLeadData(lead));

      // Generate CSV export
      const exportResult = await exportLeadsToCSV(transformedLeads, {
        filename: `leads_export_${new Date().toISOString().split('T')[0]}.csv`
      });

      // Log export action
      await this.logAuditAction(user, 'export_leads', 'Lead', null, {
        export_filename: exportResult.filename,
        record_count: exportResult.recordCount,
        filters_applied: queryParams
      });

      return {
        success: true,
        data: {
          download_url: exportResult.downloadUrl,
          filename: exportResult.filename,
          record_count: exportResult.recordCount,
          file_size: exportResult.stats.size
        },
        message: `Export completed successfully. ${exportResult.recordCount} records exported.`
      };
    } catch (error) {
      throw new Error(`Failed to export leads: ${error.message}`);
    }
  }

  /**
   * Archive old leads
   * @param {Object} options - Archive options
   * @param {Object} user - Current user context
   * @returns {Promise<Object>} Archive result
   */
  async archiveLeads(options, user) {
    try {
      const {
        older_than_days = 90,
        status_filter = ['converted', 'lost'],
        dry_run = false
      } = options;

      // Calculate cutoff date
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - older_than_days);

      // Build where conditions
      const where = {
        created_at: { [Op.lt]: cutoffDate },
        status: { [Op.in]: status_filter }
      };

      // Get leads to archive
      const leadsToArchive = await Lead.findAll({
        where,
        attributes: ['id', 'lead_name', 'status', 'created_at']
      });

      if (leadsToArchive.length === 0) {
        return {
          success: true,
          data: {
            archived_count: 0,
            dry_run: dry_run
          },
          message: 'No leads found matching archive criteria'
        };
      }

      if (dry_run) {
        return {
          success: true,
          data: {
            leads_to_archive: leadsToArchive.map(lead => ({
              id: lead.id,
              lead_name: lead.lead_name,
              status: lead.status,
              created_at: lead.created_at
            })),
            count: leadsToArchive.length,
            dry_run: true
          },
          message: `Dry run completed. ${leadsToArchive.length} leads would be archived.`
        };
      }

      // Archive leads
      const archiveResult = await Lead.update(
        { 
          status: 'archived',
          updated_at: new Date()
        },
        { 
          where,
          returning: true
        }
      );

      const archivedCount = archiveResult[1].length;

      // Log archive action
      await this.logAuditAction(user, 'archive_leads', 'Lead', null, {
        archived_count: archivedCount,
        older_than_days,
        status_filter,
        cutoff_date: cutoffDate.toISOString()
      });

      return {
        success: true,
        data: {
          archived_count: archivedCount,
          cutoff_date: cutoffDate.toISOString(),
          dry_run: false
        },
        message: `Successfully archived ${archivedCount} leads.`
      };
    } catch (error) {
      throw new Error(`Failed to archive leads: ${error.message}`);
    }
  }

  // Helper methods

  /**
   * Transform lead data for response
   * @param {Object} lead - Lead object
   * @returns {Object} Transformed lead data
   */
  transformLeadData(lead) {
    const leadData = lead.toJSON();
    
    // Flatten assignments for easier access
    if (leadData.assignments && leadData.assignments.length > 0) {
      leadData.current_assignment = leadData.assignments[0];
      leadData.assignment_history = leadData.assignments;
    }

    return leadData;
  }

  /**
   * Get portal statistics
   * @param {Object} where - Where conditions
   * @returns {Promise<Array>} Portal statistics
   */
  async getPortalStats(where) {
    const portalStats = await Lead.findAll({
      where,
      include: [
        {
          model: Portal,
          as: 'portal',
          attributes: ['id', 'name']
        }
      ],
      attributes: [
        'portalId',
        [Lead.sequelize.fn('COUNT', Lead.sequelize.col('Lead.id')), 'total_leads'],
        [Lead.sequelize.fn('COUNT', Lead.sequelize.literal('CASE WHEN "Lead"."status" = \'converted\' THEN 1 END')), 'converted_leads']
      ],
      group: ['portalId', 'portal.id', 'portal.name'],
      raw: true
    });

    return portalStats.map(stat => ({
      portal_id: stat.portalId,
      portal_name: stat.portal?.name || 'Unknown',
      total_leads: parseInt(stat.total_leads),
      converted_leads: parseInt(stat.converted_leads),
      conversion_rate: stat.total_leads > 0 ? 
        Math.round((stat.converted_leads / stat.total_leads) * 10000) / 100 : 0
    }));
  }

  /**
   * Get agency statistics
   * @param {Object} where - Where conditions
   * @returns {Promise<Array>} Agency statistics
   */
  async getAgencyStats(where) {
    const agencyStats = await LeadAssignment.findAll({
      where,
      include: [
        {
          model: Agency,
          as: 'agency',
          attributes: ['id', 'business_name']
        }
      ],
      attributes: [
        'agencyId',
        [LeadAssignment.sequelize.fn('COUNT', LeadAssignment.sequelize.col('LeadAssignment.id')), 'total_assignments'],
        [LeadAssignment.sequelize.fn('COUNT', LeadAssignment.sequelize.literal('CASE WHEN "LeadAssignment"."status" = \'accepted\' THEN 1 END')), 'accepted_assignments']
      ],
      group: ['agencyId', 'agency.id', 'agency.business_name'],
      raw: true
    });

    return agencyStats.map(stat => ({
      agency_id: stat.agencyId,
      agency_name: stat.agency?.business_name || 'Unknown',
      total_assignments: parseInt(stat.total_assignments),
      accepted_assignments: parseInt(stat.accepted_assignments),
      acceptance_rate: stat.total_assignments > 0 ? 
        Math.round((stat.accepted_assignments / stat.total_assignments) * 10000) / 100 : 0
    }));
  }

  /**
   * Get industry statistics
   * @param {Object} where - Where conditions
   * @returns {Promise<Array>} Industry statistics
   */
  async getIndustryStats(where) {
    const industryStats = await Lead.findAll({
      where,
      attributes: [
        'industry',
        [Lead.sequelize.fn('COUNT', Lead.sequelize.col('Lead.id')), 'total_leads'],
        [Lead.sequelize.fn('COUNT', Lead.sequelize.literal('CASE WHEN "Lead"."status" = \'converted\' THEN 1 END')), 'converted_leads']
      ],
      group: ['industry'],
      raw: true
    });

    return industryStats.map(stat => ({
      industry: stat.industry || 'Unknown',
      total_leads: parseInt(stat.total_leads),
      converted_leads: parseInt(stat.converted_leads),
      conversion_rate: stat.total_leads > 0 ? 
        Math.round((stat.converted_leads / stat.total_leads) * 10000) / 100 : 0
    }));
  }

  /**
   * Get trend data for charts
   * @param {Object} where - Where conditions
   * @returns {Promise<Array>} Trend data
   */
  async getTrendData(where) {
    const trendData = await Lead.findAll({
      where: {
        ...where,
        created_at: {
          [Op.gte]: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
        }
      },
      attributes: [
        [Lead.sequelize.fn('DATE', Lead.sequelize.col('created_at')), 'date'],
        [Lead.sequelize.fn('COUNT', Lead.sequelize.col('Lead.id')), 'total_leads'],
        [Lead.sequelize.fn('COUNT', Lead.sequelize.literal('CASE WHEN "Lead"."status" = \'converted\' THEN 1 END')), 'converted_leads']
      ],
      group: [Lead.sequelize.fn('DATE', Lead.sequelize.col('created_at'))],
      order: [[Lead.sequelize.fn('DATE', Lead.sequelize.col('created_at')), 'ASC']],
      raw: true
    });

    return trendData.map(stat => ({
      date: stat.date,
      total_leads: parseInt(stat.total_leads),
      converted_leads: parseInt(stat.converted_leads),
      conversion_rate: stat.total_leads > 0 ? 
        Math.round((stat.converted_leads / stat.total_leads) * 10000) / 100 : 0
    }));
  }

  /**
   * Log audit action
   * @param {Object} user - User context
   * @param {string} action - Action performed
   * @param {string} resourceType - Resource type
   * @param {string} resourceId - Resource ID
   * @param {Object} changes - Changes made
   */
  async logAuditAction(user, action, resourceType, resourceId, changes = {}) {
    try {
      await AuditLog.create({
        actorId: user.id,
        actorType: 'user',
        action,
        resourceType,
        resourceId,
        changes,
        ipAddress: user.ipAddress || null,
        userAgent: user.userAgent || null
      });
    } catch (error) {
      console.error('Failed to log audit action:', error);
    }
  }

  /**
   * ====================================================================
   * LEAD DISTRIBUTION METHODS
   * ====================================================================
   */

  /**
   * Distribute a lead to an eligible agency
   * @param {string} leadId - Lead ID
   * @param {Object} user - User context
   * @returns {Promise<Object>} Distribution result
   */
  async distributeLead(leadId, user) {
    try {
      console.log(`📊 Starting distribution for lead ${leadId}`);

      // Get lead details
      const lead = await Lead.findByPk(leadId);

      if (!lead) {
        return {
          success: false,
          message: 'Lead not found',
          lead_id: leadId
        };
      }

      // Check if lead is already assigned
      if (lead.status === 'assigned' || lead.assignedAgencyId) {
        return {
          success: false,
          message: 'Lead is already assigned to an agency',
          lead_id: leadId
        };
      }

      // Find eligible agencies
      const eligibleAgencies = await this.findEligibleAgencies(
        lead.zipcode || lead.territory,
        lead.industry
      );

      if (eligibleAgencies.length === 0) {
        console.log('⚠️ No eligible agencies found');
        return {
          success: false,
          message: 'No agencies available for this territory/industry',
          lead_id: leadId
        };
      }

      // Filter by subscription capacity
      const agenciesWithCapacity = await this.filterBySubscriptionLimits(eligibleAgencies);

      if (agenciesWithCapacity.length === 0) {
        console.log('⚠️ All agencies at capacity');
        return {
          success: false,
          message: 'All agencies have reached their subscription limits',
          lead_id: leadId
        };
      }

      // Select agency using round-robin
      const selectedAgency = await this.selectAgencyRoundRobin(
        agenciesWithCapacity,
        lead.zipcode || lead.territory
      );

      // Assign lead
      const assignment = await LeadAssignment.create({
        leadId: lead.id,
        agencyId: selectedAgency.id,
        assignedAt: new Date(),
        assignmentMethod: 'auto_distribution',
        status: 'assigned'
      });

      // Update lead
      await lead.update({
        status: 'assigned',
        assignedAgencyId: selectedAgency.id,
        assignedAt: new Date()
      });

      // Update distribution sequence
      await this.updateDistributionSequence(
        selectedAgency.id,
        lead.zipcode || lead.territory
      );

      // Log audit
      await this.logAuditAction(user, 'distribute_lead', 'lead', leadId, {
        agency_id: selectedAgency.id,
        agency_name: selectedAgency.businessName,
        method: 'auto_distribution'
      });

      console.log(`✅ Lead ${leadId} assigned to agency ${selectedAgency.businessName}`);

      return {
        success: true,
        lead_id: leadId,
        agency_id: selectedAgency.id,
        agency_name: selectedAgency.businessName,
        assignment_id: assignment.id,
        distribution_method: 'round-robin'
      };

    } catch (error) {
      console.error('❌ Lead distribution error:', error);
      return {
        success: false,
        message: error.message,
        lead_id: leadId
      };
    }
  }

  /**
   * Find agencies matching territory and industry
   * @param {string} territory - Zipcode or city
   * @param {string} industry - Industry type
   * @returns {Promise<Array>} Eligible agencies
   */
  async findEligibleAgencies(territory, industry) {
    try {
      // Find active agencies with subscriptions covering this territory
      const agencies = await Agency.findAll({
        where: {
          isActive: true,
          // Territory matching logic - simplified for now
          // In production, you'd have a proper territories relationship
        },
        include: [{
          association: 'subscriptions',
          where: {
            status: 'active',
            isActive: true
          },
          required: true
        }]
      });

      // Filter by industry match (prioritize matching industry)
      const industryMatches = agencies.filter(a => a.industryType === industry);
      
      return industryMatches.length > 0 ? industryMatches : agencies;

    } catch (error) {
      console.error('Error finding eligible agencies:', error);
      return [];
    }
  }

  /**
   * Filter agencies by subscription capacity
   * @param {Array} agencies - Agencies to check
   * @returns {Promise<Array>} Agencies with capacity
   */
  async filterBySubscriptionLimits(agencies) {
    const agenciesWithCapacity = [];

    for (const agency of agencies) {
      // Get subscription plan limits
      const subscription = agency.subscriptions?.[0];
      if (!subscription) continue;

      const maxLeads = subscription.maxUnits || subscription.baseUnits || 100;

      // Get current month lead count
      const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      
      const leadCount = await LeadAssignment.count({
        where: {
          agencyId: agency.id,
          assignedAt: {
            [Op.gte]: startOfMonth
          }
        }
      });

      // Check capacity
      if (leadCount < maxLeads) {
        agenciesWithCapacity.push({
          ...agency.toJSON(),
          currentLeadCount: leadCount,
          maxLeads: maxLeads,
          capacityRemaining: maxLeads - leadCount
        });
      }
    }

    return agenciesWithCapacity;
  }

  /**
   * Select agency using round-robin algorithm
   * @param {Array} agencies - Agencies with capacity
   * @param {string} territory - Territory
   * @returns {Object} Selected agency
   */
  async selectAgencyRoundRobin(agencies, territory) {
    try {
      // This is a simplified version
      // In production, you'd query the lead_distribution_sequence table
      
      // For now, return the agency with the least leads
      let selectedAgency = agencies[0];
      let minLeads = agencies[0].currentLeadCount || 0;

      for (const agency of agencies) {
        const leadCount = agency.currentLeadCount || 0;
        if (leadCount < minLeads) {
          minLeads = leadCount;
          selectedAgency = agency;
        }
      }

      return selectedAgency;

    } catch (error) {
      console.error('Error in round-robin selection:', error);
      return agencies[0];
    }
  }

  /**
   * Update distribution sequence
   * @param {string} agencyId - Agency ID
   * @param {string} territory - Territory
   */
  async updateDistributionSequence(agencyId, territory) {
    // This method is implemented in leadDistributionService
    // This is kept for backward compatibility
    // Actual sequence tracking is handled by leadDistributionService.updateDistributionSequence()
    try {
      const supabase = require('../config/supabaseClient');
      const territoryKey = territory || 'default';
      
      // Update or insert sequence record
      const { data: existing } = await supabase
        .from('lead_distribution_sequence')
        .select('id')
        .eq('agency_id', agencyId)
        .eq('territory', territoryKey)
        .single();
      
      if (existing) {
        await supabase
          .from('lead_distribution_sequence')
          .update({ 
            last_assigned_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id);
      } else {
        await supabase
          .from('lead_distribution_sequence')
          .insert([{
            agency_id: agencyId,
            territory: territoryKey,
            last_assigned_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }]);
      }
    } catch (error) {
      // Table might not exist - that's okay
      console.debug('Distribution sequence update skipped:', error.message);
    }
  }

  /**
   * Batch distribute multiple leads
   * @param {number} limit - Max leads to distribute
   * @param {Object} user - User context
   * @returns {Promise<Object>} Batch results
   */
  async batchDistribute(limit, user) {
    try {
      // Get unassigned leads
      const leads = await Lead.findAll({
        where: {
          [Op.or]: [
            { status: 'new' },
            { status: null }
          ],
          assignedAgencyId: null
        },
        limit: limit
      });

      if (leads.length === 0) {
        return {
          total: 0,
          successful: 0,
          failed: 0,
          assignments: [],
          errors: []
        };
      }

      const results = {
        total: leads.length,
        successful: 0,
        failed: 0,
        assignments: [],
        errors: []
      };

      // Distribute each lead
      for (const lead of leads) {
        const result = await this.distributeLead(lead.id, user);
        
        if (result.success) {
          results.successful++;
          results.assignments.push(result);
        } else {
          results.failed++;
          results.errors.push(result);
        }
      }

      return results;

    } catch (error) {
      console.error('Error in batch distribute:', error);
      throw error;
    }
  }

  /**
   * Get distribution statistics
   * @param {string} territory - Optional territory filter
   * @returns {Promise<Object>} Distribution stats
   */
  async getDistributionStats(territory = null) {
    try {
      // Get all assignments
      const where = {};
      if (territory) {
        // Add territory filter if needed
      }

      const assignments = await LeadAssignment.findAll({
        where,
        include: [{
          model: Agency,
          as: 'agency',
          attributes: ['id', 'businessName']
        }, {
          model: Lead,
          as: 'lead',
          attributes: ['id', 'zipcode', 'territory']
        }]
      });

      // Group by agency
      const byAgency = {};
      for (const assignment of assignments) {
        const agencyId = assignment.agencyId;
        if (!byAgency[agencyId]) {
          byAgency[agencyId] = {
            agency_id: agencyId,
            agency_name: assignment.agency?.businessName || 'Unknown',
            leads_assigned: 0,
            territories: new Set()
          };
        }
        byAgency[agencyId].leads_assigned++;
        if (assignment.lead?.territory) {
          byAgency[agencyId].territories.add(assignment.lead.territory);
        }
      }

      // Convert to array
      const stats = {
        total_agencies: Object.keys(byAgency).length,
        total_leads_distributed: assignments.length,
        by_agency: Object.values(byAgency).map(a => ({
          ...a,
          territories: Array.from(a.territories)
        }))
      };

      return stats;

    } catch (error) {
      console.error('Error getting distribution stats:', error);
      throw error;
    }
  }

  /**
   * Test distribution eligibility
   * @param {string} leadId - Lead ID
   * @returns {Promise<Object>} Eligibility info
   */
  async testDistributionEligibility(leadId) {
    try {
      const lead = await Lead.findByPk(leadId);

      if (!lead) {
        throw new Error('Lead not found');
      }

      const eligibleAgencies = await this.findEligibleAgencies(
        lead.zipcode || lead.territory,
        lead.industry
      );

      const agenciesWithCapacity = await this.filterBySubscriptionLimits(eligibleAgencies);

      return {
        lead_id: leadId,
        territory: lead.zipcode || lead.territory,
        industry: lead.industry,
        eligible_agencies: eligibleAgencies.length,
        agencies_with_capacity: agenciesWithCapacity.length,
        agencies: agenciesWithCapacity.map(a => ({
          id: a.id,
          business_name: a.businessName,
          industry_type: a.industryType,
          current_leads: a.currentLeadCount,
          max_leads: a.maxLeads,
          capacity_remaining: a.capacityRemaining
        }))
      };

    } catch (error) {
      console.error('Error testing eligibility:', error);
      throw error;
    }
  }

  /**
   * Reassign lead to different agency
   * @param {string} leadId - Lead ID
   * @param {string} agencyId - New agency ID
   * @param {Object} user - User context
   * @returns {Promise<Object>} Assignment result
   */
  async reassignLeadToAgency(leadId, agencyId, user) {
    try {
      const lead = await Lead.findByPk(leadId);

      if (!lead) {
        throw new Error('Lead not found');
      }

      // Archive old assignment
      if (lead.assignedAgencyId) {
        await LeadAssignment.update(
          { status: 'reassigned' },
          {
            where: {
              leadId: leadId,
              agencyId: lead.assignedAgencyId
            }
          }
        );
      }

      // Create new assignment
      const assignment = await LeadAssignment.create({
        leadId: leadId,
        agencyId: agencyId,
        assignedAt: new Date(),
        assignmentMethod: 'manual_reassignment',
        status: 'assigned'
      });

      // Update lead
      await lead.update({
        status: 'assigned',
        assignedAgencyId: agencyId,
        assignedAt: new Date()
      });

      // Log audit
      await this.logAuditAction(user, 'reassign_lead', 'lead', leadId, {
        old_agency_id: lead.assignedAgencyId,
        new_agency_id: agencyId,
        method: 'manual'
      });

      return assignment;

    } catch (error) {
      console.error('Error reassigning lead:', error);
      throw error;
    }
  }
}

module.exports = new AdminLeadsService();

