import axios from 'axios';

/**
 * Checks if the device has internet connectivity
 * @param timeoutMs Timeout in milliseconds (default: 5000)
 * @returns Promise resolving to boolean indicating connectivity status
 */
export const checkConnectivity = async (timeoutMs = 5000): Promise<boolean> => {
  try {
    // Try to fetch a small amount of data from a reliable endpoint
    await axios.head('https://www.google.com', {timeout: timeoutMs});
    return true;
  } catch (error) {
    console.error('Connectibity Error: ', error);
    return false;
  }
};

/**
 * Returns true if the host is a local/LAN address.
 *
 * Covers RFC1918 IPv4 ranges, loopback, link-local, mDNS names
 * (`.local` / `.home.arpa`), single-label LAN hostnames, and the IPv6
 * loopback / link-local literals.
 */
export function isLocalHost(url: string): boolean {
  try {
    let host = new URL(url).hostname.toLowerCase();
    // WHATWG URL keeps brackets on IPv6 literals: "[::1]", "[fe80::1%25en0]"
    if (host.startsWith('[') && host.endsWith(']')) {
      // Strip brackets and the percent-encoded zone identifier.
      const v6 = host
        .slice(1, -1)
        .split('%')[0]
        .replace(/^0:0:0:0:0:0:0:0$/, '::');
      return v6 === '::1' || v6.startsWith('fe80:');
    }
    if (host === 'localhost' || host.endsWith('.localhost')) {
      return true;
    }
    // mDNS / home-network name patterns
    if (host.endsWith('.local') || host.endsWith('.home.arpa')) {
      return true;
    }
    // Single-label hostname (e.g. http://mypc:8080) — a LAN machine in
    // practice; public hosts are entered as dotted domains.
    if (!host.includes('.') && !host.includes(':')) {
      return true;
    }
    // IPv4 private / reserved ranges
    if (
      host.startsWith('127.') ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      host.startsWith('169.254.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    ) {
      return true;
    }
    // IPv6 literals (URL.hostname strips the brackets)
    if (host === '::1' || host.startsWith('fe80:')) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Guard for user-entered server URLs (audit finding F-02 / R-02).
 *
 * Cleartext HTTP stays technically possible for local LLM servers because
 * Android's network-security config cannot express "any user-chosen LAN IP"
 * as a domain rule. This app-layer check is the compensating control:
 * `http://` is only accepted for local/LAN hosts, so a public host can never
 * be saved with an unencrypted connection. HTTPS is always allowed.
 */
export function isCleartextUrlAllowed(url: string): boolean {
  try {
    if (new URL(url).protocol !== 'http:') {
      return true;
    }
    return isLocalHost(url);
  } catch {
    // Malformed URLs fail their own validation paths; do not double-report.
    return true;
  }
}
