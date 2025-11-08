# 📮 Postman Collection Setup Guide

**For:** Complete Beginners  
**Tool:** Postman

---

## 🎯 **Quick Start: Import Ready-to-Use Collection**

### **Step 1: Create Postman Collection**

1. Open Postman
2. Click **"New"** → **"Collection"**
3. Name it: **"Lead Marketplace API"**
4. Click **"Create"**

---

## 📁 **Organize Your Collection**

Create folders inside your collection:

1. **Right-click** on collection name
2. Click **"Add Folder"**
3. Create these folders:
   - 📁 **01 - Public (No Auth)**
   - 📁 **02 - Mobile Auth**
   - 📁 **03 - Mobile Leads**
   - 📁 **04 - Mobile Subscriptions**
   - 📁 **05 - Mobile Territories**
   - 📁 **06 - Admin Auth**
   - 📁 **07 - Admin Agencies**
   - 📁 **08 - Admin Leads**
   - 📁 **09 - Admin Plans**

---

## 🔧 **Setup Environment Variables**

### **Step 1: Create Environment**

1. Click **"Environments"** (left sidebar)
2. Click **"+"** to create new
3. Name: **"Local Development"**

### **Step 2: Add Variables**

Add these variables:

| Variable | Initial Value | Current Value |
|----------|---------------|---------------|
| `base_url` | `http://localhost:3000` | `http://localhost:3000` |
| `mobile_token` | (leave empty) | (will be set after login) |
| `admin_token` | (leave empty) | (will be set after login) |
| `agency_id` | (leave empty) | (will be set after login) |
| `lead_id` | (leave empty) | (will be set manually) |

### **Step 3: Use Variables**

In your requests, use:
- URL: `{{base_url}}/api/health`
- Header: `Authorization: Bearer {{mobile_token}}`

**Benefits:**
- Change base URL once, updates everywhere
- Tokens automatically used in all requests
- Easy to switch between environments

---

## 📝 **Create Your First Request**

### **Request 1: Health Check**

1. **Right-click** folder: "01 - Public (No Auth)"
2. Click **"Add Request"**
3. Name: **"Health Check"**
4. Method: **GET**
5. URL: `{{base_url}}/api/health`
6. Click **"Save"**

**Test it:**
- Click **"Send"**
- Should see: Status 200, with JSON response

---

### **Request 2: Mobile Login**

1. **Right-click** folder: "02 - Mobile Auth"
2. Click **"Add Request"**
3. Name: **"Agency Login"**
4. Method: **POST**
5. URL: `{{base_url}}/api/v1/agencies/login`
6. Go to **"Body"** tab
7. Select **"raw"** and **"JSON"**
8. Enter:
```json
{
  "email": "test@agency.com",
  "password": "your_password"
}
```

**Auto-Save Token:**
1. Go to **"Tests"** tab
2. Add this code:
```javascript
if (pm.response.code === 200) {
    var jsonData = pm.response.json();
    if (jsonData.data && jsonData.data.token) {
        pm.environment.set("mobile_token", jsonData.data.token);
        console.log("Token saved!");
    }
}
```
3. Click **"Send"**
4. Token automatically saved to environment!

---

### **Request 3: Get Leads (Uses Saved Token)**

1. **Right-click** folder: "03 - Mobile Leads"
2. Click **"Add Request"**
3. Name: **"Get My Leads"**
4. Method: **GET**
5. URL: `{{base_url}}/api/mobile/leads?page=1&limit=10`
6. Go to **"Headers"** tab
7. Add:
   - Key: `Authorization`
   - Value: `Bearer {{mobile_token}}`
8. Click **"Send"**

**✅ Token automatically used from environment!**

---

## 🎨 **Request Templates**

### **Template: GET Request with Auth**

```
Method: GET
URL: {{base_url}}/api/mobile/endpoint
Headers:
  Authorization: Bearer {{mobile_token}}
```

### **Template: POST Request with Auth**

```
Method: POST
URL: {{base_url}}/api/mobile/endpoint
Headers:
  Authorization: Bearer {{mobile_token}}
  Content-Type: application/json
Body (raw JSON):
{
  "field1": "value1",
  "field2": "value2"
}
```

### **Template: PUT Request with Auth**

```
Method: PUT
URL: {{base_url}}/api/mobile/endpoint/:id
Headers:
  Authorization: Bearer {{mobile_token}}
  Content-Type: application/json
Body (raw JSON):
{
  "field1": "updated_value"
}
```

---

## 🔄 **Pre-request Scripts (Auto-Login)**

### **Setup Auto-Login Before Each Request**

1. Click on your **Collection** (not folder)
2. Go to **"Pre-request Script"** tab
3. Add:
```javascript
// Auto-login if token is missing
if (!pm.environment.get("mobile_token")) {
    pm.sendRequest({
        url: pm.environment.get("base_url") + "/api/v1/agencies/login",
        method: 'POST',
        header: {
            'Content-Type': 'application/json'
        },
        body: {
            mode: 'raw',
            raw: JSON.stringify({
                email: "test@agency.com",
                password: "your_password"
            })
        }
    }, function (err, res) {
        if (res.json().data && res.json().data.token) {
            pm.environment.set("mobile_token", res.json().data.token);
        }
    });
}
```

**Now:** Every request auto-logs in if token is missing!

---

## ✅ **Tests Tab (Verify Responses)**

### **Add Tests to Verify Response**

1. Go to **"Tests"** tab in any request
2. Add:
```javascript
// Test 1: Status code is 200
pm.test("Status code is 200", function () {
    pm.response.to.have.status(200);
});

// Test 2: Response has success field
pm.test("Response has success field", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData).to.have.property('success');
});

// Test 3: Success is true
pm.test("Success is true", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.success).to.eql(true);
});
```

**After sending:**
- See test results in **"Test Results"** tab
- Green checkmarks = passed
- Red X = failed

---

## 📊 **Collection Runner (Test All at Once)**

### **Run All Requests in a Folder**

1. **Right-click** on a folder
2. Click **"Run folder"**
3. Click **"Run Lead Marketplace API"**
4. See all requests run automatically
5. See test results summary

**Great for:**
- Testing all endpoints quickly
- Verifying everything works
- Before deploying to production

---

## 💾 **Export/Import Collection**

### **Export (Share with Team)**

1. Click on collection
2. Click **"..."** (three dots)
3. Click **"Export"**
4. Save as JSON file
5. Share with team

### **Import (Get from Team)**

1. Click **"Import"** (top left)
2. Select JSON file
3. Click **"Import"**
4. Collection appears in sidebar

---

## 🎯 **Quick Tips**

1. **Use Variables:** Always use `{{base_url}}` instead of hardcoding
2. **Save Tokens:** Use Tests tab to auto-save tokens
3. **Organize:** Use folders to group related requests
4. **Name Clearly:** Use descriptive names like "Get All Leads" not "test1"
5. **Add Tests:** Verify responses are correct
6. **Use Collection Runner:** Test everything at once

---

## 📋 **Sample Collection Structure**

```
Lead Marketplace API
├── 01 - Public (No Auth)
│   ├── Health Check
│   ├── Get Plans
│   └── API Info
├── 02 - Mobile Auth
│   ├── Register Agency
│   ├── Login
│   └── Get Profile
├── 03 - Mobile Leads
│   ├── Get Leads
│   ├── Get Lead by ID
│   ├── Accept Lead
│   └── Reject Lead
└── 06 - Admin Auth
    ├── Admin Login
    └── Refresh Token
```

---

**Happy Testing! 🚀**

