const express = require('express');
const router = express.Router();
const transactionController = require('../controllers/TransactionController');
const transactionRoutes = require('./routes/transactionRoutes');

// Create transaction
router.post('/', transactionController.createTransaction);

// Get transaction by ID
router.get('/:transactionId', transactionController.getTransaction);

// Get agency transactions
router.get('/agency/:agencyId', transactionController.getAgencyTransactions);

// Update transaction
router.put('/:transactionId', transactionController.updateTransaction);

// Get transaction summary
router.get('/summary/:agencyId', transactionController.getTransactionSummary);

module.exports = router;

// Around line 1600
const transactionRoutes = require('./routes/transactionRoutes');
app.use('/api/transactions', transactionRoutes);