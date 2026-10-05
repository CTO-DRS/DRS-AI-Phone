import axios from 'axios';
import {urls} from '../config';
import {
  getAppCheckToken,
  checkConnectivity,
  NetworkError,
  AppCheckError,
  ServerError,
  initializeAppCheck,
} from '../utils';
import {BenchmarkResult, DeviceInfo} from '../utils/types';

type SubmissionData = {
  deviceInfo: DeviceInfo;
  benchmarkResult: BenchmarkResult;
};

/**
 * Submits benchmark data to the server with App Check verification
 */
export async function submitBenchmark(
  deviceInfo: DeviceInfo,
  benchmarkResult: BenchmarkResult,
): Promise<{message: string; id: number}> {
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

    // Prepare data and submit to server
    const data: SubmissionData = {
      deviceInfo,
      benchmarkResult,
    };

    try {
      const response = await axios.post(urls.benchmarkSubmit(), data, {
        headers: {
          ...(appCheckToken
            ? {'X-Firebase-AppCheck': appCheckToken}
            : {}),
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      });
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
    console.error('Error submitting benchmark:', error);

    if (
      error instanceof NetworkError ||
      error instanceof AppCheckError ||
      error instanceof ServerError
    ) {
      throw error;
    }

    throw new Error(
      error instanceof Error
        ? `Failed to submit benchmark: ${error.message}`
        : 'An unexpected error occurred',
    );
  }
}
