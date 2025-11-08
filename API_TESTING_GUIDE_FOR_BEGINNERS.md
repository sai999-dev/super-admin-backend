# 🧪 API Testing Guide for Beginners

**Date:** 2025-01-21  
**For:** Complete Beginners  
**Goal:** Learn how to test your APIs step-by-step

---

## 📚 **What is an API?**

Think of an API (Application Programming Interface) like a **waiter in a restaurant**:
- You (the client) give an **order** (request) to the waiter
- The waiter takes it to the **kitchen** (server)
- The kitchen **prepares** the food (processes the request)
- The waiter **brings back** the food (response)

**In API terms:**
- You send a **request** (like "Get me all leads")
- The server **processes** it
- The server sends back a **response** (the data you asked for)

---

## 🛠️ **Tools You Can Use**

### **Option 1: Postman (Easiest - Recommended for Beginners)** ⭐
- **What it is:** A visual tool with buttons and forms
- **Why use it:** No coding needed, very user-friendly
- **Download:** https://www.postman.com/downloads/

### **Option 2: Browser (Simplest - Only for GET requests)**
- **What it is:** Just your web browser (Chrome, Firefox, etc.)
- **Why use it:** Already installed, no setup needed
- **Limitation:** Can only test GET requests (viewing data)

### **Option 3: VS Code REST Client (Good for Developers)**
- **What it is:** Extension for VS Code
- **Why use it:** Test APIs directly from your code editor
- **Download:** Install "REST Client" extension in VS Code

### **Option 4: curl (Command Line - Advanced)**
- **What it is:** Command-line tool
- **Why use it:** Powerful, but requires typing commands
- **Best for:** Advanced users or automation

---

## 🚀 **Getting Started: Testing Your First API**

### **Step 1: Start Your Server**

Before testing, make sure your server is running:

```bash
# Open terminal/command prompt in your project folder
cd C:\Users\kvina\Downloads\super-admin-backend

# Start the server
node server.js
```

You should see:
```
🚀 Starting Lead Marketplace Unified Server...
✅ Supabase connection initialized
Server running on port 3000
```

**Keep this terminal open!** The server must be running to test APIs.

---

## 🌐 **Method 1: Testing with Browser (Easiest Start)**

### **Test 1: Health Check (No Authentication Needed)**

1. Open your browser (Chrome, Firefox, etc.)
2. Go to this URL:
   ```
   http://localhost:3000/api/health
   ```
3. You should see a response like:
   ```json
   {
     "status": "ok",
     "timestamp": "2025-01-21T..."
   }
   ```

**✅ Success!** Your API is working!

---

### **Test 2: Get Subscription Plans (Public Endpoint)**

1. Go to:
   ```
   http://localhost:3000/api/mobile/subscription/plans
   ```
2. You should see a list of subscription plans

**✅ Success!** You just tested a GET request!

---

## 📮 **Method 2: Testing with Postman (Recommended)**

### **Step 1: Install Postman**

1. Go to https://www.postman.com/downloads/
2. Download and install Postman
3. Open Postman

---

### **Step 2: Test a Simple GET Request**

#### **Test: Health Check**

1. In Postman, click **"New"** → **"HTTP Request"**
2. Set the method to **GET** (dropdown on the left)
3. Enter URL: `http://localhost:3000/api/health`
4. Click **"Send"** button
5. You should see a response below

**What you'll see:**
- **Status:** 200 OK (green)
- **Body:** JSON response with server status

---

### **Step 3: Test with Query Parameters**

#### **Test: Get Leads with Filters**

1. Method: **GET**
2. URL: `http://localhost:3000/api/admin/leads`
3. Click **"Params"** tab
4. Add parameters:
   - Key: `page`, Value: `1`
   - Key: `limit`, Value: `10`
   - Key: `status`, Value: `new`
5. Click **"Send"**

**What happens:**
- Postman automatically adds `?page=1&limit=10&status=new` to the URL
- You get filtered results

---

### **Step 4: Test POST Request (Create Something)**

#### **Test: Admin Login**

1. Method: **POST**
2. URL: `http://localhost:3000/api/admin/auth/login`
3. Click **"Body"** tab
4. Select **"raw"** and **"JSON"** from dropdown
5. Enter this JSON:
   ```json
   {
     "email": "admin@example.com",
     "password": "your_password"
   }
   ```
6. Click **"Send"**

**What you'll get:**
- If successful: Status 200, with a token
- If failed: Status 401, with error message

**Save the token!** You'll need it for authenticated requests.

---

### **Step 5: Test with Authentication (Using Token)**

#### **Test: Get All Agencies (Requires Admin Token)**

1. First, login and copy your token (from previous test)
2. Method: **GET**
3. URL: `http://localhost:3000/api/admin/agencies`
4. Click **"Headers"** tab
5. Add header:
   - Key: `Authorization`
   - Value: `Bearer YOUR_TOKEN_HERE`
   (Replace `YOUR_TOKEN_HERE` with the actual token)
