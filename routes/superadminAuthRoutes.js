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
  const { email, password } = req.body;
  if (!email || !password || !validateEmail(email)) {
    return res
      .status(400)
      .json({ success: false, message: "Valid email and password required" });
  }

  try {
    const { data: admin, error } = await supabase
      .from("super_admins")
      .select("*")
      .eq("email", email)
      .single();

    if (error || !admin)
      return res
        .status(400)
        .json({ success: false, message: "Invalid credentials" });

    const validPassword = await bcrypt.compare(password, admin.password);
    if (!validPassword)
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials" });

    const token = jwt.sign(
      { id: admin.id, email: admin.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.status(200).json({
      success: true,
      token,
      user: { email: admin.email, name: admin.name },
    });
  } catch (err) {
    console.error("❌ Login error:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
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
