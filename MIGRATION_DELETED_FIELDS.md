# Deleted Fields Summary

**Migration:** `2025-01-22_simplify-transactions-invoices.sql`  
**Date:** 2025-01-22

---

## 🗑️ TRANSACTIONS Table - Deleted Fields (8 columns)

1. `description` - Transaction notes
2. `reference_id` - Related record reference
3. `reference_type` - Reference type
4. `payment_method` - Payment method
5. `payment_reference` - Payment reference ID
6. `processed_at` - Processing timestamp
7. `failure_reason` - Failure details
8. `updated_at` - Last update timestamp

**Also Removed:**
- Transaction type: `'refund'` (now: `'credit_purchase'`, `'lead_purchase'`, `'subscription_payment'`, `'adjustment'`)
- Status: `'refunded'` (now: `'pending'`, `'completed'`, `'failed'`)
- All refund transactions deleted

---

## 🗑️ INVOICES Table - Deleted Fields (9 columns)

1. `subscription_id` - Subscription reference
2. `invoice_number` - Invoice identifier
3. `description` - Invoice notes
4. `line_items` - Line items array
5. `amount_due` - Amount due (duplicate)
6. `total_amount` - Total amount (duplicate)
7. `paid_at` - Payment timestamp
8. `updated_at` - Last update timestamp
9. `metadata` - Metadata JSON

**Also Removed:**
- Views: `invoice_summary`, `v_invoice_summary`

---

## ✅ Remaining Fields

### Transactions
- `id` → `transaction_id`
- `agency_id`
- `transaction_type` → `type`
- `amount`
- `status`
- `created_at` → `date`

### Invoices
- `id` → `invoice_id`
- `agency_id`
- `amount`
- `due_date`
- `status`
- `created_at` (not in API)

**Note:** `agency` field is populated via join from `agencies` table in API responses.

---

## 📊 Summary

- **Total columns removed:** 17
- **Views dropped:** 2
- **Refund functionality:** Completely removed
- **Backward compatible:** ❌ No

---

**Status:** ✅ Completed

