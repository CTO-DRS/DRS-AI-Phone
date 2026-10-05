import axios from 'axios';
import {Platform} from 'react-native';
import DeviceInfo from 'react-native-device-info';
import {submitFeedback, submitContentReport} from '../feedback';
import * as utils from '../../utils';
import {urls} from '../../config';

// Mock dependencies
jest.mock('axios');
jest.mock('react-native-device-info');
jest.mock('../../utils', () => {
  const originalModule = jest.requireActual('../../utils');
  return {
    ...originalModule,
    checkConnectivity: jest.fn(),
    getAppCheckToken: jest.fn(),
    initializeAppCheck: jest.fn(),
    NetworkError: class NetworkError extends Error {
      constructor(message) {
        super(message);
        this.name = 'NetworkError';
      }
    },
    AppCheckError: class AppCheckError extends Error {
      constructor(message) {
        super(message);
        this.name = 'AppCheckError';
      }
    },
    ServerError: class ServerError extends Error {
      constructor(message) {
        super(message);
        this.name = 'ServerError';
      }
    },
  };
});
jest.mock('../../store', () => ({
  feedbackStore: {
    feedbackId: 'mock-feedback-id',
  },
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedUtils = utils as jest.Mocked<typeof utils>;
const mockedDeviceInfo = DeviceInfo as jest.Mocked<typeof DeviceInfo>;

describe('submitFeedback', () => {
  const mockFeedbackData = {
    useCase: 'Test use case',
    featureRequests: 'Test feature request',
    generalFeedback: 'Test feedback',
    usageFrequency: 'daily',
  };

  const mockAppCheckToken = 'mock-app-check-token';
  const mockResponse = {
    data: {
      message: 'Feedback submitted successfully',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Default mocks for success case
    Platform.OS = 'ios';
    mockedUtils.checkConnectivity.mockResolvedValue(true);
    mockedUtils.getAppCheckToken.mockResolvedValue(mockAppCheckToken);
    mockedDeviceInfo.getVersion.mockReturnValue('1.0.0');
    mockedDeviceInfo.getBuildNumber.mockReturnValue('100');
    mockedAxios.post.mockResolvedValue(mockResponse);
    mockedAxios.isAxiosError.mockReturnValue(true);
  });

  it('should successfully submit feedback', async () => {
    const result = await submitFeedback(mockFeedbackData);

    // Verify connectivity check
    expect(mockedUtils.checkConnectivity).toHaveBeenCalled();

    // Verify AppCheck initialization and token retrieval
    expect(mockedUtils.initializeAppCheck).toHaveBeenCalled();
    expect(mockedUtils.getAppCheckToken).toHaveBeenCalled();

    // Verify API call
    expect(mockedAxios.post).toHaveBeenCalledWith(
      urls.feedbackSubmit(),
      {
        ...mockFeedbackData,
        appFeedbackId: 'mock-feedback-id',
        appVersion: '1.0.0',
        appBuild: '100',
      },
      {
        headers: {
          'X-Firebase-AppCheck': mockAppCheckToken,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      },
    );

    // Verify response
    expect(result).toEqual({
      message: 'Feedback submitted successfully',
    });
  });

  it('should throw NetworkError when there is no internet connection', async () => {
    mockedUtils.checkConnectivity.mockResolvedValue(false);

    await expect(submitFeedback(mockFeedbackData)).rejects.toThrowError(
      utils.NetworkError,
    );

    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('submits without the AppCheck header when no token is available', async () => {
    mockedUtils.getAppCheckToken.mockResolvedValue('');
    mockedAxios.post.mockResolvedValue({data: {message: 'ok'}});

    await expect(submitFeedback(mockFeedbackData)).resolves.toEqual({
      message: 'ok',
    });

    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    const headers = mockedAxios.post.mock.calls[0]?.[2]?.headers;
    expect(headers).toBeTruthy();
    expect(headers).not.toHaveProperty('X-Firebase-AppCheck');
  });

  it('should throw NetworkError on axios network error', async () => {
    const error = {
      isAxiosError: true,
      response: undefined,
    };
    mockedAxios.post.mockRejectedValue(error);

    await expect(submitFeedback(mockFeedbackData)).rejects.toThrowError(
      utils.NetworkError,
    );
  });

  it('should throw AppCheckError on 401/403 responses', async () => {
    const unauthorizedError = {
      isAxiosError: true,
      response: {
        status: 401,
        data: {},
      },
    };
    mockedAxios.post.mockRejectedValue(unauthorizedError);

    await expect(submitFeedback(mockFeedbackData)).rejects.toThrowError(
      utils.AppCheckError,
    );

    // Test 403 error
    const forbiddenError = {
      isAxiosError: true,
      response: {
        status: 403,
        data: {},
      },
    };
    mockedAxios.post.mockRejectedValue(forbiddenError);

    await expect(submitFeedback(mockFeedbackData)).rejects.toThrowError(
      utils.AppCheckError,
    );
  });

  it('should throw ServerError on 500+ responses', async () => {
    const serverError = {
      isAxiosError: true,
      response: {
        status: 500,
        data: {
          message: 'Internal Server Error',
        },
      },
    };
    mockedAxios.post.mockRejectedValue(serverError);

    await expect(submitFeedback(mockFeedbackData)).rejects.toThrowError(
      utils.ServerError,
    );
  });

  it('should throw ServerError with error message from server if available', async () => {
    const serverError = {
      isAxiosError: true,
      response: {
        status: 400,
        data: {
          message: 'Invalid feedback data',
        },
      },
    };
    mockedAxios.post.mockRejectedValue(serverError);

    await expect(submitFeedback(mockFeedbackData)).rejects.toThrowError(
      utils.ServerError,
    );
  });

  it('submits without a token when AppCheck initialization throws', async () => {
    mockedUtils.initializeAppCheck.mockImplementation(() => {
      throw new Error('AppCheck init error');
    });
    mockedAxios.post.mockResolvedValue({data: {message: 'ok'}});

    // Soft-fail policy: App Check is best-effort and never blocks the user.
    await expect(submitFeedback(mockFeedbackData)).resolves.toEqual({
      message: 'ok',
    });
  });

  it('propagates unknown errors', async () => {
    const unknownError = new Error('Unknown error');
    mockedAxios.post.mockRejectedValue(unknownError);
    mockedAxios.isAxiosError.mockReturnValue(false);

    await expect(submitFeedback(mockFeedbackData)).rejects.toThrow(
      'Unknown error',
    );
  });

  it('submits from any platform without a token', async () => {
    Platform.OS = 'android';
    mockedUtils.getAppCheckToken.mockResolvedValue('');
    mockedAxios.post.mockResolvedValue({data: {message: 'ok'}});

    await expect(submitFeedback(mockFeedbackData)).resolves.toEqual({
      message: 'ok',
    });

    const headers = mockedAxios.post.mock.calls[0]?.[2]?.headers;
    expect(headers).toBeTruthy();
    expect(headers).not.toHaveProperty('X-Firebase-AppCheck');
  });
});

describe('submitContentReport', () => {
  const mockReportData = {
    category: 'hate',
    description: 'Test report description',
    includeModelInfo: true,
    modelId: 'test-model-id',
    modelOid: 'test-model-oid',
    isContentReport: true as const,
  };

  const mockAppCheckToken = 'mock-app-check-token';
  const mockResponse = {
    data: {
      message: 'Content report submitted successfully',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Default mocks for success case
    Platform.OS = 'ios';
    mockedUtils.checkConnectivity.mockResolvedValue(true);
    mockedUtils.initializeAppCheck.mockResolvedValue();
    mockedUtils.getAppCheckToken.mockResolvedValue(mockAppCheckToken);
    mockedDeviceInfo.getVersion.mockReturnValue('1.0.0');
    mockedDeviceInfo.getBuildNumber.mockReturnValue('100');
    mockedAxios.post.mockResolvedValue(mockResponse);
    mockedAxios.isAxiosError.mockReturnValue(true);
  });

  it('should successfully submit content report', async () => {
    const result = await submitContentReport(mockReportData);

    // Verify connectivity check
    expect(mockedUtils.checkConnectivity).toHaveBeenCalled();

    // Verify AppCheck initialization and token retrieval
    expect(mockedUtils.initializeAppCheck).toHaveBeenCalled();
    expect(mockedUtils.getAppCheckToken).toHaveBeenCalled();

    // Verify API call
    expect(mockedAxios.post).toHaveBeenCalledWith(
      urls.feedbackSubmit(),
      {
        ...mockReportData,
        appFeedbackId: 'mock-feedback-id',
        appVersion: '1.0.0',
        appBuild: '100',
      },
      {
        headers: {
          'X-Firebase-AppCheck': mockAppCheckToken,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      },
    );

    // Verify response
    expect(result).toEqual({
      message: 'Content report submitted successfully',
    });
  });

  it('should throw NetworkError when there is no internet connection', async () => {
    mockedUtils.checkConnectivity.mockResolvedValue(false);

    await expect(submitContentReport(mockReportData)).rejects.toThrowError(
      utils.NetworkError,
    );

    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('submits without the AppCheck header when no token is available', async () => {
    mockedUtils.getAppCheckToken.mockResolvedValue('');
    mockedAxios.post.mockResolvedValue({data: {message: 'ok'}});

    await expect(submitContentReport(mockReportData)).resolves.toEqual({
      message: 'ok',
    });

    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    const headers = mockedAxios.post.mock.calls[0]?.[2]?.headers;
    expect(headers).toBeTruthy();
    expect(headers).not.toHaveProperty('X-Firebase-AppCheck');
  });

  it('should handle axios network error', async () => {
    const error = {
      isAxiosError: true,
      response: undefined,
    };
    mockedAxios.post.mockRejectedValue(error);

    await expect(submitContentReport(mockReportData)).rejects.toThrow();
  });

  it('should handle 401/403 responses', async () => {
    const unauthorizedError = {
      isAxiosError: true,
      response: {
        status: 401,
        data: {},
      },
    };
    mockedAxios.post.mockRejectedValue(unauthorizedError);

    await expect(submitContentReport(mockReportData)).rejects.toThrow();
  });

  it('should handle server errors', async () => {
    const serverError = {
      isAxiosError: true,
      response: {
        status: 500,
        data: {
          message: 'Internal Server Error',
        },
      },
    };
    mockedAxios.post.mockRejectedValue(serverError);

    await expect(submitContentReport(mockReportData)).rejects.toThrow();
  });

  it('submits without a token when AppCheck initialization throws', async () => {
    mockedUtils.initializeAppCheck.mockImplementation(() => {
      throw new Error('AppCheck init error');
    });
    mockedAxios.post.mockResolvedValue({data: {message: 'ok'}});

    // Soft-fail policy: App Check is best-effort and never blocks the user.
    await expect(submitContentReport(mockReportData)).resolves.toEqual({
      message: 'ok',
    });
  });

  it('submits from any platform without a token', async () => {
    Platform.OS = 'android';
    mockedUtils.getAppCheckToken.mockResolvedValue('');
    mockedAxios.post.mockResolvedValue({data: {message: 'ok'}});

    await expect(submitContentReport(mockReportData)).resolves.toEqual({
      message: 'ok',
    });

    const headers = mockedAxios.post.mock.calls[0]?.[2]?.headers;
    expect(headers).toBeTruthy();
    expect(headers).not.toHaveProperty('X-Firebase-AppCheck');
  });
});
