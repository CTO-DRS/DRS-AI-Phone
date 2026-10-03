// Mock for src/services/drshub/DrshubService.ts
// This mock avoids dependencies and provides a complete mock implementation

const mockDrshubService = {
  // Methods
  getAssistants: jest.fn().mockResolvedValue({assistants: [], total: 0}),
  getAssistant: jest.fn().mockResolvedValue(null),
  getMyAssistants: jest.fn().mockResolvedValue(null),
  getUserLibrary: jest.fn().mockResolvedValue([]),
  getUserCreatedAssistants: jest.fn().mockResolvedValue([]),
  addToLibrary: jest.fn().mockResolvedValue(undefined),
  removeFromLibrary: jest.fn().mockResolvedValue(undefined),
  createAssistant: jest.fn().mockResolvedValue(null),
  updateAssistant: jest.fn().mockResolvedValue(null),
  deleteAssistant: jest.fn().mockResolvedValue(undefined),
  searchAssistants: jest.fn().mockResolvedValue({assistants: [], total: 0}),
  getCategories: jest.fn().mockResolvedValue([]),
  getTags: jest.fn().mockResolvedValue([]),
  downloadAssistantImage: jest.fn().mockResolvedValue(null),
  getLibrary: jest.fn().mockResolvedValue(null),
  checkAssistantOwnership: jest.fn().mockResolvedValue(null),

  // Private methods (mocked for completeness)
  buildQuery: jest.fn().mockReturnValue({}),
  executeQuery: jest.fn().mockResolvedValue([]),
  transformAssistant: jest.fn().mockReturnValue({}),
  handleError: jest.fn(),
};

// Create a singleton instance
const drshubService = mockDrshubService;

// Export the mock service
export default drshubService;

// Named export for compatibility
export {drshubService};

// CommonJS compatibility
module.exports = drshubService;
module.exports.default = drshubService;
module.exports.drshubService = drshubService;
