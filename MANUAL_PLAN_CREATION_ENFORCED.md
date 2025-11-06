# Manual Plan Creation - Auto-Creation Disabled

## Changes Made

All automatic plan creation has been **DISABLED**. Plans must now be created **manually** through the admin portal.

### 1. Backend Changes

#### `routes/adminAgenciesRoutes.js`
- **Before**: `findOrCreateDefaultPlan()` - automatically created "Admin Default" plan if none existed
- **After**: `findDefaultPlan()` - only finds existing plans, returns `null` if none exist
- **Impact**: When creating agencies, if no plan exists, the agency is created without a subscription (admin must assign manually)

#### `scripts/seed_mobile_plan_bullets.js`
- **Before**: Automatically created 3 plans (Basic, Growth, Professional) if database was empty
- **After**: Only updates existing plans, shows warning if no plans exist
- **Impact**: Seed script will not auto-create plans anymore

### 2. Deletion Behavior

Plans are **permanently deleted** (hard delete) from the database:
- Uses `DELETE FROM subscription_plans` (not soft delete)
- Removes all related subscriptions if `?force=true` is used
- Plans will NOT be recreated automatically after deletion

### 3. Manual Plan Creation Process

**To create a plan:**
1. Open admin portal: `http://localhost:3002`
2. Navigate to: **Subscriptions & Territory** → **Subscription Plans**
3. Click: **"+Create New Plan"** button
4. Fill in the form manually:
   - Plan Name (required)
   - Base Price ($/month) (required)
   - Base Zipcodes Included (required)
   - Maximum Zipcodes Allowed (optional)
   - Plan Description (optional)
   - Plan Features (one per line, required)
   - Plan Active (checkbox)
5. Click: **"Save Plan"** button

**Plans are ONLY created when you explicitly click "Save Plan"**

### 4. What Was Removed

✅ Removed automatic plan creation in `findOrCreateDefaultPlan()`
✅ Removed auto-creation in seed script when database is empty
✅ Removed "Additional Price per Zipcode" field (frontend + backend)
✅ Added form preventDefault to prevent auto-submit
✅ Cleared all default values - form starts empty

### 5. Verification

To verify plans are not auto-created:
1. Delete all plans using "Clear All Plans" or "Force Delete All"
2. Refresh the page
3. Plans should NOT reappear
4. Only manually created plans will exist

### 6. Troubleshooting

**If plans keep reappearing:**
1. Check if seed script is being run manually: `node scripts/seed_mobile_plan_bullets.js`
2. Check database triggers (should not exist, but verify)
3. Check if any cron jobs are running seed scripts
4. Verify deletion is working: Check database directly after deletion

**To completely remove all plans:**
```sql
-- Run this in your database
DELETE FROM subscriptions WHERE plan_id IN (SELECT id FROM subscription_plans);
DELETE FROM agency_subscriptions WHERE plan_id IN (SELECT id FROM subscription_plans);
DELETE FROM subscription_plans;
```

### 7. Database Migration

If you want to remove the `additional_unit_price` column:
```sql
ALTER TABLE subscription_plans DROP COLUMN IF EXISTS additional_unit_price;
ALTER TABLE subscription_plans DROP COLUMN IF EXISTS additional_price;
```

## Status

✅ **AUTO-CREATION DISABLED** - All automatic plan creation removed
✅ **MANUAL CREATION ONLY** - Plans must be created through admin portal
✅ **HARD DELETE** - Plans are permanently removed from database
✅ **NO AUTO-RECREATION** - Deleted plans will not reappear

