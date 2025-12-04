/**
 * Mobile Messaging Controller
 * Handles mobile messaging and conversation management
 */


const express = require('express');
const router = express.Router();
const supabase = require('../config/supabaseClient');
const admin = require('../config/firebaseAdmin');
const { authenticateAgency } = require('../middleware/agencyAuth');

// 🚀 TEST PUSH NOTIFICATION
router.post('/test-notification', authenticateAgency, async (req, res) => {
  try {
    const agencyId = req.agency.id;

    // Fetch agency FCM token
    const { data: agency, error } = await supabase
      .from("agencies")
      .select("fcm_token")
      .eq("id", agencyId)
      .single();

    if (error || !agency || !agency.fcm_token) {
      return res.status(400).json({
        success: false,
        message: "No FCM token found for this agency. Login again to refresh token."
      });
    }

    const message = {
      token: agency.fcm_token,
      notification: {
        title: "Test Notification 🎉",
        body: "Your push notifications are working!",
      },
      android: {
        priority: "high",
      },
      data: {
        action: "open_app",
        screen: "dashboard"
      }
    };

    await admin.messaging().send(message);

    return res.json({
      success: true,
      message: "Test notification sent successfully!"
    });

  } catch (err) {
    console.error("❌ Test notification error:", err);
    res.status(500).json({
      success: false,
      message: "Error sending test notification",
      error: err.message
    });
  }
});

module.exports = router;



const { MobileConversation, MobileMessage, MobileMessageTemplate, Lead, Agency, AuditLog } = require('../models');
const { Op } = require('sequelize');

/**
 * GET /api/mobile/conversations
 * Get agency's active conversations
 */
