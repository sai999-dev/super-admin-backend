# 🏗️ Lead Marketplace Architecture Guide

**Chief Architect's Simple Explanation**

---

## 📋 Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Complete Lead Journey Flow](#complete-lead-journey-flow)
3. [How Each Component Works](#how-each-component-works)
4. [Debugging Guide](#debugging-guide)
5. [Common Issues & Solutions](#common-issues--solutions)

---

## 🏛️ Architecture Overview

### **The Big Picture**

```
┌─────────────────┐
│  Public Portal   │  (External website)
│  (Lead Source)   │
└────────┬─────────┘
         │
         │ Webhook POST
         │ (Lead Data)
         ▼
┌─────────────────────────────────┐
│    MIDDLEWARE LAYER (Node.js)   │  ← Only this talks to database
│                                 │
│  ┌───────────────────────────┐ │
│  │ 1. Webhook Receiver       │ │
│  │ 2. Validation Service     │ │
│  │ 3. Audit Logging          │ │
│  │ 4. Smart Mapping Engine   │ │
│  │ 5. Database (Supabase)    │ │
│  │ 6. Notification Service   │ │
│  └───────────────────────────┘ │
└─────────────────────────────────┘
         │
         │
         ├─────────────────┬─────────────────┐
         │                 │                 │
         ▼                 ▼                 ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ Mobile App   │  │ Super Admin  │  │  Database    │
│ (Agencies)   │  │   Portal     │  │  (Supabase)  │
│ (Flutter)    │  │   (React)    │  │  (PostgreSQL) │
└──────────────┘  └──────────────┘  └──────────────┘
```

### **Key Principles**

1. **Single Point of Truth**: Only the middleware layer communicates with the database
2. **Separation of Concerns**: Mobile app and Super Admin Portal never directly access the database
3. **Smart Routing**: Middleware intelligently routes leads to the right agencies
4. **Fair Distribution**: Round-robin algorithm ensures equal opportunity

---

## 🔄 Complete Lead Journey Flow

### **Step-by-Step: From Portal to Mobile App**

#### **Phase 1: Lead Submission (Public Portal → Middleware)**

```
00:00.000 - Public Portal submits lead
           POST https://your-middleware.com/api/webhooks/portal-abc-123
           Headers: { "x-api-key": "key_abc123..." }
           Body: {
             name: "John Doe",
             email: "john@example.com",
             phone: "555-1234",
             city: "New York",
             state: "NY",
             zipcode: "10001"
           }
```

#### **Step 1: Authentication (00:00.150)**
**File:** `server.js` (line 1404-1425)

**What Happens:**
- Middleware checks if API key is provided
- Verifies API key matches the portal's stored key
- Checks if portal is active

**Code Location:**
```javascript
// server.js:1404-1425
const apiKey = req.headers['x-api-key'];
const { data: portal } = await supabase
  .from('portals')
  .select('id, portal_name, industry, portal_status')
  .eq('portal_code', portal_code)
  .eq('api_key', apiKey)
  .single();
```

**Debug Checkpoint:**
- ✅ API key present in headers?
- ✅ Portal exists in database?
- ✅ Portal status is "active"?

---

#### **Step 2: Audit Logging (00:00.200)**
**File:** `services/auditService.js`

**What Happens:**
- Logs webhook reception event
- Records timestamp, portal ID, payload
- Creates audit trail for compliance

**Code Location:**
```javascript
// server.js:1428
await auditService.logWebhook(portal.id, portal_code, req.body, 'success', 'Webhook received');
```

**Debug Checkpoint:**
- ✅ Check `audit_logs` table in database
- ✅ Look for entry with action = "webhook_received"

---

#### **Step 3: Data Transformation (00:00.300)**
**File:** `services/leadIngestionService.js` (transformData method)

**What Happens:**
- Converts portal-specific format to standardized format
- Extracts common fields (name, email, phone, zipcode)
- Maps to internal schema

**Code Location:**
```javascript
// services/leadIngestionService.js:16-44
transformData(payload, portal) {
  const transformed = {
    portal_id: portal.id,
    lead_name: payload.name || payload.lead_name || payload.full_name,
    email: payload.email || payload.email_address,
    phone_number: payload.phone || payload.phone_number,
    zipcode: payload.zipcode || payload.zip_code || payload.postal_code,
    industry_type: payload.industry || portal.industry || 'non_healthcare',
    territory: payload.zipcode || `${payload.city}, ${payload.state}`,
    status: 'new',
    created_at: new Date().toISOString()
  };
  return transformed;
}
```

**Before Transformation:**
```json
{
  "name": "John Doe",
  "email_address": "john@example.com",
  "phoneNumber": "555-1234",
  "postal_code": "10001"
}
```

**After Transformation:**
```json
{
  "portal_id": "uuid-123",
  "lead_name": "John Doe",
  "email": "john@example.com",
  "phone_number": "555-1234",
  "zipcode": "10001",
  "zip_code": "10001",
  "territory": "10001",
  "industry_type": "healthcare",
  "status": "new"
}
```

**Debug Checkpoint:**
- ✅ Check console logs for transformation errors
- ✅ Verify transformed data structure

---

#### **Step 4: Validation (00:00.350)**
**File:** `services/leadIngestionService.js` (validate method)

**What Happens:**
- Validates required fields (name, email OR phone)
- Checks email format
- Validates phone format
- Ensures territory/zipcode exists

**Code Location:**
```javascript
// services/leadIngestionService.js:56-98
validate(leadData) {
  const errors = [];
  
  // Required fields
  if (!leadData.lead_name || leadData.lead_name.trim() === '') {
    errors.push('Lead name is required');
  }
  
  // Contact validation
  if (!leadData.email && !leadData.phone_number) {
    errors.push('Either email or phone number is required');
  }
  
  // Email format
  if (leadData.email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(leadData.email)) {
      errors.push('Invalid email format');
    }
  }
  
  return { valid: errors.length === 0, errors };
}
```

**Validation Rules:**
- ✅ Lead name required
- ✅ Email OR phone required
- ✅ Email must be valid format
- ✅ Phone must be valid format
- ✅ Zipcode OR city required

**Debug Checkpoint:**
- ✅ Check validation errors in response
- ✅ Test with invalid data

---

#### **Step 5: Duplicate Check (00:00.400)**
**File:** `services/leadIngestionService.js` (checkDuplicates method)

**What Happens:**
- Checks if same email exists in last 24 hours
- Checks if same phone number exists in last 24 hours
- Prevents duplicate leads

**Code Location:**
```javascript
// services/leadIngestionService.js:160-220
async checkDuplicates(leadData) {
  // Check by email
  if (leadData.email) {
    const { data: emailMatch } = await supabase
      .from('leads')
      .select('id, created_at')
      .eq('email', leadData.email.toLowerCase())
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .limit(1)
      .single();
    
    if (emailMatch) {
      return { isDuplicate: true, duplicateId: emailMatch.id };
    }
  }
  // ... phone check similar
}
```

**Debug Checkpoint:**
- ✅ Check duplicate detection logic
- ✅ Verify 24-hour window

---

#### **Step 6: Save to Database (00:00.450)**
**File:** `services/leadIngestionService.js` (createLead method)

**What Happens:**
- Inserts transformed and validated lead into `leads` table
- Returns lead ID for tracking

**Code Location:**
```javascript
// services/leadIngestionService.js:227-240
async createLead(leadData) {
  const { data: lead, error } = await supabase
    .from('leads')
    .insert([leadData])
    .select()
    .single();
  
  if (error) {
    throw new Error(`Failed to create lead: ${error.message}`);
  }
  
  return lead;
}
```

**Database Table:** `leads`
- Stores all lead information
- Links to portal via `portal_id`
- Has status field (new, assigned, accepted, rejected)

**Debug Checkpoint:**
- ✅ Check `leads` table in Supabase
- ✅ Verify lead was created with correct data
- ✅ Check for database errors

---

#### **Phase 2: Smart Mapping & Distribution (Middleware)**

#### **Step 7: Find Eligible Agencies (00:00.550)**
**File:** `services/leadDistributionService.js` (findEligibleAgencies method)

**What Happens:**
1. Gets all active agencies
2. Checks their subscriptions
3. Filters by territory (zipcode matching)
4. Filters by industry type

**Code Location:**
```javascript
// services/leadDistributionService.js:107-200
async findEligibleAgencies(territory, industry) {
  // Get all active agencies
  const { data: agencies } = await supabase
    .from('agencies')
    .select('id, business_name, industry_type, is_active')
    .eq('is_active', true);
  
  // Check each agency's subscriptions
  for (const agency of agencies) {
    const { data: subscriptions } = await supabase
      .from('agency_subscriptions')
      .select('territories, status, is_active')
      .eq('agency_id', agency.id)
      .eq('is_active', true)
      .eq('status', 'active');
    
    // Check if subscription covers this territory
    const coversTerritory = subscriptions.some(sub => {
      const territories = sub.territories || [];
      return territories.includes(territory) || territories.includes('*');
    });
    
    if (coversTerritory) {
      eligibleAgencies.push(agency);
    }
  }
  
  return eligibleAgencies;
}
```

**Matching Logic:**
- ✅ Agency must be active
- ✅ Agency must have active subscription
- ✅ Subscription must include lead's zipcode
- ✅ Industry type should match (optional)

**Debug Checkpoint:**
- ✅ Check which agencies are eligible
- ✅ Verify subscription territory matches
- ✅ Check agency subscription status

---

#### **Step 8: Filter by Subscription Limits (00:00.600)**
**File:** `services/leadDistributionService.js` (filterBySubscriptionLimits method)

**What Happens:**
- Checks each agency's current lead count
- Compares against subscription plan limits
- Removes agencies that have reached their limit

**Code Location:**
```javascript
// services/leadDistributionService.js:202-280
async filterBySubscriptionLimits(agencies) {
  const agenciesWithCapacity = [];
  
  for (const agency of agencies) {
    // Get current lead count for this month
    const { count } = await supabase
      .from('lead_assignments')
      .select('*', { count: 'exact', head: true })
      .eq('agency_id', agency.id)
      .gte('assigned_at', startOfMonth);
    
    // Get subscription plan limit
    const { data: subscription } = await supabase
      .from('agency_subscriptions')
      .select('plan_id, monthly_lead_limit')
      .eq('agency_id', agency.id)
      .eq('is_active', true)
      .single();
    
    if (count < subscription.monthly_lead_limit) {
      agenciesWithCapacity.push(agency);
    }
  }
  
  return agenciesWithCapacity;
}
```

**Limit Logic:**
- ✅ Counts leads assigned this month
- ✅ Compares to plan's `monthly_lead_limit`
- ✅ Only includes agencies under limit

**Debug Checkpoint:**
- ✅ Check agency's current lead count
- ✅ Verify subscription plan limits
- ✅ Check date range for monthly count

---

#### **Step 9: Round-Robin Selection (00:00.650)**
**File:** `services/leadDistributionService.js` (selectAgencyRoundRobin method)

**What Happens:**
- Uses round-robin algorithm for fair distribution
- Tracks last agency assigned per territory
- Selects next agency in rotation

**Code Location:**
```javascript
// services/leadDistributionService.js:282-350
async selectAgencyRoundRobin(agencies, territory, excludeAgencyIds = []) {
  // Filter out excluded agencies (for re-distribution)
  const availableAgencies = agencies.filter(agency => 
    !excludeAgencyIds.includes(agency.id)
  );
  
  // Get or create distribution sequence for this territory
  const { data: sequence } = await supabase
    .from('lead_distribution_sequence')
    .select('last_assigned_agency_index, territory')
    .eq('territory', territory)
    .single();
  
  let nextIndex = 0;
  if (sequence) {
    nextIndex = (sequence.last_assigned_agency_index + 1) % availableAgencies.length;
  }
  
  // Update sequence
  await supabase
    .from('lead_distribution_sequence')
    .upsert({
      territory,
      last_assigned_agency_index: nextIndex,
      updated_at: new Date().toISOString()
    });
  
  return availableAgencies[nextIndex];
}
```

**Round-Robin Example:**
```
Territory: 10001 (New York)
Agencies: [Agency A, Agency B, Agency C]

Lead 1 → Agency A (index 0)
Lead 2 → Agency B (index 1)
Lead 3 → Agency C (index 2)
Lead 4 → Agency A (index 0) ← Cycles back
```

**Debug Checkpoint:**
- ✅ Check `lead_distribution_sequence` table
- ✅ Verify rotation is working
- ✅ Check for excluded agencies

---

#### **Step 10: Assign Lead to Agency (00:00.700)**
**File:** `services/leadDistributionService.js` (assignLeadToAgency method)

**What Happens:**
- Creates assignment record in `lead_assignments` table
- Links lead to agency
- Sets status to "assigned"

**Code Location:**
```javascript
// services/leadDistributionService.js:352-400
async assignLeadToAgency(leadId, agencyId) {
  const assignment = {
    lead_id: leadId,
    agency_id: agencyId,
    status: 'assigned',
    assigned_at: new Date().toISOString()
  };
  
  const { data, error } = await supabase
    .from('lead_assignments')
    .insert([assignment])
    .select()
    .single();
  
  if (error) throw error;
  
  return data;
}
```

**Database Table:** `lead_assignments`
- Links `lead_id` to `agency_id`
- Tracks status: assigned, accepted, rejected
- Records timestamps: assigned_at, accepted_at, rejected_at

**Debug Checkpoint:**
- ✅ Check `lead_assignments` table
- ✅ Verify assignment was created
- ✅ Check assignment status

---

#### **Phase 3: Notification to Mobile App**

#### **Step 11: Send Push Notification (00:00.750)**
**File:** `services/notificationService.js` (notifyLeadAssigned method)

**What Happens:**
1. Gets agency's device tokens from database
2. Prepares Firebase Cloud Messaging (FCM) payload
3. Sends push notification to mobile app
4. Logs notification result

**Code Location:**
```javascript
// services/notificationService.js:20-120
async notifyLeadAssigned(agencyId, leadId, leadData) {
  // Get device tokens
  const { data: devices } = await supabase
    .from('agency_devices')
    .select('device_token, device_type, push_enabled')
    .eq('agency_id', agencyId)
    .eq('push_enabled', true)
    .eq('is_active', true);
  
  // Prepare FCM message
  const message = {
    notification: {
      title: 'New Lead Assigned',
      body: `You have a new lead: ${leadData.lead_name}`
    },
    data: {
      type: 'lead_assigned',
      lead_id: leadId,
      timestamp: new Date().toISOString()
    }
  };
  
  // Send to each device
  for (const device of devices) {
    message.token = device.device_token;
    await firebaseAdmin.messaging().send(message);
  }
}
```

**Notification Flow:**
```
Middleware → Firebase FCM → Mobile App (Flutter)
```

**Debug Checkpoint:**
- ✅ Check device tokens in `agency_devices` table
- ✅ Verify Firebase is configured
- ✅ Check FCM response
- ✅ Test notification delivery

---

#### **Phase 4: Mobile App Interaction**

#### **Step 12: Mobile App Receives Notification**
**Flutter Mobile App**

**What Happens:**
- Mobile app receives push notification
- User taps notification
- App opens and fetches lead details from middleware

**API Call:**
```
GET /api/mobile/leads/:leadId
Headers: { "Authorization": "Bearer <jwt_token>" }
```

**Code Location (Backend):**
```javascript
// controllers/mobileLeadsController.js:12-100
async function getLeads(req, res) {
  const agencyId = req.agency.id; // From JWT token
  
  const { data: assignments } = await supabase
    .from('lead_assignments')
    .select('*, leads(*)')
    .eq('agency_id', agencyId)
    .eq('status', 'assigned');
  
  res.json({ success: true, leads: assignments });
}
```

---

#### **Step 13: Agency Accepts or Rejects Lead**

**Accept Lead:**
```
PUT /api/mobile/leads/:leadId/accept
```

**Code Location:**
```javascript
// controllers/mobileLeadsController.js:acceptLead
async function acceptLead(req, res) {
  const { leadId } = req.params;
  const agencyId = req.agency.id;
  
  // Update assignment status
  await supabase
    .from('lead_assignments')
    .update({ 
      status: 'accepted',
      accepted_at: new Date().toISOString()
    })
    .eq('lead_id', leadId)
    .eq('agency_id', agencyId);
  
  // Update lead status
  await supabase
    .from('leads')
    .update({ status: 'accepted' })
    .eq('id', leadId);
  
  res.json({ success: true, message: 'Lead accepted' });
}
```

**Reject Lead:**
```
PUT /api/mobile/leads/:leadId/reject
Body: { reason: "Not interested" }
```

**Code Location:**
```javascript
// controllers/mobileLeadsController.js:rejectLead
async function rejectLead(req, res) {
  const { leadId } = req.params;
  const agencyId = req.agency.id;
  const { reason } = req.body;
  
  // Update assignment status
  await supabase
    .from('lead_assignments')
    .update({ 
      status: 'rejected',
      rejected_at: new Date().toISOString(),
      rejection_reason: reason
    })
    .eq('lead_id', leadId)
    .eq('agency_id', agencyId);
  
  // Re-distribute to next agency
  const { data: lead } = await supabase
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .single();
  
  // Exclude rejecting agency from re-distribution
  await leadDistributionService.distributeLead(lead, [agencyId]);
  
  res.json({ success: true, message: 'Lead rejected and re-distributed' });
}
```

**Re-Distribution Logic:**
- When agency rejects, lead is automatically re-distributed
- Rejecting agency is excluded from next round
- Next agency in round-robin gets the lead

---

## 🔧 How Each Component Works

### **1. Middleware Layer (Node.js/Express)**

**Purpose:** Central hub that processes all requests

**Key Files:**
- `server.js` - Main server file, handles routing
- `services/` - Business logic
- `controllers/` - HTTP request handlers
- `middleware/` - Authentication, validation, error handling

**Responsibilities:**
- ✅ Receives webhooks from public portals
- ✅ Validates and transforms data
- ✅ Saves to database
- ✅ Distributes leads to agencies
- ✅ Sends notifications
- ✅ Handles API requests from mobile app and admin portal

---

### **2. Database (Supabase/PostgreSQL)**

**Purpose:** Single source of truth for all data

**Key Tables:**
- `leads` - All lead information
- `portals` - Public portal configurations
- `agencies` - Agency information
- `agency_subscriptions` - Agency subscription plans
- `lead_assignments` - Lead-to-agency assignments
- `lead_distribution_sequence` - Round-robin tracking
- `agency_devices` - Mobile app device tokens
- `audit_logs` - Audit trail

**Connection:**
- Only middleware layer connects to database
- Uses Supabase client library
- Connection configured in `config/supabaseClient.js`

---

### **3. Mobile App (Flutter)**

**Purpose:** Agency interface for managing leads

**Communication:**
- Only communicates with middleware via REST API
- Never directly accesses database
- Uses JWT tokens for authentication

**Key Features:**
- View assigned leads
- Accept/reject leads
- View subscription plans
- Manage profile

**API Endpoints Used:**
- `POST /api/v1/agencies/login` - Login
- `GET /api/mobile/leads` - Get leads
- `PUT /api/mobile/leads/:id/accept` - Accept lead
- `PUT /api/mobile/leads/:id/reject` - Reject lead

---

### **4. Super Admin Portal (React)**

**Purpose:** Admin interface for managing system

**Communication:**
- Only communicates with middleware via REST API
- Never directly accesses database
- Uses JWT tokens for authentication

**Key Features:**
- Manage portals
- Manage agencies
- View all leads
- Manage subscriptions
- View analytics

**API Endpoints Used:**
- `GET /api/admin/*` - All admin endpoints
- Requires `authenticateAdmin` middleware

---

## 🐛 Debugging Guide

### **Node.js (Backend) Debugging**

#### **1. Enable Debug Logging**

**Add to `server.js`:**
```javascript
// Enable debug mode
if (process.env.NODE_ENV === 'development') {
  console.log('🔍 Debug mode enabled');
}
```

**Use logger:**
```javascript
const logger = require('./utils/logger');
logger.info('Processing lead', { leadId, agencyId });
logger.error('Error occurred', error);
```

---

#### **2. Check Webhook Receipt**

**Add logging to webhook handler:**
```javascript
// server.js:1393
app.post('/api/webhooks/:portal_code', async (req, res) => {
  console.log('📥 Webhook received:', {
    portal_code: req.params.portal_code,
    headers: req.headers,
    body: req.body,
    timestamp: new Date().toISOString()
  });
  
  // ... rest of code
});
```

**Test webhook:**
```bash
curl -X POST http://localhost:3000/api/webhooks/test-portal \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-key" \
  -d '{
    "name": "Test Lead",
    "email": "test@example.com",
    "phone": "555-1234",
    "zipcode": "10001"
  }'
```

---

#### **3. Check Database Queries**

**Enable Supabase logging:**
```javascript
// config/supabaseClient.js
const supabase = createClient(url, key, {
  db: {
    schema: 'public',
  },
  auth: {
    persistSession: false
  },
  global: {
    headers: { 'x-my-custom-header': 'my-app-name' },
  },
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  }
});

// Add logging
supabase.from('leads').select('*').then(({ data, error }) => {
  if (error) console.error('❌ Database error:', error);
  console.log('✅ Query result:', data);
});
```

**Check in Supabase Dashboard:**
- Go to Supabase Dashboard → SQL Editor
- Run queries to check data:
```sql
SELECT * FROM leads ORDER BY created_at DESC LIMIT 10;
SELECT * FROM lead_assignments WHERE status = 'assigned';
SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 20;
```

---

#### **4. Debug Lead Distribution**

**Add logging to distribution service:**
```javascript
// services/leadDistributionService.js
async distributeLead(lead, excludeAgencyIds = []) {
  console.log('📊 Distribution started:', {
    leadId: lead.id,
    territory: lead.territory,
    excludeAgencyIds
  });
  
  const eligibleAgencies = await this.findEligibleAgencies(...);
  console.log('✅ Eligible agencies:', eligibleAgencies.map(a => a.business_name));
  
  const agenciesWithCapacity = await this.filterBySubscriptionLimits(eligibleAgencies);
  console.log('✅ Agencies with capacity:', agenciesWithCapacity.length);
  
  const selectedAgency = await this.selectAgencyRoundRobin(...);
  console.log('✅ Selected agency:', selectedAgency.business_name);
  
  // ... rest
}
```

---

#### **5. Debug Notifications**

**Check notification service:**
```javascript
// services/notificationService.js
async notifyLeadAssigned(agencyId, leadId, leadData) {
  console.log('📱 Notification request:', { agencyId, leadId });
  
  const { data: devices } = await supabase
    .from('agency_devices')
    .select('device_token, push_enabled')
    .eq('agency_id', agencyId);
  
  console.log('📱 Devices found:', devices?.length || 0);
  
  if (!devices || devices.length === 0) {
    console.warn('⚠️ No devices found for agency:', agencyId);
  }
}
```

**Check Firebase:**
- Verify Firebase service account key is configured
- Check `FIREBASE_PROJECT_ID` in environment variables
- Test FCM in Firebase Console

---

#### **6. Use Node.js Debugger**

**Start with debugger:**
```bash
node --inspect server.js
```

**Or use VS Code:**
- Create `.vscode/launch.json`:
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Server",
      "program": "${workspaceFolder}/server.js",
      "env": {
        "NODE_ENV": "development"
      },
      "console": "integratedTerminal"
    }
  ]
}
```

**Set breakpoints:**
- Click left margin in VS Code
- Or add `debugger;` statement in code

---

### **React (Frontend) Debugging**

#### **1. Enable React DevTools**

**Install browser extension:**
- Chrome: React Developer Tools
- Firefox: React Developer Tools

**Check component props and state:**
- Open DevTools → Components tab
- Select component
- View props, state, hooks

---

#### **2. Check API Calls**

**Use browser Network tab:**
- Open DevTools → Network
- Filter by XHR/Fetch
- Check request/response

**Add logging:**
```javascript
// In your API service
const response = await fetch('/api/admin/leads', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

console.log('API Response:', response);
const data = await response.json();
console.log('API Data:', data);
```

---

#### **3. Check Authentication**

**Verify JWT token:**
```javascript
// Decode JWT (don't verify, just decode)
const token = localStorage.getItem('token');
const payload = JSON.parse(atob(token.split('.')[1]));
console.log('Token payload:', payload);
```

**Check token expiration:**
```javascript
const expiry = new Date(payload.exp * 1000);
console.log('Token expires:', expiry);
console.log('Is expired?', expiry < new Date());
```

---

#### **4. Debug State Management**

**Use Redux DevTools (if using Redux):**
- Install Redux DevTools extension
- Check actions, state changes

**Add logging:**
```javascript
// In your component
useEffect(() => {
  console.log('Component state:', state);
  console.log('Component props:', props);
}, [state, props]);
```

---

## 🚨 Common Issues & Solutions

### **Issue 1: Webhook Not Receiving Data**

**Symptoms:**
- No audit logs created
- No leads in database

**Debug Steps:**
1. ✅ Check webhook URL is correct
2. ✅ Verify API key in headers
3. ✅ Check portal status is "active"
4. ✅ Check server logs for errors
5. ✅ Test webhook with curl/Postman

**Solution:**
```javascript
// Add error handling
app.post('/api/webhooks/:portal_code', async (req, res) => {
  try {
    console.log('Webhook received:', req.body);
    // ... rest of code
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});
```

---

### **Issue 2: Lead Not Distributed**

**Symptoms:**
- Lead created but not assigned
- No assignment in `lead_assignments` table

**Debug Steps:**
1. ✅ Check eligible agencies query
2. ✅ Verify subscription territories match
3. ✅ Check subscription limits
4. ✅ Check round-robin sequence
5. ✅ Verify distribution service logs

**Solution:**
```javascript
// Add more logging
async distributeLead(lead) {
  console.log('Distribution input:', {
    leadId: lead.id,
    territory: lead.territory,
    industry: lead.industry_type
  });
  
  const eligible = await this.findEligibleAgencies(...);
  console.log('Eligible count:', eligible.length);
  
  if (eligible.length === 0) {
    console.warn('No eligible agencies found');
    return { success: false, message: 'No eligible agencies' };
  }
  
  // ... rest
}
```

---

### **Issue 3: Notification Not Sent**

**Symptoms:**
- Lead assigned but no notification
- Mobile app doesn't receive push

**Debug Steps:**
1. ✅ Check device tokens in database
2. ✅ Verify Firebase configuration
3. ✅ Check FCM response
4. ✅ Test notification manually

**Solution:**
```javascript
// Check devices
const { data: devices } = await supabase
  .from('agency_devices')
  .select('*')
  .eq('agency_id', agencyId);
  
console.log('Devices for agency:', devices);

if (!devices || devices.length === 0) {
  console.warn('No devices registered for agency');
}
```

---

### **Issue 4: Mobile App Can't Fetch Leads**

**Symptoms:**
- 401 Unauthorized errors
- Empty leads list

**Debug Steps:**
1. ✅ Check JWT token is valid
2. ✅ Verify token is in Authorization header
3. ✅ Check token hasn't expired
4. ✅ Verify agency ID in token matches

**Solution:**
```javascript
// In mobile app
const token = await getToken(); // Your token getter
console.log('Token:', token);

const response = await fetch('/api/mobile/leads', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});

console.log('Response status:', response.status);
const data = await response.json();
console.log('Response data:', data);
```

---

## 📊 Monitoring & Health Checks

### **Health Check Endpoint**

```
GET /api/health
```

**Response:**
```json
{
  "status": "healthy",
  "database": "connected",
  "timestamp": "2025-01-21T10:00:00Z",
  "uptime": 3600
}
```

### **Metrics Endpoint**

```
GET /api/metrics
```

**Response:**
```json
{
  "requests": 1000,
  "errors": 5,
  "avgResponseTime": 150,
  "leadsProcessed": 500,
  "notificationsSent": 450
}
```

---

## 🎯 Summary

### **The Flow in Simple Terms**

1. **Public Portal** sends lead data → **Middleware** receives it
2. **Middleware** validates and transforms → **Database** saves it
3. **Middleware** finds eligible agencies → **Middleware** selects agency (round-robin)
4. **Middleware** assigns lead → **Database** records assignment
5. **Middleware** sends notification → **Mobile App** receives push
6. **Agency** accepts/rejects → **Middleware** updates status
7. If rejected → **Middleware** re-distributes to next agency

### **Key Principles**

- ✅ **Single Source of Truth**: Only middleware talks to database
- ✅ **Separation**: Mobile app and admin portal never touch database directly
- ✅ **Fair Distribution**: Round-robin ensures equal opportunity
- ✅ **Audit Trail**: Every action is logged
- ✅ **Validation**: Data is validated at multiple levels
- ✅ **Error Handling**: Graceful error handling throughout

---

**This architecture ensures:**
- 🔒 Security (single point of database access)
- 📊 Scalability (can handle high volume)
- 🔄 Reliability (error handling and retries)
- 📱 Real-time updates (push notifications)
- ⚖️ Fair distribution (round-robin algorithm)

---

**Questions? Check the code files mentioned above or add more logging!**

