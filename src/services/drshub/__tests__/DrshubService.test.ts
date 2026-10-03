jest.mock('../AuthService', () => ({
  authService: {isAuthenticated: false, user: null},
}));

jest.mock('../DrshubApiService', () => ({
  drshubApiService: {
    getAssistant: jest.fn(),
  },
}));

describe('DrshubService', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('checkAssistantOwnership returns owned=false when unauthenticated', async () => {
    jest.doMock('../AuthService', () => ({
      authService: {isAuthenticated: false, user: null},
    }));
    const {drshubService} = require('../DrshubService');
    await expect(drshubService.checkAssistantOwnership('assistant-1')).resolves.toEqual({
      owned: false,
    });
  });

  it('checkAssistantOwnership returns owned flag based on assistant.is_owned', async () => {
    jest.doMock('../AuthService', () => ({
      authService: {isAuthenticated: true, user: {id: 'u1'}},
    }));
    const {drshubApiService} = require('../DrshubApiService');
    (drshubApiService.getAssistant as jest.Mock).mockResolvedValue({
      id: 'assistant-1',
      is_owned: true,
    });
    const {drshubService} = require('../DrshubService');

    await expect(drshubService.checkAssistantOwnership('assistant-1')).resolves.toEqual({
      owned: true,
      purchase_date: undefined,
    });

    (drshubApiService.getAssistant as jest.Mock).mockResolvedValue({
      id: 'assistant-1',
      is_owned: false,
    });
    await expect(drshubService.checkAssistantOwnership('assistant-1')).resolves.toEqual({
      owned: false,
      purchase_date: undefined,
    });
  });

  it('checkAssistantOwnership wraps unknown errors into DrshubError', async () => {
    jest.doMock('../AuthService', () => ({
      authService: {isAuthenticated: true, user: {id: 'u1'}},
    }));
    const {drshubApiService} = require('../DrshubApiService');
    (drshubApiService.getAssistant as jest.Mock).mockRejectedValue(
      new Error('boom'),
    );
    const {drshubService, DrshubError} = require('../DrshubService');

    await expect(drshubService.checkAssistantOwnership('assistant-1')).rejects.toThrow(
      DrshubError,
    );
    await expect(drshubService.checkAssistantOwnership('assistant-1')).rejects.toThrow(
      'Failed to check ownership: boom',
    );
  });
});
