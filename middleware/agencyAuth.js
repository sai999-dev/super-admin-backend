/**
 * Agency Authentication Middleware
 * Handles JWT authentication for agency users
 */

const jwt = require('jsonwebtoken');

/**
 * Authenticate agency user via JWT token
 */
const authenticateAgency = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authorization token required',
        code: 'MISSING_TOKEN'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    // For development, use a simple secret
    // In production, use environment variable
    const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
    
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      
      // Validate token structure
      if (!decoded.agencyId || !decoded.role) {
        return res.status(401).json({
          success: false,
          message: 'Invalid token structure',
          code: 'INVALID_TOKEN'
        });
      }

      // Check if token is for agency user
      if (decoded.role !== 'agency') {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Agency token required.',
          code: 'INSUFFICIENT_PERMISSIONS'
        });
      }

      // Add agency info to request
      req.agency = {
        id: decoded.agencyId,
        businessName: decoded.businessName || 'Unknown Agency',
        email: decoded.email || 'unknown@example.com',
        role: decoded.role,
        tokenExpiry: decoded.exp
      };

      next();
    } catch (jwtError) {
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Token has expired',
          code: 'TOKEN_EXPIRED'
        });
      } else if (jwtError.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          message: 'Invalid token',
          code: 'INVALID_TOKEN'
        });
      } else {
        throw jwtError;
      }
    }
  } catch (error) {
    console.error('Error in agency authentication:', error);
    res.status(500).json({
      success: false,
      message: 'Authentication error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
  }
};

/**
 * Generate JWT token for agency
 */
const generateAgencyToken = (agencyData) => {
  const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
  const JWT_EXPIRY = process.env.JWT_EXPIRY || '24h';
  
  const payload = {
    agencyId: agencyData.id,
    businessName: agencyData.businessName,
    email: agencyData.email,
    role: 'agency',
    iat: Math.floor(Date.now() / 1000)
  };

  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
};

/**
 * Verify agency token (for internal use)
 */
const verifyAgencyToken = (token) => {
  try {
    const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
};

module.exports = {
  authenticateAgency,
  generateAgencyToken,
  verifyAgencyToken
};
