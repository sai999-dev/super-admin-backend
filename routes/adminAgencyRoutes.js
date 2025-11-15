const express = require('express');
const { Client } = require('pg');
const router = express.Router();
const { authenticateAdmin } = require('../middleware/adminAuth');

// ✅ Use Supabase as fallback if PostgreSQL connection fails
const supabase = require('../config/supabaseClient');
let pgClient = null;
let useSupabase = false;

// Try to connect to PostgreSQL
if (process.env.DB_HOST && process.env.DB_PASSWORD && process.env.DB_PASSWORD !== 'YOUR_SUPABASE_DB_PASSWORD_HERE') {
  pgClient = new Client({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'postgres',
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD,
    ssl: {
      rejectUnauthorized: false // Required for Supabase
    }
  });
  
  pgClient.connect()
    .then(() => {
      console.log('✅ adminAgencyRoutes connected to DB');
      useSupabase = false;
    })
    .catch(err => {
      console.error('❌ adminAgencyRoutes DB error:', err.message);
      console.log('⚠️ Falling back to Supabase for agency verification');
      useSupabase = true;
      if (pgClient) {
        pgClient.end().catch(() => {});
      }
    });
} else {
  console.log('⚠️ PostgreSQL credentials not configured, using Supabase for agency verification');
  useSupabase = true;
}

// ✅ Apply admin authentication middleware
router.use(authenticateAdmin);

/**
 * PATCH /api/admin/agencies/:agencyId/verify
 * Update agency verification status
 * status = VERIFIED | NOT VERIFIED | REJECTED
 */
router.patch('/agencies/:agencyId/verify', async (req, res) => {
  try {
    const { agencyId } = req.params;
    const { status = 'VERIFIED' } = req.body;

    console.log('🔐 Updating agency verification:', { agencyId, status });

    if (useSupabase || !pgClient) {
      // Use Supabase
      const { data, error } = await supabase
        .from('agencies')
        .update({
          verification_status: status,
          updated_at: new Date().toISOString()
        })
        .eq('id', agencyId)
        .select('id, verification_status')
        .single();

      if (error) {
        console.error('❌ Supabase update error:', error);
        throw new Error(error.message || 'Failed to update agency verification');
      }

      if (!data) {
        return res.status(404).json({ success: false, message: 'Agency not found' });
      }

      return res.json({
        success: true,
        message: 'Agency verification updated',
        agency: data,
      });
    } else {
      // Use PostgreSQL
      const query = `
        UPDATE agencies
        SET verification_status = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING id, verification_status;
      `;

      const result = await pgClient.query(query, [status, agencyId]);

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Agency not found' });
      }

      return res.json({
        success: true,
        message: 'Agency verification updated',
        agency: result.rows[0],
      });
    }
  } catch (err) {
    console.error('❌ Verify Agency Error:', err);
    console.error('❌ Error stack:', err.stack);
    return res.status(500).json({ success: false, message: err.message || 'Failed to update agency verification' });
  }
});

module.exports = router;

