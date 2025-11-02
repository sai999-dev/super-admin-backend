/**
 * Admin Authentication Middleware
 * Protects admin-only routes with JWT token validation and role checking
 */

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
const JWT_ADMIN_SECRET = process.env.JWT_ADMIN_SECRET || 'your-admin-secret-key-change-in-production';

/**
 * Middleware to authenticate admin users
 * Validates JWT token and checks for admin role
 */
const authenticateAdmin = (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'No token provided. Authentication required.'
      });
    }

    const token = authHeader.split(' ')[1];
    
    // Allow demo token in development mode
    if (token === 'demo-token' && process.env.NODE_ENV === 'development') {
      req.admin = {
        id: 'demo-admin-id',
        email: 'admin@demo.com',
        role: 'super_admin',
        name: 'Demo Admin'
      };
      return next();
    }

    // Verify token
    const decoded = jwt.verify(token, JWT_ADMIN_SECRET);

    // Check if user has admin role
    if (!decoded.role || decoded.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Super admin privileges required.'
      });
    }

    // Attach user info to request
    req.admin = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
      name: decoded.name
    };

    next();
  } catch (error) {
    console.error('Admin authentication error:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token.'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired. Please login again.'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Authentication failed.'
    });
  }
};

/**
 * Middleware to optionally check admin role
 * Allows requests to pass through but adds admin flag
 */
const checkAdminRole = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      req.isAdmin = false;
      return next();
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_ADMIN_SECRET);
    
    req.isAdmin = decoded.role === 'super_admin';
    req.admin = decoded.role === 'super_admin' ? {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
      name: decoded.name
    } : null;
    
    next();
  } catch (error) {
    req.isAdmin = false;
    next();
  }
};

/**
 * Generate admin JWT token
 */
const generateAdminToken = (admin) => {
  return jwt.sign(
    {
      id: admin.id,
      email: admin.email,
      role: admin.role,
      name: admin.name
    },
    JWT_ADMIN_SECRET,
    { expiresIn: '8h' } // Admin tokens expire in 8 hours
  );
};

/**
 * Generate refresh token for admin
 */
const generateAdminRefreshToken = (admin) => {
  return jwt.sign(
    {
      id: admin.id,
      email: admin.email,
      role: admin.role
    },
    JWT_ADMIN_SECRET + '_refresh',
    { expiresIn: '7d' } // Refresh tokens last 7 days
  );
};

/**
 * Verify admin refresh token
 */
const verifyAdminRefreshToken = (token) => {
  try {
    return jwt.verify(token, JWT_ADMIN_SECRET + '_refresh');
  } catch (error) {
    return null;
  }
};

module.exports = {
  authenticateAdmin,
  checkAdminRole,
  generateAdminToken,
  generateAdminRefreshToken,
  verifyAdminRefreshToken,
  JWT_SECRET,
  JWT_ADMIN_SECRET
};
