# Project Analysis - Super Admin Backend

## Overview
This is a **backend API server** built with Node.js/Express that serves as the middleware layer for a lead marketplace system. It connects mobile apps (Flutter), admin portals, and external webhooks to a PostgreSQL database (via Supabase).

---

## What This Backend Does (Simple Explanation)

Think of this backend as a **traffic controller** that:
1. **Receives requests** from mobile apps, admin dashboards, and external systems
2. **Checks permissions** (authentication/authorization)
3. **Does the work** (database queries, business logic)
4. **Sends back responses** with data or confirmation

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────┐
│   PostgreSQL Database (Supabase)       │
│   - agencies, subscriptions, leads     │
│   - territories, transactions, users   │
└──────────────────┬────────────────────┘
                    │
                    │ SQL Queries
                    │
┌───────────────────▼─────────────────────┐
│   THIS BACKEND API (Express.js)        │
│   ┌──────────────────────────────────┐  │
│   │ /api/mobile/*   → Mobile App    │  │
│   │ /api/admin/*   → Admin Portal   │  │
│   │ /api/webhook/* → External APIs │  │
│   └──────────────────────────────────┘  │
└───────────────────┬─────────────────────┘
                    │
        ┌───────────┴───────────┐
        │                         │
┌───────▼────────┐      ┌─────────▼────────┐
│  Mobile App    │      │  Admin Portal     │
│  (Flutter)     │      │  (React/Vue)      │
└───────────────┘      └───────────────────┘
```

---

## 📁 Project Structure

### 1. **Server Entry Point**
- **`server.js`** - Main application file
  - Sets up Express server
  - Configures middleware (security, CORS, rate limiting)
  - Connects to Supabase database
  - Mounts all route files
  - Handles errors globally

### 2. **Configuration** (`config/`)
- **`database.js`** - Database connection settings (PostgreSQL via Supabase)
- **`supabaseClient.js`** - Supabase client initialization
- **`featureFlags.js`** - Feature toggles (e.g., enable/disable messaging)

### 3. **Routes** (`routes/`) - API Endpoints

#### Mobile App Routes (`/api/mobile/*` and `/api/v1/agencies/*`)
- **`mobileAuthRoutes.js`** - Authentication for agencies
  - ✅ POST `/api/v1/agencies/register` - Register new agency
  - ✅ POST `/api/v1/agencies/login` - Agency login
  - ✅ POST `/api/v1/agencies/logout` - Logout
  - ✅ POST `/api/v1/agencies/forgot-password` - Password reset request
  - ✅ GET `/api/v1/agencies/profile` - Get agency profile
  - ✅ PUT `/api/v1/agencies/profile` - Update agency profile

- **`mobileRoutes.js`** - Core mobile app features
  - ✅ GET `/api/mobile/subscription/plans` - Get available plans (public)
  - ✅ GET `/api/mobile/subscription/status` - Get subscription status
  - ✅ GET `/api/mobile/billing/history` - Get billing history
  - ✅ GET `/api/mobile/billing/upcoming` - Get upcoming billing
  - ✅ GET `/api/mobile/territories` - Get agency territories
  - ✅ POST `/api/mobile/territories` - Add territory
  - ✅ DELETE `/api/mobile/territories/:zipcode` - Remove territory
  - ✅ GET `/api/mobile/territories/available` - Get available territories
  - ✅ POST `/api/mobile/territories/request` - Request territory addition
  - ✅ GET `/api/mobile/conversations` - Get conversations (if messaging enabled)
  - ✅ POST `/api/mobile/conversations` - Start conversation
  - ✅ GET `/api/mobile/conversations/:id/messages` - Get messages
  - ✅ POST `/api/mobile/conversations/:id/messages` - Send message

- **`mobileSubscriptionPurchaseRoutes.js`** - Subscription purchasing
  - Handles subscription upgrades, downgrades, cancellations

#### Admin Portal Routes (`/api/admin/*`)
- **`adminRoutes.js`** - Core admin functionality
  - ✅ POST `/api/admin/auth/login` - Admin login
  - ✅ Dashboard analytics and statistics
  - ✅ System health monitoring

- **`adminAgenciesRoutes.js`** - Agency management
  - ✅ GET `/api/admin/agencies` - List all agencies
  - ✅ GET `/api/admin/agencies/:id` - Get agency details
  - ✅ PUT `/api/admin/agencies/:id` - Update agency
  - ✅ DELETE `/api/admin/agencies/:id` - Delete agency

- **`adminUsersRoutes.js`** - Admin user management
  - ✅ GET `/api/admin/users` - List admin users
  - ✅ POST `/api/admin/users` - Create admin user
  - ✅ PUT `/api/admin/users/:id` - Update admin user

- **`adminEnhancedSubscriptionsRoutes.js`** - Subscription management
  - ✅ GET `/api/admin/subscriptions` - List subscriptions
  - ✅ PUT `/api/admin/subscriptions/:id/suspend` - Suspend subscription
  - ✅ PUT `/api/admin/subscriptions/:id/reactivate` - Reactivate subscription

- **`adminLeadsRoutes.js`** - Lead management
  - ✅ GET `/api/admin/leads` - List leads
  - ✅ GET `/api/admin/leads/stats` - Lead statistics

- **`adminFinancialRoutes.js`** - Financial management
  - ✅ Billing, payments, transactions

- **`adminSystemRoutes.js`** - System configuration
  - ✅ System settings, feature flags

#### Other Routes
- **`subscriptionRoutes.js`** - General subscription operations
- **`subscriptionManagementRoutes.js`** - Subscription CRUD
- **`supabaseSubscriptionPlansRoutes.js`** - Plan management
- **`agencyRoutes.js`** - Additional agency operations
- **`leadDistributionRoutes.js`** - Lead assignment logic
- **`metricsRoutes.js`** - Performance metrics

### 4. **Controllers** (`controllers/`) - Business Logic
Controllers handle the actual work for each route:
- **`mobileSubscriptionController.js`** - Subscription logic for mobile
- **`mobileTerritoryController.js`** - Territory management
- **`mobileMessagingController.js`** - Messaging functionality (optional)
- **`agencyController.js`** - Agency operations
- **`adminLeadsController.js`** - Lead management
- **`subscriptionsController.js`** - Subscription operations
- **`billingPaymentsController.js`** - Billing logic
- **`activeSubscriptionsController.js`** - Active subscription tracking
- **`leadDistributionController.js`** - Round-robin lead assignment

### 5. **Services** (`services/`) - Complex Business Logic
- **`agencyService.js`** - Agency-related services
- **`leadDistributionService.js`** - Lead assignment algorithms
- **`billingPaymentsService.js`** - Payment processing
- **`adminActivityService.js`** - Activity logging for admin actions

### 6. **Models** (`models/`) - Data Structure Definitions
These define the shape of data in the database:
- `Agency.js`, `User.js`, `Subscription.js`, `SubscriptionPlan.js`
- `Lead.js`, `LeadAssignment.js`, `Territory.js`
- `Transaction.js`, `BillingHistory.js`
- `Portal.js`, `WebhookAudit.js`
- And many more...

### 7. **Middleware** (`middleware/`)
- **`agencyAuth.js`** - Validates JWT tokens for agency users
- **`adminAuth.js`** - Validates JWT tokens for admin users
- **`observability.js`** - Performance monitoring and error tracking

### 8. **Database Migrations** (`migrations/`)
SQL files that create/update database tables:
- Create admin tables
- Create billing tables
- Create subscription tables
- Fix foreign keys and column mismatches
- Add new features (zipcode pricing, unit types)

---

## ✅ What's Implemented vs. What's Missing

### ✅ **FULLY IMPLEMENTED**

#### Mobile App APIs (Most Complete)
1. **Authentication** ✅
   - Registration with plan selection
   - Login with JWT tokens
   - Password reset request (basic implementation)
   - Profile management

2. **Subscription Management** ✅
   - View available plans (public)
   - Get subscription status
   - Billing history
   - Territory management

3. **Territory Management** ✅
   - View territories
   - Add/remove territories
   - Request territory additions
   - View available territories

4. **Messaging** ⚠️ (Conditional - needs ENABLE_MESSAGING flag)
   - Conversations
   - Send/receive messages
   - Message templates

#### Admin Portal APIs (Most Complete)
1. **Admin Authentication** ✅
   - Login with JWT
   - Token refresh

2. **Agency Management** ✅
   - List, view, update, delete agencies

3. **Subscription Management** ✅
   - View all subscriptions
   - Suspend/reactivate subscriptions
   - View subscription details

4. **Financial Management** ✅
   - Billing history
   - Payment tracking
   - Transactions

5. **System Management** ✅
   - System health
   - Metrics
   - Feature flags

#### Portal Registry (Basic)
- ✅ Create/read/update/delete portals
- ✅ Webhook endpoint for receiving leads

### ⚠️ **PARTIALLY IMPLEMENTED**

1. **Password Reset** ⚠️
   - Request endpoint exists
   - Email sending not implemented
   - Reset token storage not implemented

2. **Lead Management for Mobile** ⚠️
   - Basic structure exists
   - Full CRUD operations may be incomplete
   - Lead acceptance/rejection logic may be missing

3. **Push Notifications** ⚠️
   - Database tables exist
   - Sending logic may not be fully implemented

### ❌ **MISSING (From Development Guide)**

According to the `BACKEND_API_DEVELOPMENT_GUIDE.md`, these endpoints should exist but **appear to be missing**:

#### Mobile App Missing Endpoints:
1. **Email Verification**
   - ❌ POST `/api/mobile/auth/verify-email` - Verify email with code

2. **Lead Management (Extended)**
   - ❌ GET `/api/mobile/leads` - Get agency's assigned leads
   - ❌ PUT `/api/mobile/leads/:id/accept` - Accept lead
   - ❌ PUT `/api/mobile/leads/:id/reject` - Reject lead
   - ❌ GET `/api/mobile/leads/:id` - Get lead details
   - ❌ PUT `/api/mobile/leads/:id/status` - Update lead status
   - ❌ PUT `/api/mobile/leads/:id/view` - Mark lead as viewed
   - ❌ POST `/api/mobile/leads/:id/call` - Track phone call
   - ❌ POST `/api/mobile/leads/:id/notes` - Add notes to lead

3. **Device Management** (Critical for Push Notifications)
   - ❌ POST `/api/mobile/auth/register-device` - Register device token
   - ❌ PUT `/api/mobile/auth/update-device` - Update device token
   - ❌ DELETE `/api/mobile/auth/unregister-device` - Unregister device

4. **Notification Settings**
   - ❌ GET `/api/mobile/notifications/settings` - Get notification preferences
   - ❌ PUT `/api/mobile/notifications/settings` - Update preferences

5. **Subscription Management (Extended)**
   - ❌ POST `/api/mobile/subscription/subscribe` - Subscribe to plan
   - ❌ PUT `/api/mobile/subscription/upgrade` - Upgrade plan
   - ❌ PUT `/api/mobile/subscription/downgrade` - Downgrade plan
   - ❌ POST `/api/mobile/subscription/cancel` - Cancel subscription
   - ❌ GET `/api/mobile/subscription/invoices` - Get invoices
   - ❌ PUT `/api/mobile/payment-method` - Update payment method

#### Admin Portal Missing Endpoints:
1. **Lead Management**
   - Some basic endpoints exist, but full CRUD may be missing

#### Webhook APIs
1. **Lead Webhooks**
   - ✅ POST `/api/webhooks/:portal_code` exists in `server.js`
   - ❌ Round-robin lead assignment may not be fully implemented
   - ❌ Push notification triggering may be missing

---

## 🔐 Security Features Implemented

✅ **JWT Authentication** - Tokens for both agency and admin users
✅ **Password Hashing** - Using bcrypt
✅ **Rate Limiting** - Prevents abuse (1000 requests per 15 minutes)
✅ **CORS Protection** - Configurable allowed origins
✅ **Helmet Security** - HTTP headers protection
✅ **Input Validation** - Basic validation on routes
✅ **SQL Injection Prevention** - Using parameterized queries via Supabase

---

## 🗄️ Database Schema

The project uses **Supabase (PostgreSQL)** with these main tables:
- `agencies` - Agency accounts
- `users` - Admin users
- `subscriptions` - Agency subscriptions
- `subscription_plans` - Available plans
- `territories` - Zipcode territories
- `leads` - Lead records
- `lead_assignments` - Lead-to-agency assignments
- `transactions` - Payment transactions
- `portals` - External portal registry
- `webhook_audit` - Webhook tracking
- And many more...

---

## 📊 Technology Stack

- **Runtime**: Node.js
- **Framework**: Express.js 5.x
- **Database**: PostgreSQL (via Supabase)
- **Authentication**: JWT (jsonwebtoken)
- **Password Hashing**: bcryptjs
- **Security**: Helmet, CORS, express-rate-limit
- **Logging**: Morgan (HTTP request logging)
- **Observability**: Custom middleware for performance tracking

---

## 🚀 How to Use This Backend

1. **Start the server**: `npm start` or `node server.js`
2. **Port**: Runs on port 3000 (or PORT env variable)
3. **Health Check**: GET `/api/health`
4. **API Docs**: GET `/api`

### Environment Variables Needed:
```
DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
JWT_SECRET
PORT
FRONTEND_URL (optional)
```

---

## 📝 Summary

### What Works Well:
✅ **Mobile authentication and registration** - Complete
✅ **Subscription viewing** - Complete
✅ **Territory management** - Complete
✅ **Admin portal authentication** - Complete
✅ **Admin agency management** - Complete
✅ **Basic webhook receiving** - Complete

### What Needs Work:
⚠️ **Lead management endpoints** - Missing or incomplete for mobile app
⚠️ **Device registration for push notifications** - Missing
⚠️ **Email verification** - Missing
⚠️ **Full subscription management** (upgrade/downgrade/cancel) - May be incomplete
⚠️ **Round-robin lead assignment** - Logic may not be fully implemented
⚠️ **Push notification sending** - May not be implemented

---

## 🎯 Recommendation

This backend is **approximately 60-70% complete** compared to the development guide. The core authentication, basic subscription viewing, and territory management are solid. The missing pieces are primarily:
1. Extended lead management for mobile app
2. Device management for push notifications
3. Email verification workflow
4. Complete subscription self-service (upgrade/downgrade/cancel)

Focus on implementing the **critical missing endpoints** from the development guide, especially:
- Lead acceptance/rejection
- Lead detail views
- Device registration
- Notification settings

---

**Last Updated**: Based on codebase analysis
**Total Route Files**: 18 files
**Estimated Endpoints**: ~100+ endpoints (many may be stubs or incomplete)

