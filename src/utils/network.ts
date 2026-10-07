import axios from 'axios';

/**
 * Full-match IPv4 checks for loopback and RFC1918/link-local space. Never
 * use startsWith: `10.0.0.0.evil.com` is a public domain, not a LAN host.
 */
const PRIVATE_IPV4_PATTERNS: RegExp[] = [
  /^127\.\d+\.\d+\.\d+$/, // loopback
  /^10\.\d+\.\d+\.\d+$/, // RFC1918 10/8
  /^192\.168\.\d+\.\d+$/, // RFC1918 192.168/16
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/, // RFC1918 172.16/12
  /^169\.254\.\d+\.\d+$/, // link-local
];

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
    // IPv4 private / reserved ranges. Full-match only: a prefix test like
    // startsWith('10.') would let attacker domains such as
    // `10.0.0.0.evil.com` pass as "local" and re-open the cleartext door
    // this guard exists to close.
    if (PRIVATE_IPV4_PATTERNS.some(re => re.test(host))) {
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
 * The guard fails CLOSED: a URL that cannot even be parsed has no provable
 * local host, so it must not be blessed. Legitimate callers validate the
 * URL format separately, so the only behavioral change is that malformed
 * `http...` strings can no longer slip past the cleartext gate.
 */
export function isCleartextUrlAllowed(url: string): boolean {
  try {
    if (new URL(url).protocol !== 'http:') {
      return true;
    }
    return isLocalHost(url);
  } catch {
    return false;
  }
}

/**
 * Throw a descriptive error when a request would send cleartext HTTP to a
 * non-local target. Used at the request-time choke point
 * (src/api/openai.ts::normalizeUrl) so persisted configs from older
 * versions — or any path that skips the ServerStore/UI gates — cannot
 * silently downgrade a remote server connection to public cleartext HTTP.
 */
export function assertCleartextTargetAllowed(url: string): void {
  if (!isCleartextUrlAllowed(url)) {
    let host = url;
    try {
      host = new URL(url).hostname;
    } catch {
      // keep raw string as the "host" in the message
    }
    throw new Error(
      `Refusing to send unencrypted HTTP to non-local host: ${host}. ` +
        'LAN servers (localhost, private IPv4, .local, single-label hostnames) may use HTTP; ' +
        'everything else must use HTTPS.',
    );
  }
}
