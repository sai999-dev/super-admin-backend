/**
 * Mobile Analytics Controller
 * Handles mobile app analytics tracking and performance metrics
 */

const supabase = require('../config/supabaseClient');
const logger = require('../utils/logger');

/**
 * Track mobile app event
 */
async function trackEvent(req, res) {
  try {
    const agencyId = req.agency.id;
    const { event_type, event_name, event_data = {} } = req.body;

    if (!event_type || !event_name) {
      return res.status(400).json({
        success: false,
        message: 'event_type and event_name are required'
      });
    }

    // Store event in database (if analytics_events table exists)
    try {
      const { data, error } = await supabase
        .from('analytics_events')
        .insert([{
          agency_id: agencyId,
          event_type,
          event_name,
          event_data: typeof event_data === 'object' ? JSON.stringify(event_data) : event_data,
          device_info: req.headers['user-agent'],
          ip_address: req.ip,
          created_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (error && error.code !== '42P01') {
        // Only log if table exists but insert failed
        logger.warn('Error storing analytics event:', error.message);
      }
    } catch (tableError) {
      // Table doesn't exist - that's okay for now
      logger.debug('analytics_events table not found, event not persisted');
    }

    // Always return success - analytics failures shouldn't break the app
    return res.status(200).json({
      success: true,
      message: 'Analytics event tracked successfully',
      event: {
        type: event_type,
        name: event_name,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Error tracking analytics event:', error);
    // Return success even on error - analytics is non-critical
    return res.status(200).json({
      success: true,
      message: 'Event processing completed'
    });
  }
}

/**
 * Get mobile performance metrics
 */
async function getPerformanceMetrics(req, res) {
  try {
    const agencyId = req.agency.id;

    // Calculate metrics from lead assignments
    const { data: assignments, error: assignmentsError } = await supabase
      .from('lead_assignments')
      .select('status, accepted_at, viewed_at, created_at')
      .eq('agency_id', agencyId);

    if (assignmentsError && assignmentsError.code !== '42P01') {
      throw assignmentsError;
    }

    const leads = assignments || [];
    
    // Calculate metrics
    const leadsViewed = leads.filter(l => l.viewed_at).length;
    const leadsAccepted = leads.filter(l => l.accepted_at).length;
    const leadsPurchased = leads.filter(l => l.status === 'converted' || l.status === 'completed').length;
    
    // Calculate average response time (time from assignment to acceptance)
    const responseTimes = leads
      .filter(l => l.accepted_at && l.created_at)
      .map(l => {
        const created = new Date(l.created_at);
        const accepted = new Date(l.accepted_at);
        return (accepted - created) / (1000 * 60 * 60); // hours
      });

    const avgResponseTime = responseTimes.length > 0
      ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length
      : 0;

    // Calculate conversion rate
    const conversionRate = leads.length > 0
      ? ((leadsPurchased / leads.length) * 100).toFixed(2)
      : 0;

    // Get message count if messaging is enabled
    let messagesSent = 0;
    try {
      const { count } = await supabase
        .from('mobile_messages')
        .select('*', { count: 'exact', head: true })
        .eq('agency_id', agencyId);
      messagesSent = count || 0;
    } catch (e) {
      // Table might not exist
    }

    return res.status(200).json({
      success: true,
      data: {
        performance: {
          leadsViewed,
          leadsAccepted,
          leadsPurchased,
          totalLeads: leads.length,
          messagesSent,
          conversionRate: parseFloat(conversionRate),
          avgResponseTimeHours: parseFloat(avgResponseTime.toFixed(2)),
          responseTimes: responseTimes.length
        },
        summary: {
          viewRate: leads.length > 0 ? ((leadsViewed / leads.length) * 100).toFixed(2) : 0,
          acceptRate: leads.length > 0 ? ((leadsAccepted / leads.length) * 100).toFixed(2) : 0,
          purchaseRate: parseFloat(conversionRate)
        }
      }
    });

  } catch (error) {
    logger.error('Error fetching performance metrics:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch performance metrics',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

module.exports = {
  trackEvent,
  getPerformanceMetrics
};

