
import axios from 'axios';
import DeviceInfo from 'react-native-device-info';

import {urls} from '../config';
import {feedbackStore} from '../store';
import {
  getAppCheckToken,
  checkConnectivity,
  NetworkError,
  AppCheckError,
  ServerError,
  initializeAppCheck,
} from '../utils';

type FeedbackData = {
  useCase: string;
  featureRequests: string;
  generalFeedback: string;
  usageFrequency: string;
  appFeedbackId: string;
};

export type ContentReportData = {
  category: string;
  description: string;
  includeModelInfo: boolean;
  modelId?: string;
  modelOid?: string;
  appFeedbackId: string;
  isContentReport: true;
};

export type ModelLoadErrorReportData = {
  reportType: 'model-load-error';
  version: 1; // Schema version for future compatibility
  appFeedbackId: string;
  // Error details
  errorMessage: string;
  // Model info (user can opt out)
  modelInfo?: {
    name?: string;
    id?: string;
    url?: string;
    size?: number;
  };
  // Context init parameters - passed as-is from llama.rn ContextParams
  contextParams?: Record<string, unknown>;
  // Device info (user can opt out)
  deviceInfo?: {
    model?: string;
    systemName?: string;
    systemVersion?: string;
    totalMemory?: number;
    cpuArch?: string[];
    isEmulator?: boolean;
  };
  // User feedback
  additionalInfo?: string;
};

/**
 * Submits content report data to the server with App Check verification
 */
export async function submitContentReport(
  reportData: Omit<ContentReportData, 'appFeedbackId'>,
): Promise<{message: string}> {
  try {
    // Check network connectivity first
    const isConnected = await checkConnectivity();
    if (!isConnected) {
      throw new NetworkError(
        'No internet connection. Please connect to the internet and try again.',
      );
    }


    // App Check: attempt verification when available, but never block the
    // user — self-built/FOSS installs lack Play Integrity/App Attest, so
    // the request is submitted without the token and the server applies
    // its own policy.
    let appCheckToken: string | null = null;
    try {
      await initializeAppCheck();
      appCheckToken = await getAppCheckToken();
    } catch (error) {
      console.warn(
        'App Check unavailable; submitting without a token:',
        error,
      );
    }

    try {
      const response = await axios.post(
        urls.feedbackSubmit(),
        {
          ...reportData,
          appFeedbackId: feedbackStore.feedbackId,
          appVersion: DeviceInfo.getVersion(),
          appBuild: DeviceInfo.getBuildNumber(),
        },
        {
          headers: {
            ...(appCheckToken
              ? {'X-Firebase-AppCheck': appCheckToken}
              : {}),
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        },
      );
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (!error.response) {
          throw new NetworkError(
            'Network error. Please check your internet connection and try again.',
          );
        }

        const status = error.response.status;
        if (status === 401 || status === 403) {
          throw new AppCheckError(
            'App verification failed. This could be due to an unofficial app installation.',
          );
        } else if (status >= 500) {
          throw new ServerError(
            'Our servers are experiencing issues. Please try again later.',
          );
        } else {
          throw new ServerError(
            `Server error: ${error.response.data?.message || 'Unknown error'}`,
          );
        }
      }
      throw error;
    }
  } catch (error) {
    console.error('Content report submission error:', error);
    throw error;
  }
}

/**
 * Submits feedback data to the server with App Check verification
 */
export async function submitFeedback(
  feedbackData: Omit<FeedbackData, 'appFeedbackId'>,
): Promise<{message: string}> {
  try {
    // Check network connectivity first
    const isConnected = await checkConnectivity();
    if (!isConnected) {
      throw new NetworkError(
        'No internet connection. Please connect to the internet and try again.',
      );
    }


    // App Check: attempt verification when available, but never block the
    // user — self-built/FOSS installs lack Play Integrity/App Attest, so
    // the request is submitted without the token and the server applies
    // its own policy.
    let appCheckToken: string | null = null;
    try {
      await initializeAppCheck();
      appCheckToken = await getAppCheckToken();
    } catch (error) {
      console.warn(
        'App Check unavailable; submitting without a token:',
        error,
      );
    }

    try {
      const response = await axios.post(
        urls.feedbackSubmit(),
        {
          ...feedbackData,
          appFeedbackId: feedbackStore.feedbackId,
          appVersion: DeviceInfo.getVersion(),
          appBuild: DeviceInfo.getBuildNumber(),
        },
        {
          headers: {
            ...(appCheckToken
              ? {'X-Firebase-AppCheck': appCheckToken}
              : {}),
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        },
      );
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (!error.response) {
          throw new NetworkError(
            'Network error. Please check your internet connection and try again.',
          );
        }

        const status = error.response.status;
        if (status === 401 || status === 403) {
          throw new AppCheckError(
            'App verification failed. This could be due to an unofficial app installation.',
          );
        } else if (status >= 500) {
          throw new ServerError(
            'Our servers are experiencing issues. Please try again later.',
          );
        } else {
          throw new ServerError(
            `Server error: ${error.response.data?.message || 'Unknown error'}`,
          );
        }
      }
      throw error;
    }
  } catch (error) {
    console.error('Error submitting feedback:', error);

    if (
      error instanceof NetworkError ||
      error instanceof AppCheckError ||
      error instanceof ServerError
    ) {
      throw error;
    }

    throw new Error(
      error instanceof Error
        ? `Failed to submit feedback: ${error.message}`
        : 'An unexpected error occurred',
    );
  }
}

/**
 * Submits model load error report to the server with App Check verification
 */
export async function submitModelLoadErrorReport(
  reportData: Omit<ModelLoadErrorReportData, 'appFeedbackId'>,
): Promise<{message: string}> {
  try {
    // Check network connectivity first
    const isConnected = await checkConnectivity();
    if (!isConnected) {
      throw new NetworkError(
        'No internet connection. Please connect to the internet and try again.',
      );
    }


    // App Check: attempt verification when available, but never block the
    // user — self-built/FOSS installs lack Play Integrity/App Attest, so
    // the request is submitted without the token and the server applies
    // its own policy.
    let appCheckToken: string | null = null;
    try {
      await initializeAppCheck();
      appCheckToken = await getAppCheckToken();
    } catch (error) {
      console.warn(
        'App Check unavailable; submitting without a token:',
        error,
      );
    }

    try {
      const response = await axios.post(
        urls.feedbackSubmit(),
        {
          ...reportData,
          appFeedbackId: feedbackStore.feedbackId,
          appVersion: DeviceInfo.getVersion(),
          appBuild: DeviceInfo.getBuildNumber(),
        },
        {
          headers: {
            ...(appCheckToken
              ? {'X-Firebase-AppCheck': appCheckToken}
              : {}),
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        },
      );
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (!error.response) {
          throw new NetworkError(
            'Network error. Please check your internet connection and try again.',
          );
        }

        const status = error.response.status;
        if (status === 401 || status === 403) {
          throw new AppCheckError(
            'App verification failed. This could be due to an unofficial app installation.',
          );
        } else if (status >= 500) {
          throw new ServerError(
            'Our servers are experiencing issues. Please try again later.',
          );
        } else {
          throw new ServerError(
            `Server error: ${error.response.data?.message || 'Unknown error'}`,
          );
        }
      }
      throw error;
    }
  } catch (error) {
    console.error('Model load error report submission error:', error);
    throw error;
  }
}
