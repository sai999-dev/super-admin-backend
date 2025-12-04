const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Transaction Controller
 * Handles payment transaction logging and retrieval
 */

class TransactionController {
  /**
   * Create transaction record
   * POST /api/transactions
   */
  async createTransaction(req, res) {
    try {
      const {
        agencyId,
        subscriptionId,
        amount,
        currency = 'USD',
        transactionType = 'subscription',
        stripeInvoiceId,
        stripePaymentIntentId,
        stripeChargeId,
        sessionId,
        status = 'pending',
        metadata = {}
      } = req.body;

      if (!agencyId || !amount) {
        return res.status(400).json({
          success: false,
          error: 'agencyId and amount are required'
        });
      }

      const { data: transaction, error } = await supabase
        .from('transactions')
        .insert([{
          agency_id: agencyId,
          subscriptionid: subscriptionId,
          amount: parseFloat(amount),
          currency,
          transaction_type: transactionType,
          stripe_invoice_id: stripeInvoiceId,
          stripe_payment_intent_id: stripePaymentIntentId,
          stripe_charge_id: stripeChargeId,
          sessionid: sessionId,
          status,
          metadata,
          gateway: 'stripe',
          created_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (error) throw error;

      res.status(201).json({
        success: true,
        message: 'Transaction created',
        data: transaction
      });
    } catch (error) {
      console.error('Create transaction error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get transaction by ID
   * GET /api/transactions/:transactionId
   */
  async getTransaction(req, res) {
    try {
      const { transactionId } = req.params;

      const { data: transaction, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('id', transactionId)
        .single();

      if (error || !transaction) {
        return res.status(404).json({
          success: false,
          error: 'Transaction not found'
        });
      }

      res.status(200).json({
        success: true,
        data: transaction
      });
    } catch (error) {
      console.error('Get transaction error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get agency transactions
   * GET /api/transactions/agency/:agencyId
   */
  async getAgencyTransactions(req, res) {
    try {
      const { agencyId } = req.params;
      const { page = 1, limit = 25, status, type } = req.query;

      let query = supabase
        .from('transactions')
        .select('*', { count: 'exact' })
        .eq('agency_id', agencyId);

      if (status) {
        query = query.eq('status', status);
      }

      if (type) {
        query = query.eq('transaction_type', type);
      }

      const offset = (page - 1) * limit;
      query = query
        .order('created_at', { ascending: false })
        .range(offset, offset + parseInt(limit) - 1);

      const { data: transactions, error, count } = await query;

      if (error) throw error;

      res.status(200).json({
        success: true,
        data: {
          transactions,
          pagination: {
            total: count,
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: Math.ceil(count / limit)
          }
        }
      });
    } catch (error) {
      console.error('Get agency transactions error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Update transaction status
   * PUT /api/transactions/:transactionId
   */
  async updateTransaction(req, res) {
    try {
      const { transactionId } = req.params;
      const {
        status,
        stripeInvoiceId,
        stripePaymentIntentId,
        stripeChargeId,
        metadata
      } = req.body;

      const { data: transaction, error } = await supabase
        .from('transactions')
        .update({
          status: status || undefined,
          stripe_invoice_id: stripeInvoiceId || undefined,
          stripe_payment_intent_id: stripePaymentIntentId || undefined,
          stripe_charge_id: stripeChargeId || undefined,
          metadata: metadata || undefined
        })
        .eq('id', transactionId)
        .select()
        .single();

      if (error) throw error;

      res.status(200).json({
        success: true,
        message: 'Transaction updated',
        data: transaction
      });
    } catch (error) {
      console.error('Update transaction error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get transaction summary by agency
   * GET /api/transactions/summary/:agencyId
   */
  async getTransactionSummary(req, res) {
    try {
      const { agencyId } = req.params;

      const { data: transactions, error } = await supabase
        .from('transactions')
        .select('status, amount, created_at')
        .eq('agency_id', agencyId);

      if (error) throw error;

      const summary = {
        totalTransactions: transactions.length,
        completedTransactions: transactions.filter(t => t.status === 'completed').length,
        failedTransactions: transactions.filter(t => t.status === 'failed').length,
        pendingTransactions: transactions.filter(t => t.status === 'pending').length,
        totalAmount: transactions
          .filter(t => t.status === 'completed')
          .reduce((sum, t) => sum + parseFloat(t.amount), 0),
        averageTransaction: transactions.length > 0
          ? (transactions.reduce((sum, t) => sum + parseFloat(t.amount), 0) / transactions.length)
          : 0
      };

      res.status(200).json({
        success: true,
        data: summary
      });
    } catch (error) {
      console.error('Get transaction summary error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}

module.exports = new TransactionController();

const transactionController = require('./TransactionController');

// Create transaction record
await supabase
  .from('transactions')
  .insert([{
    agency_id: agencyId,
    subscriptionid: subscription.id,
    amount: amount / 100,  // Convert from cents
    currency: process.env.STRIPE_CURRENCY || 'USD',
    transaction_type: 'subscription',
    stripe_payment_intent_id: session.payment_intent,
    sessionid: session.id,
    status: 'pending',
    metadata: {
      planId,
      email,
      unitsPurchased
    },
    gateway: 'stripe'
  }])
  .select()
  .single();