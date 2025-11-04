# Deployment Checklist

## ✅ Pre-Deployment Security & Configuration

### 1. Environment Variables (REQUIRED)
Ensure these are set in production:
- ✅ `SUPABASE_URL` - Supabase project URL
- ✅ `SUPABASE_SERVICE_KEY` or `SERVICE_KEY` - Supabase service role key
- ✅ `JWT_SECRET` - Secret for JWT token signing (MUST be strong in production)
- ✅ `JWT_ADMIN_SECRET` - Secret for admin JWT tokens (MUST be strong in production)
- ✅ `NODE_ENV=production` - Set to production
- ✅ `PORT` - Server port (default: 3000)
- ✅ `FRONTEND_URL` - Frontend URL for CORS (if applicable)

### 2. Database Migrations
All migrations should be executed in Supabase SQL Editor:
- ✅ `create-subscription-tables.sql`
- ✅ `create-billing-tables.sql`
- ✅ `create-admin-tables.sql`
- ✅ `2025-01-20_create-missing-tables.sql`
- ✅ `2025-01-21_create-remaining-tables.sql`
- ✅ `2025-01-21_enable-rls-security.sql`
- ✅ `2025-01-21_enable-rls-remaining-tables.sql`
- ✅ `2025-01-21_enable-rls-new-tables.sql`
- ✅ All other migration files in order

### 3. Row Level Security (RLS)
- ✅ RLS enabled on all tables
- ✅ Policies created for authenticated users
- ✅ Service role has full access

### 4. Authentication & Authorization
- ✅ All admin routes protected with `authenticateAdmin` middleware
- ✅ Mobile routes use `authenticateAgency` middleware
- ✅ JWT secrets must be set (application will exit if missing in production)

### 5. Error Handling
- ✅ Global error handler in place
- ✅ Error tracking middleware enabled
- ✅ Production error responses don't expose stack traces

### 6. Security Headers
- ✅ Helmet.js configured
- ✅ CORS properly configured
- ✅ Rate limiting enabled

### 7. Logging
- ✅ Logger utility available (`utils/logger.js`)
- ⚠️ Consider replacing `console.log` with logger in production
- ⚠️ Current: Some routes still use `console.error` (acceptable for errors)

## 📋 API Endpoints Status

### Admin Endpoints (All Protected)
- ✅ `/api/admin/subscriptions/*` - Protected
- ✅ `/api/admin/agencies/*` - Protected
- ✅ `/api/admin/users/*` - **NOW PROTECTED** ✅
- ✅ `/api/admin/roles/*` - **NOW PROTECTED** ✅
- ✅ `/api/admin/leads/*` - Protected
- ✅ `/api/admin/system/*` - Protected

### Mobile Endpoints
- ✅ `/api/mobile/auth/*` - Public (registration/login)
- ✅ `/api/mobile/subscription/plans` - Public (plan listing)
- ✅ `/api/mobile/*` - Protected with `authenticateAgency`

### Other Endpoints
- ⚠️ `/api/metrics` - Public (consider protecting if sensitive)
- ✅ `/api/subscriptions/*` - **NOW PROTECTED** ✅
- ✅ `/api/health` - Public (health check)

## 🔧 Code Quality

### Fixed Issues
- ✅ Added authentication to `adminRolesRoutes.js`
- ✅ Added authentication to `adminUsersRoutes.js`
- ✅ Fixed `subscriptionManagementRoutes.js` to use proper authentication
- ✅ JWT secrets now validate in production (exits if missing)
- ✅ Subscription plan deletion fixed (handles foreign keys properly)

### Remaining Items (Non-blocking)
- ⚠️ Consider replacing `console.log/error` with `utils/logger.js` throughout codebase
- ⚠️ Add API documentation (Swagger/OpenAPI)
- ⚠️ Add unit tests for critical paths
- ⚠️ Review metrics endpoint for authentication needs

## 🚀 Deployment Steps

1. **Set Environment Variables**
   ```bash
   export NODE_ENV=production
   export SUPABASE_URL=<your-url>
   export SUPABASE_SERVICE_KEY=<your-key>
   export JWT_SECRET=<strong-random-secret>
   export JWT_ADMIN_SECRET=<strong-random-secret>
   export PORT=3000
   ```

2. **Install Dependencies**
   ```bash
   npm install --production
   ```

3. **Verify Database Migrations**
   - Execute all SQL migrations in Supabase SQL Editor
   - Verify RLS is enabled on all tables

4. **Start Server**
   ```bash
   npm start
   ```

5. **Health Check**
   ```bash
   curl http://localhost:3000/api/health
   ```

## ⚠️ Important Notes

- **JWT Secrets**: Application will exit if JWT secrets are not set in production
- **Database**: Ensure all migrations are executed before deployment
- **CORS**: Configure `FRONTEND_URL` or `ALLOWED_ORIGINS` for production
- **Rate Limiting**: Configured with express-rate-limit
- **Error Tracking**: Enabled via observability middleware

## ✅ Deployment Ready

All critical security issues have been addressed. The application is ready for production deployment.

