// Mock for src/services/index.ts
// This mock re-exports all the drshub service mocks

// Import the individual service mocks
const {authService} = require('./drshub/AuthService');
const {syncService} = require('./drshub/SyncService');
const {drshubService} = require('./drshub/DrshubService');
const {DrshubErrorHandler, RetryHandler} = require('./drshub/ErrorHandler');
const {
  supabase,
  getAuthHeaders,
  isAuthenticated,
  getCurrentUser,
} = require('./drshub/supabase');

// Create mock implementations for other services
const cacheService = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
  delete: jest.fn().mockResolvedValue(undefined),
  clear: jest.fn().mockResolvedValue(undefined),
  has: jest.fn().mockResolvedValue(false),
  size: jest.fn().mockResolvedValue(0),
};

const purchaseService = {
  isAvailable: jest.fn().mockResolvedValue(false),
  getProducts: jest.fn().mockResolvedValue([]),
  purchaseProduct: jest.fn().mockResolvedValue(null),
  restorePurchases: jest.fn().mockResolvedValue([]),
  validateReceipt: jest.fn().mockResolvedValue(false),
};

// Export all services
module.exports = {
  authService,
  syncService,
  drshubService,
  cacheService,
  purchaseService,
  DrshubErrorHandler,
  RetryHandler,
  supabase,
  getAuthHeaders,
  isAuthenticated,
  getCurrentUser,
};

// Named exports for ES6 compatibility
module.exports.authService = authService;
module.exports.syncService = syncService;
module.exports.drshubService = drshubService;
module.exports.cacheService = cacheService;
module.exports.purchaseService = purchaseService;
module.exports.DrshubErrorHandler = DrshubErrorHandler;
module.exports.RetryHandler = RetryHandler;
module.exports.supabase = supabase;
module.exports.getAuthHeaders = getAuthHeaders;
module.exports.isAuthenticated = isAuthenticated;
module.exports.getCurrentUser = getCurrentUser;