6. Click **"Send"**

**✅ Success!** You're now making authenticated requests!

---

### **Step 6: Save Requests in Postman**

1. Click **"Save"** button
2. Create a new collection: "My API Tests"
3. Name your request: "Health Check"
4. Click **"Save"**

**Benefits:**
- Reuse requests later
- Organize by category
- Share with team

---

## 💻 **Method 3: Testing with VS Code REST Client**

### **Step 1: Install Extension**

1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search: "REST Client"
4. Install by Huachao Mao

---

### **Step 2: Create Test File**

1. Create file: `api-tests.http` in your project root
2. Add this content:

```http
### Health Check
GET http://localhost:3000/api/health

### Get Subscription Plans
GET http://localhost:3000/api/mobile/subscription/plans

### Admin Login
POST http://localhost:3000/api/admin/auth/login
Content-Type: application/json

{
  "email": "admin@example.com",
  "password": "your_password"
}

### Get Agencies (with token - replace YOUR_TOKEN)
GET http://localhost:3000/api/admin/agencies
Authorization: Bearer YOUR_TOKEN_HERE
```

---

### **Step 3: Run Tests**

1. Click **"Send Request"** above each request
2. See response in a new tab

**✅ Easy!** Test APIs directly from your code editor!

---

## 📋 **Complete Testing Examples**

### **Example 1: Mobile App - Agency Registration**

**Postman Setup:**
- Method: **POST**
- URL: `http://localhost:3000/api/v1/agencies/register`
- Body (raw JSON):
```json
{
  "email": "test@agency.com",
  "password": "SecurePass123!",
  "agency_name": "Test Agency",
  "business_name": "Test Business",
  "phone": "123-456-7890",
  "zipcodes": ["12345", "67890"],
  "industry": "healthcare"
}
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Agency registered successfully",
  "data": {
    "token": "...",
    "agency": { ... }
  }
}
```

---

### **Example 2: Mobile App - Get Leads**

**Postman Setup:**
- Method: **GET**
- URL: `http://localhost:3000/api/mobile/leads`
- Headers:
  - `Authorization: Bearer YOUR_MOBILE_TOKEN`
- Params:
  - `page`: `1`
  - `limit`: `10`
  - `status`: `assigned`

**Expected Response:**
```json
{
  "success": true,
  "leads": [ ... ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 50
  }
}
```

---

### **Example 3: Admin - Create Subscription Plan**

**Postman Setup:**
- Method: **POST**
- URL: `http://localhost:3000/api/admin/subscriptions/plans`
- Headers:
  - `Authorization: Bearer YOUR_ADMIN_TOKEN`
  - `Content-Type: application/json`
- Body (raw JSON):
```json
{
  "plan_name": "Basic Plan",
  "description": "Basic subscription plan",
  "base_price": 99.00,
  "base_units": 10,
  "price_per_unit": 69.00,
  "billing_cycle": "monthly",
  "trial_days": 7
}
```

---

### **Example 4: Mobile App - Accept Lead**

**Postman Setup:**
- Method: **PUT**
- URL: `http://localhost:3000/api/mobile/leads/LEAD_ID_HERE/accept`
- Headers:
  - `Authorization: Bearer YOUR_MOBILE_TOKEN`
- Body (raw JSON):
```json
{
  "notes": "Accepted this lead"
}
```

---

### **Example 5: Admin - Reassign Lead**

**Postman Setup:**
- Method: **PUT**
- URL: `http://localhost:3000/api/admin/leads/LEAD_ID_HERE/reassign`
- Headers:
  - `Authorization: Bearer YOUR_ADMIN_TOKEN`
  - `Content-Type: application/json`
- Body (raw JSON):
```json
{
  "agency_id": "AGENCY_ID_HERE",
  "reason": "Better fit for this agency",
  "notes": "Reassigned due to territory match"
}
```

---

## 🔐 **Understanding Authentication**

### **Two Types of Tokens:**

1. **Mobile App Token (Agency Token)**
   - Get it by: Logging in at `/api/v1/agencies/login`
   - Use for: All `/api/mobile/*` endpoints
   - Header: `Authorization: Bearer MOBILE_TOKEN`

2. **Admin Token**
   - Get it by: Logging in at `/api/admin/auth/login`
   - Use for: All `/api/admin/*` endpoints
   - Header: `Authorization: Bearer ADMIN_TOKEN`

### **How to Get a Token:**

1. **For Mobile App:**
   ```
   POST http://localhost:3000/api/v1/agencies/login
   Body: { "email": "...", "password": "..." }
   ```
   Copy the `token` from response

2. **For Admin:**
   ```
   POST http://localhost:3000/api/admin/auth/login
   Body: { "email": "...", "password": "..." }
   ```
   Copy the `token` from response

---

## ✅ **Testing Checklist**

### **Basic Tests (No Auth Required):**
- [ ] Health check: `GET /api/health`
- [ ] Get plans: `GET /api/mobile/subscription/plans`
- [ ] API info: `GET /api`

