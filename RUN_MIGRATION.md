# Database Migration: Remove additional_price Column

## Migration File
`migrations/2025-11-06_remove-additional-unit-price.sql`

## How to Run

### Option 1: Supabase Dashboard (Recommended)
1. Open your Supabase project dashboard
2. Go to **SQL Editor**
3. Copy and paste the contents of `migrations/2025-11-06_remove-additional-unit-price.sql`
4. Click **Run** to execute the migration

### Option 2: psql Command Line
```bash
psql -h <your-supabase-host> -U postgres -d postgres -f migrations/2025-11-06_remove-additional-unit-price.sql
```

## What This Migration Does
- Removes the `additional_unit_price` column from the `subscription_plans` table
- Removes the `additional_price` column (if it exists) from the `subscription_plans` table
- Refreshes the PostgREST schema cache

## Important Notes
- This migration is **safe** - it only removes columns that are no longer used
- Make sure your backend code has been updated to not reference these columns
- After running the migration, restart your backend server

## Verification
After running the migration, verify the column is removed:
```sql
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'subscription_plans' 
AND column_name IN ('additional_unit_price', 'additional_price');
```
This should return no rows.

