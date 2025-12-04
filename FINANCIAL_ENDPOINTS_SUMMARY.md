# Financial Operations - API Endpoints Summary

## ✅ Active Endpoints (Currently Used)

### **GET Endpoints - Read Only**

1. **GET `/api/admin/financial/invoices`**
   - **Purpose:** List all invoices with pagination
   - **Used By:** Frontend Invoices tab
   - **Database:** `invoices` table

2. **GET `/api/admin/financial/invoices/:id`**
   - **Purpose:** Get invoice details
   - **Used By:** Frontend invoice view modal
   - **Database:** `invoices` table

3. **GET `/api/admin/financial/payments`**
   - **Purpose:** List transactions OR refunds (based on `type` parameter)
   - **Used By:** 
     - Frontend Transactions tab (`type=payment` or default)
     - Frontend Refunds tab (`type=refund`)
   - **Database:** `transactions` table

4. **GET `/api/admin/financial/stats`**
   - **Purpose:** Get financial statistics for dashboard
   - **Used By:** Frontend financial dashboard
   - **Database:** Calculates from `transactions` and `invoices` tables

---

## ❌ Commented Out Endpoints (Not Used)

### **POST Endpoints - Create/Write Operations**

1. **POST `/api/admin/financial/invoices`** ❌ COMMENTED OUT
   - **Reason:** Frontend only reads data (no create functionality)
   - **Status:** Commented out, can be deleted if not needed

2. **POST `/api/admin/financial/payments`** ❌ COMMENTED OUT
   - **Reason:** All payments are handled by mobile users, not admin portal
   - **Status:** Commented out, can be deleted if not needed

3. **POST `/api/admin/financial/refunds`** ❌ COMMENTED OUT
   - **Reason:** Frontend only reads data (approveRefund/rejectRefund just show notifications)
   - **Status:** Commented out, can be deleted if not needed

### **GET Endpoints - Not Used**

4. **GET `/api/admin/financial/reports`** ❌ COMMENTED OUT
   - **Reason:** Frontend doesn't call this endpoint
   - **Status:** Commented out, can be deleted if not needed

---

## 📊 Summary

### **Active Endpoints: 4**
- ✅ GET `/api/admin/financial/invoices`
- ✅ GET `/api/admin/financial/invoices/:id`
- ✅ GET `/api/admin/financial/payments`
- ✅ GET `/api/admin/financial/stats`

### **Commented Out: 4**
- ❌ POST `/api/admin/financial/invoices` (commented)
- ❌ POST `/api/admin/financial/payments` (commented)
- ❌ POST `/api/admin/financial/refunds` (commented)
- ❌ GET `/api/admin/financial/reports` (commented)

---

## 🎯 Current Usage Pattern

**Financial Operations is READ-ONLY:**
- ✅ **Read** invoices from `invoices` table
- ✅ **Read** transactions from `transactions` table
- ✅ **Read** refunds from `transactions` table (filtered by `transaction_type = 'refund'`)
- ✅ **Calculate** statistics from both tables

**No Write Operations:**
- ❌ No creating invoices (handled by billing system)
- ❌ No creating payments (handled by mobile users)
- ❌ No creating refunds (frontend only shows notifications)

---

## 🗑️ To Permanently Delete

If you want to completely remove unused endpoints, delete these commented sections:
1. Lines 187-267: POST `/api/admin/financial/invoices`
2. Lines 470-559: POST `/api/admin/financial/payments` (already commented)
3. Lines 566-668: POST `/api/admin/financial/refunds`
4. Lines 670-783: GET `/api/admin/financial/reports`

All are wrapped in `/* ... */` comment blocks and can be safely deleted.

