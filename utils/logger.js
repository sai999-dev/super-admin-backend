/**
 * Production Logger Utility
 * Provides controlled logging based on environment
 */

const NODE_ENV = process.env.NODE_ENV || 'development';
const LOG_LEVEL = process.env.LOG_LEVEL || (NODE_ENV === 'production' ? 'error' : 'info');

/**
 * Log levels: error > warn > info > debug
 */
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

const currentLevel = levels[LOG_LEVEL] || levels.info;

/**
 * Production-safe logger
 */
const logger = {
  error: (...args) => {
    if (currentLevel >= levels.error) {
      console.error('[ERROR]', ...args);
    }
  },
  
  warn: (...args) => {
    if (currentLevel >= levels.warn) {
      console.warn('[WARN]', ...args);
    }
  },
  
  info: (...args) => {
    if (currentLevel >= levels.info && NODE_ENV !== 'production') {
      console.log('[INFO]', ...args);
    }
  },
  
  debug: (...args) => {
    if (currentLevel >= levels.debug && NODE_ENV !== 'production') {
      console.log('[DEBUG]', ...args);
    }
  }
};

module.exports = logger;

