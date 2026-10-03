jest.mock('../AuthService', () => ({
  authService: {isAuthenticated: false, user: null},
}));

jest.mock('../DrshubApiService', () => ({
  drshubApiService: {
    getPal: jest.fn(),
  },
}));

describe('DrshubService', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('checkPalOwnership returns owned=false when unauthenticated', async () => {
    jest.doMock('../AuthService', () => ({
      authService: {isAuthenticated: false, user: null},
    }));
    const {drshubService} = require('../DrshubService');
    await expect(drshubService.checkPalOwnership('pal-1')).resolves.toEqual({
      owned: false,
    });
  });

  it('checkPalOwnership returns owned flag based on pal.is_owned', async () => {
    jest.doMock('../AuthService', () => ({
      authService: {isAuthenticated: true, user: {id: 'u1'}},
    }));
    const {drshubApiService} = require('../DrshubApiService');
    (drshubApiService.getPal as jest.Mock).mockResolvedValue({
      id: 'pal-1',
      is_owned: true,
    });
    const {drshubService} = require('../DrshubService');

    await expect(drshubService.checkPalOwnership('pal-1')).resolves.toEqual({
      owned: true,
      purchase_date: undefined,
    });

    (drshubApiService.getPal as jest.Mock).mockResolvedValue({
      id: 'pal-1',
      is_owned: false,
    });
    await expect(drshubService.checkPalOwnership('pal-1')).resolves.toEqual({
      owned: false,
      purchase_date: undefined,
    });
  });

  it('checkPalOwnership wraps unknown errors into DrshubError', async () => {
    jest.doMock('../AuthService', () => ({
      authService: {isAuthenticated: true, user: {id: 'u1'}},
    }));
    const {drshubApiService} = require('../DrshubApiService');
    (drshubApiService.getPal as jest.Mock).mockRejectedValue(new Error('boom'));
    const {drshubService, DrshubError} = require('../DrshubService');

    await expect(drshubService.checkPalOwnership('pal-1')).rejects.toThrow(
      DrshubError,
    );
    await expect(drshubService.checkPalOwnership('pal-1')).rejects.toThrow(
      'Failed to check ownership: boom',
    );
  });
});
