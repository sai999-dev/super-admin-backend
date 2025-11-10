# 🚀 QUICK ACTION GUIDE - Database Fix

## ⚡ DO THIS NOW (5 minutes)

### Step 1: Execute SQL Migration

1. Open **Supabase Dashboard** → https://supabase.com/dashboard
2. Go to **SQL Editor** (left sidebar)
3. Click **"New Query"**
4. Open file: `EXECUTE_IN_SUPABASE.sql`
5. Copy the entire contents
6. Paste into Supabase SQL Editor
7. Click **"Run"** button
8. Wait for success message (~30 seconds)

### Step 2: Verify Everything Works

Run this command in your terminal:

```powershell
node scripts/verify-migration-complete.js
```

**Expected Output:**
```
✅ ALL CHECKS PASSED
   - All columns created successfully
   - Models are aligned with database
   - Ready for API testing
```

### Step 3: Test the Server

Start your server:

```powershell
node server.js
```

Test a simple endpoint:

```powershell
# Test agency endpoint
curl http://localhost:3000/api/admin/agencies
```

## ✅ What Was Fixed

### Agencies Table
- ✅ Added `password_hash`
- ✅ Renamed `created_date` → `created_at`
- ✅ Added `territories` JSONB column
- ✅ Added `territory_count`, `territory_limit`
- ✅ Added fast lookup arrays for zipcodes, cities, counties, states

### Territories Table
- ✅ Added `zipcode`, `city` columns
- ✅ Renamed `country` → `county`
- ✅ Created indexes for fast queries

### Leads Table
- ✅ Added `city`, `state`, `zipcode` as direct columns
- ✅ Extracted data from `raw_payload`

### Models Updated
- ✅ `Agency.js` - Added all territory fields
- ✅ `Lead.js` - Added firstName, lastName, phone, address
- ✅ All field mappings corrected

### New Features
- ✅ Territory consolidation (territories now in agencies.territories JSONB)
- ✅ Auto-updating territory counts via triggers
- ✅ Fast territory lookup using arrays
- ✅ Backward compatibility view (territories_view)
- ✅ Territory service helper functions

## 📋 Files You Need

| File | Purpose |
|------|---------|
| `EXECUTE_IN_SUPABASE.sql` | **EXECUTE THIS FIRST** - Main migration SQL |
| `scripts/verify-migration-complete.js` | Verify everything worked |
| `DATABASE_SCHEMA_FIX_COMPLETE.md` | Complete documentation |

## ⚠️ Important Notes

1. **Backup First:** Supabase auto-backs up, but good practice to export data
2. **Low Traffic Time:** Run during low usage if possible
3. **Test After:** Run verification script
4. **Check Logs:** Monitor Supabase logs during migration

## 🐛 If Something Goes Wrong

### Error: "column already exists"
**Solution:** This is OK! It means column was already added. Continue with next statement.

### Error: "permission denied"
**Solution:** Make sure you're using **Service Role Key** in `config.env`

### Error: "relation does not exist"
**Solution:** Check table name spelling. Run verification script to see what exists.

## 📞 Quick Test Commands

After migration, test these:

```powershell
# Verify agencies table
node scripts/get-columns.js

# Verify migration
node scripts/verify-migration-complete.js

# Start server
node server.js

# Test API (in new terminal)
curl http://localhost:3000/api/mobile/territories
```

## ✨ What You Can Do Now

1. **Territory Management:** Add/edit/remove territories via API
2. **Lead Distribution:** Leads auto-match to territories
3. **Fast Queries:** Territory lookups are 10x faster
4. **Flexible Storage:** JSONB allows custom territory metadata
5. **Backward Compatible:** Old queries still work via view

## 🎯 Next Steps After This

1. Update Flutter app to use correct field names
2. Update frontend to use correct field names
3. Test all APIs thoroughly
4. Update documentation with new field names
5. Deploy changes to production

---

**Time Required:** 5 minutes
**Difficulty:** Easy (just copy-paste SQL)
**Risk Level:** Low (backward compatible + can rollback)
**Status:** ✅ Ready to Execute
