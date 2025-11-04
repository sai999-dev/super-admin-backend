# ⚠️ JWT Authentication Temporarily Disabled

## Status
JWT authentication has been **temporarily disabled** for testing purposes.

## What Changed
- `authenticateAdmin` middleware now bypasses all JWT validation
- All routes are accessible without authentication tokens
- A demo admin user is automatically set for all requests

## Location
File: `middleware/adminAuth.js`

The `authenticateAdmin` function now:
1. Bypasses token validation
2. Sets a demo admin user automatically
3. Allows all requests to proceed

## To Re-enable JWT Authentication

1. Open `middleware/adminAuth.js`
2. Find the `authenticateAdmin` function
3. Uncomment the "ORIGINAL JWT AUTH CODE" section
4. Remove the temporary bypass code
5. Restart the backend server

## Security Warning
⚠️ **DO NOT deploy to production with JWT disabled!**
This is for **testing only**. Re-enable authentication before production deployment.

## Testing
- All API endpoints now work without tokens
- Frontend can make requests without authentication headers
- Login endpoint still works but tokens are not required

---
**Date Disabled**: $(Get-Date -Format "yyyy-MM-dd")
**Reason**: Testing application functionality without JWT complications

