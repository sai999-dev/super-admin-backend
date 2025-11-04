/**
 * Email Service
 * Handles email sending for password resets, cancellations, and notifications
 */

const logger = require('../utils/logger');
const supabase = require('../config/supabaseClient');

class EmailService {
  /**
   * Initialize email service based on environment
   */
  constructor() {
    this.emailProvider = this.getEmailProvider();
  }

  /**
   * Get configured email provider
   * @private
   */
  getEmailProvider() {
    const provider = process.env.EMAIL_PROVIDER || 'nodemailer'; // nodemailer, sendgrid, ses

    try {
      switch (provider) {
        case 'sendgrid':
          return this.initSendGrid();
        case 'ses':
          return this.initSES();
        case 'nodemailer':
        default:
          return this.initNodemailer();
      }
    } catch (error) {
      logger.warn('Email provider not configured, emails will be queued:', error.message);
      return null;
    }
  }

  /**
   * Initialize Nodemailer (SMTP)
   * @private
   */
  initNodemailer() {
    try {
      if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
        return null;
      }

      const nodemailer = require('nodemailer');
      return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });
    } catch (error) {
      logger.error('Error initializing Nodemailer:', error);
      return null;
    }
  }

  /**
   * Initialize SendGrid
   * @private
   */
  initSendGrid() {
    try {
      if (!process.env.SENDGRID_API_KEY) {
        return null;
      }

      const sgMail = require('@sendgrid/mail');
      sgMail.setApiKey(process.env.SENDGRID_API_KEY);
      return sgMail;
    } catch (error) {
      logger.error('Error initializing SendGrid:', error);
      return null;
    }
  }

  /**
   * Initialize AWS SES
   * @private
   */
  initSES() {
    try {
      if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
        return null;
      }

      const AWS = require('aws-sdk');
      return new AWS.SES({
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        region: process.env.AWS_REGION || 'us-east-1'
      });
    } catch (error) {
      logger.error('Error initializing AWS SES:', error);
      return null;
    }
  }

  /**
   * Send email (generic)
   * @param {Object} emailData - Email parameters
   * @param {string} emailData.to - Recipient email
   * @param {string} emailData.subject - Email subject
   * @param {string} emailData.html - HTML body
   * @param {string} emailData.text - Plain text body
   * @param {string} emailData.from - Sender email (optional)
   * @returns {Promise<Object>} - Result
   */
  async sendEmail(emailData) {
    try {
      const { to, subject, html, text, from } = emailData;

      if (!to || !subject || (!html && !text)) {
        throw new Error('Missing required email fields: to, subject, and html/text');
      }

      const senderEmail = from || process.env.EMAIL_FROM || 'noreply@leadmarketplace.com';
      const senderName = process.env.EMAIL_FROM_NAME || 'Lead Marketplace';

      // Queue email if provider not configured
      if (!this.emailProvider) {
        return await this.queueEmail({ to, subject, html, text, from: senderEmail });
      }

      // Determine provider type
      const provider = process.env.EMAIL_PROVIDER || 'nodemailer';

      if (provider === 'sendgrid') {
        return await this.sendViaSendGrid({ to, subject, html, text, from: senderEmail, senderName });
      } else if (provider === 'ses') {
        return await this.sendViaSES({ to, subject, html, text, from: senderEmail });
      } else {
        return await this.sendViaNodemailer({ to, subject, html, text, from: senderEmail, senderName });
      }
    } catch (error) {
      logger.error('Error sending email:', error);
      throw error;
    }
  }

  /**
   * Send via Nodemailer
   * @private
   */
  async sendViaNodemailer({ to, subject, html, text, from, senderName }) {
    try {
      const mailOptions = {
        from: `"${senderName}" <${from}>`,
        to,
        subject,
        text: text || html.replace(/<[^>]*>/g, ''),
        html
      };

      const info = await this.emailProvider.sendMail(mailOptions);
      
      logger.info(`Email sent to ${to}: ${info.messageId}`);
      
      return {
        success: true,
        messageId: info.messageId,
        provider: 'nodemailer'
      };
    } catch (error) {
      logger.error('Nodemailer send error:', error);
      throw error;
    }
  }

  /**
   * Send via SendGrid
   * @private
   */
  async sendViaSendGrid({ to, subject, html, text, from, senderName }) {
    try {
      const msg = {
        to,
        from: { email: from, name: senderName },
        subject,
        text: text || html.replace(/<[^>]*>/g, ''),
        html
      };

      await this.emailProvider.send(msg);
      
      logger.info(`Email sent via SendGrid to ${to}`);
      
      return {
        success: true,
        provider: 'sendgrid'
      };
    } catch (error) {
      logger.error('SendGrid send error:', error);
      throw error;
    }
  }

  /**
   * Send via AWS SES
   * @private
   */
  async sendViaSES({ to, subject, html, text, from }) {
    try {
      const params = {
        Source: from,
        Destination: { ToAddresses: [to] },
        Message: {
          Subject: { Data: subject, Charset: 'UTF-8' },
          Body: {
            Html: { Data: html, Charset: 'UTF-8' },
            Text: { Data: text || html.replace(/<[^>]*>/g, ''), Charset: 'UTF-8' }
          }
        }
      };

      const result = await this.emailProvider.sendEmail(params).promise();
      
      logger.info(`Email sent via SES to ${to}: ${result.MessageId}`);
      
      return {
        success: true,
        messageId: result.MessageId,
        provider: 'ses'
      };
    } catch (error) {
      logger.error('SES send error:', error);
      throw error;
    }
  }

  /**
   * Queue email when provider not configured
   * @private
   */
  async queueEmail(emailData) {
    try {
      // Store in database for later processing
      const { data, error } = await supabase
        .from('email_queue')
        .insert([{
          to: emailData.to,
          subject: emailData.subject,
          body: emailData.html || emailData.text,
          status: 'pending',
          created_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (error) throw error;

      logger.info(`Email queued for ${emailData.to} (provider not configured)`);
      
      return {
        success: true,
        queued: true,
        email_id: data.id,
        message: 'Email queued (provider not configured)'
      };
    } catch (error) {
      // If email_queue table doesn't exist, just log
      logger.warn('Could not queue email:', error.message);
      return {
        success: false,
        message: 'Email provider not configured and queue unavailable'
      };
    }
  }

  /**
   * Send password reset email
   * @param {string} email - User email
   * @param {string} resetToken - Reset token
   * @param {string} resetUrl - Reset URL (optional)
   */
  async sendPasswordResetEmail(email, resetToken, resetUrl = null) {
    try {
      const baseUrl = process.env.FRONTEND_URL || process.env.APP_URL || 'https://app.leadmarketplace.com';
      const resetLink = resetUrl || `${baseUrl}/reset-password?token=${resetToken}`;

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Password Reset Request</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #4CAF50;">Password Reset Request</h2>
            <p>You requested a password reset for your Lead Marketplace account.</p>
            <p>Click the link below to reset your password:</p>
            <p style="margin: 20px 0;">
              <a href="${resetLink}" style="background-color: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
                Reset Password
              </a>
            </p>
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #666;">${resetLink}</p>
            <p style="color: #999; font-size: 12px; margin-top: 30px;">
              This link will expire in 1 hour. If you didn't request this, please ignore this email.
            </p>
          </div>
        </body>
        </html>
      `;

      return await this.sendEmail({
        to: email,
        subject: 'Reset Your Password - Lead Marketplace',
        html
      });
    } catch (error) {
      logger.error('Error sending password reset email:', error);
      throw error;
    }
  }

  /**
   * Send subscription cancellation confirmation
   * @param {string} email - Agency email
   * @param {Object} subscriptionData - Subscription details
   */
  async sendCancellationConfirmationEmail(email, subscriptionData) {
    try {
      const { plan_name, end_date, cancellation_reason } = subscriptionData;
      const endDate = end_date ? new Date(end_date).toLocaleDateString() : 'end of billing period';

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Subscription Cancelled</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #f44336;">Subscription Cancelled</h2>
            <p>Your subscription has been successfully cancelled.</p>
            <div style="background-color: #f5f5f5; padding: 15px; border-radius: 4px; margin: 20px 0;">
              <p><strong>Plan:</strong> ${plan_name || 'N/A'}</p>
              <p><strong>Access Until:</strong> ${endDate}</p>
              ${cancellation_reason ? `<p><strong>Reason:</strong> ${cancellation_reason}</p>` : ''}
            </div>
            <p>You will continue to have access to all features until ${endDate}.</p>
            <p>If you change your mind, you can reactivate your subscription anytime before then.</p>
            <p style="margin-top: 30px;">
              <a href="${process.env.FRONTEND_URL || 'https://app.leadmarketplace.com'}/subscription" 
                 style="background-color: #2196F3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
                Manage Subscription
              </a>
            </p>
          </div>
        </body>
        </html>
      `;

      return await this.sendEmail({
        to: email,
        subject: 'Subscription Cancelled - Lead Marketplace',
        html
      });
    } catch (error) {
      logger.error('Error sending cancellation email:', error);
      throw error;
    }
  }

  /**
   * Send welcome email
   * @param {string} email - Agency email
   * @param {Object} agencyData - Agency details
   */
  async sendWelcomeEmail(email, agencyData) {
    try {
      const agencyName = agencyData.business_name || agencyData.name || 'Valued Agency';

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Welcome to Lead Marketplace</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #4CAF50;">Welcome to Lead Marketplace!</h2>
            <p>Hi ${agencyName},</p>
            <p>Welcome to Lead Marketplace! Your account has been successfully created.</p>
            <p>Get started by:</p>
            <ul>
              <li>Choosing a subscription plan</li>
              <li>Setting up your territories</li>
              <li>Downloading the mobile app</li>
            </ul>
            <p style="margin-top: 30px;">
              <a href="${process.env.FRONTEND_URL || 'https://app.leadmarketplace.com'}" 
                 style="background-color: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
                Get Started
              </a>
            </p>
          </div>
        </body>
        </html>
      `;

      return await this.sendEmail({
        to: email,
        subject: 'Welcome to Lead Marketplace',
        html
      });
    } catch (error) {
      logger.error('Error sending welcome email:', error);
      throw error;
    }
  }
}

module.exports = new EmailService();

