const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { createClient } = require("@supabase/supabase-js");
const path = require("path");
const dotenv = require("dotenv");

// Load environment variables from config.env (same location as server.js expects)
dotenv.config({ path: path.join(__dirname, "..", "config.env") });
// Also try default .env location
dotenv.config();

const router = express.Router();

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ===============================
// Utility - Validate Email
// ===============================
function validateEmail(email) {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

// ===============================
// LOGIN
// ===============================
router.post("/login", async (req, res) => {
  try {
    console.log("🔐 Superadmin login request received");
    
    // Validate environment variables
    if (!process.env.JWT_SECRET) {
      console.error("❌ JWT_SECRET is not set in environment variables");
      return res.status(500).json({
        success: false,
        message: "Server configuration error. Please contact administrator."
      });
    }

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error("❌ Supabase credentials are not set");
      return res.status(500).json({
        success: false,
        message: "Database configuration error. Please contact administrator."
      });
    }

    const { email, password } = req.body;
    
    // Validate request body
    if (!email || !password) {
      console.warn("⚠️ Login attempt with missing email or password");
      return res.status(400).json({
        success: false,
        message: "Email and password are required"
      });
    }

    if (!validateEmail(email)) {
      console.warn("⚠️ Login attempt with invalid email format:", email);
      return res.status(400).json({
        success: false,
        message: "Valid email format is required"
      });
    }

    console.log("🔍 Searching for superadmin with email:", email);

    // Find admin in database
    const { data: admin, error: queryError } = await supabase
      .from("super_admins")
      .select("*")
      .eq("email", email.toLowerCase().trim())
      .maybeSingle();

    if (queryError) {
      console.error("❌ Database error during login:", queryError);
      return res.status(500).json({
        success: false,
        message: "Database error. Please try again later.",
        error: process.env.NODE_ENV === 'development' ? queryError.message : undefined
      });
    }

    if (!admin) {
      console.warn("⚠️ Login attempt with non-existent email:", email);
      return res.status(401).json({
        success: false,
        message: "Invalid credentials"
      });
    }

    // Check password field - try both 'password' and 'password_hash'
    const passwordField = admin.password || admin.password_hash;
    if (!passwordField) {
      console.error("❌ Admin record found but no password field exists");
      return res.status(500).json({
        success: false,
        message: "Account configuration error. Please contact administrator."
      });
    }

    console.log("🔐 Verifying password...");
    const validPassword = await bcrypt.compare(password, passwordField);
    
    if (!validPassword) {
      console.warn("⚠️ Invalid password attempt for email:", email);
      return res.status(401).json({
        success: false,
        message: "Invalid credentials"
      });
    }

    // Generate JWT token
    console.log("✅ Password verified, generating token...");
    const token = jwt.sign(
      { id: admin.id, email: admin.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    console.log("✅ Login successful for:", email);
    return res.status(200).json({
      success: true,
      token,
      user: {
        id: admin.id,
        email: admin.email,
        name: admin.name || admin.email
      }
    });
  } catch (err) {
    console.error("❌ Login error:", err);
    console.error("❌ Error stack:", err.stack);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// ===============================
// VERIFY TOKEN
// ===============================
router.get("/verify-token", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ valid: false });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return res.status(200).json({ valid: true, user: decoded });
  } catch {
    return res.status(401).json({ valid: false });
  }
});

module.exports = router;