exports.getConversations = async (req, res) => {
  try {
    const agencyId = req.agency.id;
    const { status = 'active', page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const where = { agencyId };
    if (status) {
      where.status = status;
    }

    const conversations = await MobileConversation.findAndCountAll({
      where,
      include: [
        {
          model: Lead,
          as: 'lead',
          attributes: ['id', 'leadName', 'email', 'phoneNumber', 'city', 'state', 'leadData']
        }
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['last_message_at', 'DESC']]
    });

    res.status(200).json({
      success: true,
      data: {
        conversations: conversations.rows.map(conv => ({
          id: conv.id,
          leadId: conv.leadId,
          prospectPhone: conv.prospectPhone,
          status: conv.status,
          startedAt: conv.startedAt,
          lastMessageAt: conv.lastMessageAt,
          messageCount: conv.messageCount,
          lead: conv.lead ? {
            id: conv.lead.id,
            leadName: conv.lead.leadName,
            email: conv.lead.email,
            phoneNumber: conv.lead.phoneNumber,
            city: conv.lead.city,
            state: conv.lead.state,
            leadData: conv.lead.leadData
          } : null
        })),
        pagination: {
          total: conversations.count,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(conversations.count / limit)
        }
      }
    });

  } catch (error) {
    console.error('Error in getConversations:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
  }
};

/**
 * GET /api/mobile/conversations/:conversationId/messages
 * Get messages for a specific conversation
 */
exports.getConversationMessages = async (req, res) => {
  try {
    const agencyId = req.agency.id;
    const { conversationId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    // Verify conversation belongs to agency
    const conversation = await MobileConversation.findOne({
      where: {
        id: conversationId,
        agencyId: agencyId
      }
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    const messages = await MobileMessage.findAndCountAll({
      where: { conversationId },
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['created_at', 'ASC']]
    });

    res.status(200).json({
      success: true,
      data: {
        messages: messages.rows.map(msg => ({
          id: msg.id,
          senderType: msg.senderType,
          senderId: msg.senderId,
          messageText: msg.messageText,
          messageType: msg.messageType,
          templateId: msg.templateId,
          isRead: msg.isRead,
          readAt: msg.readAt,
          metadata: msg.metadata,
          createdAt: msg.createdAt
        })),
        pagination: {
          total: messages.count,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(messages.count / limit)
        }
      }
    });

  } catch (error) {
    console.error('Error in getConversationMessages:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
  }
};

/**
 * POST /api/mobile/conversations/:conversationId/messages
 * Send a message in a conversation
 */
exports.sendMessage = async (req, res) => {
  try {
    const agencyId = req.agency.id;
    const { conversationId } = req.params;
    const { messageText, messageType = 'text', templateId } = req.body;

    // Verify conversation belongs to agency
    const conversation = await MobileConversation.findOne({
      where: {
        id: conversationId,
        agencyId: agencyId
      }
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    if (conversation.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: 'Cannot send message to inactive conversation'
      });
    }

    // Create message
    const message = await MobileMessage.create({
      conversationId,
      senderType: 'agency',
      senderId: agencyId,
      messageText,
      messageType,
      templateId
    });

    // Update conversation
    await conversation.update({
      lastMessageAt: new Date(),
      messageCount: conversation.messageCount + 1
    });

    // Log the action
    await AuditLog.create({
      action: 'mobile_message_sent',
      entityType: 'mobile_message',
      entityId: message.id,
      userId: agencyId,
      userRole: 'agency',
      details: {
        conversationId,
        messageType,
        templateId
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      data: {
        message: {
          id: message.id,
          senderType: message.senderType,
          senderId: message.senderId,
          messageText: message.messageText,
          messageType: message.messageType,
          templateId: message.templateId,
          createdAt: message.createdAt
        }
      }
    });

  } catch (error) {
    console.error('Error in sendMessage:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
  }
};

/**
 * POST /api/mobile/conversations
 * Start a new conversation with a lead
 */
exports.startConversation = async (req, res) => {
  try {
    const agencyId = req.agency.id;
    const { leadId, prospectPhone } = req.body;

    // Check if lead exists and is accessible
    const lead = await Lead.findByPk(leadId);
    if (!lead) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found'
      });
    }

    // Check if conversation already exists
    const existingConversation = await MobileConversation.findOne({
      where: {
        leadId,
        agencyId
      }
    });

    if (existingConversation) {
      return res.status(409).json({
        success: false,
        message: 'Conversation already exists for this lead',
        data: {
          conversationId: existingConversation.id
        }
      });
    }

    // Create new conversation
    const conversation = await MobileConversation.create({
      leadId,
      agencyId,
      prospectPhone: prospectPhone || lead.phoneNumber,
      status: 'active'
    });

    // Log the action
    await AuditLog.create({
      action: 'mobile_conversation_started',
      entityType: 'mobile_conversation',
      entityId: conversation.id,
      userId: agencyId,
      userRole: 'agency',
      details: {
        leadId,
        prospectPhone: conversation.prospectPhone
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.status(201).json({
      success: true,
      message: 'Conversation started successfully',
      data: {
        conversation: {
          id: conversation.id,
          leadId: conversation.leadId,
          prospectPhone: conversation.prospectPhone,
          status: conversation.status,
          startedAt: conversation.startedAt
        }
      }
    });

  } catch (error) {
    console.error('Error in startConversation:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
  }
};

/**
 * PUT /api/mobile/conversations/:conversationId/status
 * Update conversation status
 */
exports.updateConversationStatus = async (req, res) => {
  try {
    const agencyId = req.agency.id;
    const { conversationId } = req.params;
    const { status } = req.body;

    // Verify conversation belongs to agency
    const conversation = await MobileConversation.findOne({
      where: {
        id: conversationId,
        agencyId: agencyId
      }
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    // Update conversation status
    await conversation.update({ status });

    // Log the action
    await AuditLog.create({
      action: 'mobile_conversation_status_updated',
      entityType: 'mobile_conversation',
      entityId: conversationId,
      userId: agencyId,
      userRole: 'agency',
      details: {
        oldStatus: conversation.status,
        newStatus: status
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.status(200).json({
      success: true,
      message: 'Conversation status updated successfully',
      data: {
        conversation: {
          id: conversation.id,
          status: conversation.status
        }
      }
    });

  } catch (error) {
    console.error('Error in updateConversationStatus:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
  }
};

/**
 * GET /api/mobile/message-templates
 * Get agency's message templates
 */
exports.getMessageTemplates = async (req, res) => {
  try {
    const agencyId = req.agency.id;
    const { category, isActive = true } = req.query;

    const where = { agencyId };
    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }
    if (category) {
      where.category = category;
    }

    const templates = await MobileMessageTemplate.findAll({
      where,
      order: [['category', 'ASC'], ['template_name', 'ASC']]
    });

    res.status(200).json({
      success: true,
      data: {
        templates: templates.map(template => ({
          id: template.id,
          templateName: template.templateName,
          templateText: template.templateText,
          category: template.category,
          isActive: template.isActive,
          usageCount: template.usageCount,
          createdAt: template.createdAt,
          updatedAt: template.updatedAt
        }))
      }
    });

  } catch (error) {
    console.error('Error in getMessageTemplates:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
  }
};

/**
 * POST /api/mobile/message-templates
 * Create a new message template
 */
exports.createMessageTemplate = async (req, res) => {
  try {
    const agencyId = req.agency.id;
    const { templateName, templateText, category = 'custom' } = req.body;

    const template = await MobileMessageTemplate.create({
      agencyId,
      templateName,
      templateText,
      category
    });

    // Log the action
    await AuditLog.create({
      action: 'mobile_template_created',
      entityType: 'mobile_message_template',
      entityId: template.id,
      userId: agencyId,
      userRole: 'agency',
      details: {
        templateName,
        category
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.status(201).json({
      success: true,
      message: 'Message template created successfully',
      data: {
        template: {
          id: template.id,
          templateName: template.templateName,
          templateText: template.templateText,
          category: template.category,
          isActive: template.isActive,
          createdAt: template.createdAt
        }
      }
    });

  } catch (error) {
    console.error('Error in createMessageTemplate:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
  }
};

/**
 * PUT /api/mobile/message-templates/:templateId
 * Update a message template
 */
exports.updateMessageTemplate = async (req, res) => {
  try {
    const agencyId = req.agency.id;
    const { templateId } = req.params;
    const { templateName, templateText, category, isActive } = req.body;

    // Find template belonging to agency
    const template = await MobileMessageTemplate.findOne({
      where: {
        id: templateId,
        agencyId: agencyId
      }
    });

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }

    // Update template
    await template.update({
      templateName: templateName !== undefined ? templateName : template.templateName,
      templateText: templateText !== undefined ? templateText : template.templateText,
      category: category !== undefined ? category : template.category,
      isActive: isActive !== undefined ? isActive : template.isActive
    });

    // Log the action
    await AuditLog.create({
      action: 'mobile_template_updated',
      entityType: 'mobile_message_template',
      entityId: templateId,
      userId: agencyId,
      userRole: 'agency',
      details: {
        templateName: template.templateName,
        category: template.category
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.status(200).json({
      success: true,
      message: 'Message template updated successfully',
      data: {
        template: {
          id: template.id,
          templateName: template.templateName,
          templateText: template.templateText,
          category: template.category,
          isActive: template.isActive,
          updatedAt: template.updatedAt
        }
      }
    });

  } catch (error) {
    console.error('Error in updateMessageTemplate:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
  }
};

/**
 * DELETE /api/mobile/message-templates/:templateId
 * Delete a message template
 */
exports.deleteMessageTemplate = async (req, res) => {
  try {
    const agencyId = req.agency.id;
    const { templateId } = req.params;

    // Find template belonging to agency
    const template = await MobileMessageTemplate.findOne({
      where: {
        id: templateId,
        agencyId: agencyId
      }
    });

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }

    // Soft delete by setting isActive to false
    await template.update({ isActive: false });

    // Log the action
    await AuditLog.create({
      action: 'mobile_template_deleted',
      entityType: 'mobile_message_template',
      entityId: templateId,
      userId: agencyId,
      userRole: 'agency',
      details: {
        templateName: template.templateName,
        category: template.category
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.status(200).json({
      success: true,
      message: 'Message template deleted successfully'
    });

  } catch (error) {
    console.error('Error in deleteMessageTemplate:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
  }
};
