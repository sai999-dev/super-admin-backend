# 🔌 Flutter App Connection Guide

## ✅ Server Status: RUNNING

Your backend server is running and accessible from the network!

## 📍 Your Server IP Address

**Current IP:** `192.168.0.169`

**Alternative IP (if on different network):** `10.210.67.68`

## 🔗 Flutter App Configuration

Update your Flutter app's API base URL to:

```
http://192.168.0.169:5000
```

Or use port 3002:
```
http://192.168.0.169:3002
```

## 📱 Login Endpoint

The login endpoint for your Flutter app is:

```
POST http://192.168.0.169:5000/api/mobile/auth/login
```

**Request Body:**
```json
{
  "email": "theajey001@gmail.com",
  "password": "your_password"
}
```

## ✅ Test Your Connection

1. **Test from browser:**
   - Open: `http://192.168.0.169:5000/api/health`
   - You should see: `{"success":true,"status":"ok",...}`

2. **Test from Flutter app:**
   - Update the base URL in your Flutter app's API client
   - Try logging in again

## 🔧 How to Find Your IP Address

If your IP changes, run this command in PowerShell:

```powershell
ipconfig | findstr "IPv4"
```

Or check the server console output when you start the server - it will display:
```
🌐 Network: http://YOUR_IP:PORT
```

## 🚨 Common Issues

### Issue: "No backend server available"
**Solution:** 
- Make sure the server is running (`node server.js`)
- Check that you're using the correct IP address (not `192.168.1.4`)
- Verify both devices are on the same network

### Issue: Connection timeout
**Solution:**
- Check Windows Firewall - allow ports 3002, 3000, 3001, and 5000
- Make sure both devices are on the same Wi-Fi network
- Try using the alternative IP: `10.210.67.68`

### Issue: CORS errors
**Solution:**
- The server already has CORS enabled for all origins
- If you still see CORS errors, check the browser console for details

## 📝 Quick Test Script

Run this to test connectivity:

```powershell
cd super-admin-backend
node test-connection.js
```

This will show you:
- Your current IP address
- Which ports are accessible
- The exact URL to use in your Flutter app

## 🎯 Next Steps

1. ✅ Update Flutter app base URL to `http://192.168.0.169:5000`
2. ✅ Test login from Flutter app
3. ✅ If IP changes, update Flutter app again

---

**Last Updated:** 2025-01-23  
**Server IP:** 192.168.0.169  
**Ports:** 3002 (primary), 5000, 3000, 3001