### **Mobile App Tests (Need Agency Token):**
- [ ] Register agency: `POST /api/v1/agencies/register`
- [ ] Login: `POST /api/v1/agencies/login`
- [ ] Get profile: `GET /api/v1/agencies/profile`
- [ ] Get leads: `GET /api/mobile/leads`
- [ ] Accept lead: `PUT /api/mobile/leads/:id/accept`
- [ ] Get territories: `GET /api/mobile/territories`

### **Admin Portal Tests (Need Admin Token):**
- [ ] Admin login: `POST /api/admin/auth/login`
- [ ] Get agencies: `GET /api/admin/agencies`
- [ ] Get leads: `GET /api/admin/leads`
- [ ] Create plan: `POST /api/admin/subscriptions/plans`
- [ ] Get analytics: `GET /api/admin/analytics`

---

## 🐛 **Common Issues & Solutions**

### **Issue 1: "Cannot connect to server"**
**Problem:** Server not running  
**Solution:** 
```bash
# Start server
node server.js
```

### **Issue 2: "401 Unauthorized"**
**Problem:** Missing or invalid token  
**Solution:**
- Make sure you're logged in
- Copy the token correctly
- Add `Bearer ` before the token
- Check token hasn't expired

### **Issue 3: "404 Not Found"**
**Problem:** Wrong URL  
**Solution:**
- Check URL spelling
- Make sure server is on port 3000
- Verify route exists in your routes folder

### **Issue 4: "400 Bad Request"**
**Problem:** Invalid request data  
**Solution:**
- Check JSON format is valid
- Verify required fields are included
- Check data types match (string, number, etc.)

### **Issue 5: "500 Internal Server Error"**
**Problem:** Server error  
**Solution:**
- Check server terminal for error messages
- Verify database connection
- Check environment variables are set

---

## 📊 **Understanding Response Codes**

| Code | Meaning | What It Means |
|------|---------|---------------|
| **200** | OK | ✅ Request successful |
| **201** | Created | ✅ New resource created |
| **400** | Bad Request | ❌ Invalid request data |
| **401** | Unauthorized | ❌ Not logged in or invalid token |
| **403** | Forbidden | ❌ Not allowed (wrong permissions) |
| **404** | Not Found | ❌ Resource doesn't exist |
| **409** | Conflict | ❌ Already exists (e.g., duplicate email) |
| **500** | Server Error | ❌ Server problem |

---

## 🎯 **Practice Exercises**

### **Exercise 1: Test Health Check**
1. Open browser
2. Go to: `http://localhost:3000/api/health`
3. See the response

### **Exercise 2: Test Login in Postman**
1. Open Postman
2. Create POST request to `/api/admin/auth/login`
3. Add email and password in body
4. Send and get token

### **Exercise 3: Use Token to Get Data**
1. Copy token from Exercise 2
2. Create GET request to `/api/admin/agencies`
3. Add token in Authorization header
4. Send and see agencies list

### **Exercise 4: Create Something**
1. Use admin token
2. Create POST request to `/api/admin/subscriptions/plans`
3. Add plan data in body
4. Send and create a new plan

---

## 📝 **Quick Reference Card**

### **Common URLs:**
```
Base URL: http://localhost:3000

Health: GET /api/health
Plans: GET /api/mobile/subscription/plans

Mobile Login: POST /api/v1/agencies/login
Admin Login: POST /api/admin/auth/login

Mobile Leads: GET /api/mobile/leads
Admin Leads: GET /api/admin/leads
```

### **Common Headers:**
```
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json
```

### **Common Methods:**
- **GET** - Get/Read data
- **POST** - Create new data
- **PUT** - Update existing data
- **DELETE** - Delete data

---

## 🎓 **Next Steps**

1. ✅ Test all basic endpoints
2. ✅ Practice with authentication
3. ✅ Try creating, updating, deleting
4. ✅ Test error cases (wrong data, missing fields)
5. ✅ Save your requests in Postman collections
6. ✅ Read API documentation for your endpoints

---

## 💡 **Tips for Beginners**

1. **Start Simple:** Test GET requests first (easiest)
2. **Use Postman:** Most beginner-friendly tool
3. **Read Errors:** Error messages tell you what's wrong
4. **Save Tokens:** Keep tokens handy for authenticated requests
5. **Test One Thing at a Time:** Don't rush
6. **Check Server Logs:** Terminal shows what's happening
7. **Practice Daily:** The more you test, the easier it gets

---

## 📚 **Additional Resources**

- **Postman Learning Center:** https://learning.postman.com/
- **REST API Tutorial:** https://restfulapi.net/
- **HTTP Status Codes:** https://httpstatuses.com/

---

**Happy Testing! 🚀**

If you get stuck, check:
1. Server is running
2. URL is correct
3. Token is valid (if needed)
4. Request body format is correct

---

**Last Updated:** 2025-01-21

