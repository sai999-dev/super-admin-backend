# 🔍 Registration Error Debugging Guide

**Date:** 2025-01-21  
**Issue:** Registration failing with "Exception: Failed to create agency"

---

## ✅ **What I Fixed**

1. **Added Required Fields:**
   - ✅ `business_name` (REQUIRED - was missing!)
   - ✅ `password_hash` (REQUIRED - was missing!)
   - ✅ All other optional fields

2. **Enhanced Error Logging:**
   - ✅ Detailed error messages with codes
   - ✅ Database error details (code, message, details, hint)
   - ✅ Full error stack traces
   - ✅ User-friendly error messages

3. **Improved Error Handling:**
   - ✅ Better catch blocks
   - ✅ Fallback to minimal fields if column errors
   - ✅ Validation of normalized agency data

---

## 🔍 **How to Find the Exact Error**

### **Step 1: Check Backend Terminal**

When you try to register, look at your **backend terminal** (where `node server.js` is running).

You should see logs like:

```
========================================
🔵 REGISTRATION REQUEST RECEIVED
🔵 Time: 2025-01-21T...
🔵 Request body: { ... }
========================================

🔵 Parsed request data: { ... }
✅ Validation passed
🔵 Creating agency with columns: business_name, email, password_hash, ...
```

**If there's an error, you'll see:**
```
❌ Supabase error creating agency: {
  "code": "23502",
  "message": "null value in column...",
  "details": "...",
  "hint": "..."
}
```

### **Step 2: Common Error Codes**

| Code | Meaning | Solution |
|------|---------|----------|
| **23502** | NOT NULL constraint violation | Missing required field |
| **23505** | Unique constraint violation | Email already exists |
| **23503** | Foreign key constraint | Invalid reference (e.g., plan_id doesn't exist) |
| **42703** | Column doesn't exist | Database schema mismatch |

### **Step 3: Check What Fields Are Being Sent**

Look for this log in your terminal:
```
🔵 Agency data: {
  "business_name": "...",
  "email": "...",
  "password_hash": "...",
  ...
}
```

**Verify:**
- ✅ `business_name` is present
- ✅ `email` is present and valid
- ✅ `password_hash` is present (long hash string)
- ✅ `status` is set

---

## 🧪 **Test Registration with Postman**

1. **Open Postman**
2. **Create POST request:**
   - URL: `http://localhost:3000/api/v1/agencies/register`
   - Method: POST
   - Body (raw JSON):
   ```json
   {
     "email": "test@example.com",
     "password": "Test123!@#",
     "business_name": "Test Agency",
     "phone_number": "123-456-7890"
   }
   ```
3. **Click Send**
4. **Check:**
   - Response in Postman
   - Backend terminal logs

---

## 📋 **What to Share for Help**

If registration still fails, share:

1. **Backend Terminal Output:**
   - Copy all logs from `🔵 REGISTRATION REQUEST RECEIVED` to the end
   - Look for any `❌` error messages

2. **Error Response from Postman/Flutter:**
   - The full JSON error response
   - Status code

3. **Database Schema:**
   - Run this in your Supabase SQL editor:
   ```sql
   SELECT column_name, data_type, is_nullable, column_default
   FROM information_schema.columns
   WHERE table_name = 'agencies'
   ORDER BY ordinal_position;
   ```

---

## 🔧 **Quick Fixes to Try**

### **Fix 1: Check Database Connection**

```bash
# In backend terminal, you should see:
✅ Supabase connection initialized
```

If not, check your `config.env` file has:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

### **Fix 2: Verify Required Columns Exist**

The code expects these columns in `agencies` table:
- `business_name` (REQUIRED)
- `email` (REQUIRED)
- `password_hash` (REQUIRED)
- `status`
- `created_at` or `created_date`
- `updated_at`

### **Fix 3: Check for Active Subscription Plans**

If registration requires a plan:
```sql
SELECT id, plan_name, is_active 
FROM subscription_plans 
WHERE is_active = true;
```

If no plans exist, create one through admin portal first.

---

## ✅ **Expected Success Flow**

When registration works, you'll see:

```
🔵 REGISTRATION REQUEST RECEIVED
✅ Validation passed
🔵 Creating agency with columns: ...
✅ Agency created successfully: [agency-id]
✅ Agency activated successfully
✅ Subscription created successfully (if plan provided)
✅ Token generated successfully
✅ REGISTRATION SUCCESSFUL
```

---

## 🚨 **If Still Failing**

1. **Share the exact error from backend terminal**
2. **Share the error response JSON**
3. **Check database schema matches expected columns**

The enhanced logging will show exactly where it's failing!

---

**Last Updated:** 2025-01-21

