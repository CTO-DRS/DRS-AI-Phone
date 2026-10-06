import axios from 'axios';
import {
  checkConnectivity,
  isCleartextUrlAllowed,
  isLocalHost,
} from '../network';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('network utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('checkConnectivity', () => {
    it('should return true when network is available', async () => {
      mockedAxios.head.mockResolvedValueOnce({status: 200});

      const result = await checkConnectivity();

      expect(result).toBe(true);
      expect(mockedAxios.head).toHaveBeenCalledWith('https://www.google.com', {
        timeout: 5000,
      });
    });

    it('should return false when network is unavailable', async () => {
      mockedAxios.head.mockRejectedValueOnce(new Error('Network error'));

      const result = await checkConnectivity();

      expect(result).toBe(false);
    });

    it('should use custom timeout when provided', async () => {
      mockedAxios.head.mockResolvedValueOnce({status: 200});

      await checkConnectivity(3000);

      expect(mockedAxios.head).toHaveBeenCalledWith('https://www.google.com', {
        timeout: 3000,
      });
    });

    it('should return false on timeout', async () => {
      mockedAxios.head.mockRejectedValueOnce({code: 'ECONNABORTED'});

      const result = await checkConnectivity();

      expect(result).toBe(false);
    });
  });

  describe('isLocalHost', () => {
    it.each([
      ['http://localhost:1234', true],
      ['http://127.0.0.1:8080', true],
      ['http://10.1.2.3:8080', true],
      ['http://192.168.1.100:1234', true],
      ['http://172.16.0.5:8080', true],
      ['http://172.31.255.1:8080', true],
      ['http://169.254.10.10:8080', true],
      ['http://mypc.local:1234', true],
      ['http://nas.home.arpa:5000', true],
      ['http://mypc:8080', true], // single-label LAN hostname
      ['http://[::1]:8080', true],
      ['http://[fe80::1]:8080', true],
      ['http://172.32.0.1:8080', false], // just outside 172.16/12
      ['http://11.0.0.1:8080', false],
      ['http://example.com', false],
      ['https://example.com', false],
    ])('%s -> %s', (url, expected) => {
      expect(isLocalHost(url)).toBe(expected);
    });
  });

  describe('isCleartextUrlAllowed', () => {
    it('allows https everywhere', () => {
      expect(isCleartextUrlAllowed('https://api.example.com/v1')).toBe(true);
      expect(isCleartextUrlAllowed('https://192.168.1.1:1234')).toBe(true);
    });

    it('allows http for local/LAN hosts only', () => {
      expect(isCleartextUrlAllowed('http://192.168.1.100:1234')).toBe(true);
      expect(isCleartextUrlAllowed('http://localhost:1234')).toBe(true);
      expect(isCleartextUrlAllowed('http://mypc.local:1234')).toBe(true);
    });

    it('blocks http for public hosts (F-02 compensating control)', () => {
      expect(isCleartextUrlAllowed('http://api.openai.com/v1')).toBe(false);
      expect(isCleartextUrlAllowed('http://172.32.0.1:8080')).toBe(false);
      expect(isCleartextUrlAllowed('http://a.com')).toBe(false);
    });

    it('does not throw on malformed URLs (handled elsewhere)', () => {
      expect(isCleartextUrlAllowed('not a url')).toBe(true);
    });
  });
});
