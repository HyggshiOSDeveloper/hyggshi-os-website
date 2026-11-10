import { ErrorDetail } from '../types/error';

export const ERROR_DATABASE: Record<string, ErrorDetail> = {
  '404': {
    code: '404',
    numericCode: 404,
    title: 'Page Not Found',
    titleEn: 'Page Not Found',
    subtitle: 'HTTP 404 / ERR_NOT_FOUND',
    description: 'The requested URL does not exist on this Hyggshi OS server or has been relocated to another address.',
    category: 'http',
    severity: 'warning',
    causes: [
      'The requested URL path was mistyped or contains unsupported characters.',
      'The document, resource, or article was removed or permanently renamed.',
      'An external link or bookmark points to an outdated route.'
    ],
    solutions: [
      'Double-check the spelling of the URL in your browser address bar.',
      'Use the top navigation bar or search directory to find the updated page.',
      'Return to the Hyggshi OS homepage or navigate back to the previous screen.'
    ],
    tags: ['404', 'not found', 'missing', 'url', 'http', 'route'],
    suggestedAction: {
      label: 'Back to Hyggshi OS Home',
      href: 'index.html',
      primary: true
    }
  },
  '400': {
    code: '400',
    numericCode: 400,
    title: 'Bad Request',
    titleEn: 'Bad Request',
    subtitle: 'HTTP 400 / ERR_BAD_REQUEST',
    description: 'The server cannot process the request due to malformed syntax, invalid payload, or deceptive routing parameters.',
    category: 'http',
    severity: 'warning',
    causes: [
      'Query string parameters or request body format is corrupted.',
      'Browser cookies or local cache for this domain are invalid or stale.',
      'Request headers exceeded the maximum allowed size.'
    ],
    solutions: [
      'Clear your browser cache and cookies for this origin.',
      'Verify that URL query parameters conform to API specifications.',
      'Reload the page or reinitiate the request from a clean state.'
    ],
    tags: ['400', 'bad request', 'invalid', 'syntax', 'http']
  },
  '401': {
    code: '401',
    numericCode: 401,
    title: 'Unauthorized Access',
    titleEn: 'Unauthorized',
    subtitle: 'HTTP 401 / ERR_UNAUTHORIZED',
    description: 'This resource requires authentication credentials or an active authorized session token before access is granted.',
    category: 'http',
    severity: 'warning',
    causes: [
      'No valid authentication credentials were provided in request headers.',
      'Your session token or API key has expired or been revoked.',
      'Session storage was invalidated following a sign-out event.'
    ],
    solutions: [
      'Sign in with your Hyggshi OS account to refresh your credentials.',
      'Check if your personal access token or API key is valid.',
      'Contact system administrators if your account should have access.'
    ],
    tags: ['401', 'unauthorized', 'auth', 'login', 'token', 'http']
  },
  '403': {
    code: '403',
    numericCode: 403,
    title: 'Access Forbidden',
    titleEn: 'Forbidden',
    subtitle: 'HTTP 403 / ERR_ACCESS_DENIED',
    description: 'The server understood your request, but explicitly refuses to authorize access to this target resource.',
    category: 'http',
    severity: 'error',
    causes: [
      'Your current role or account lacks the required permission scope.',
      'The requested endpoint is restricted by IP whitelisting or subnet rules.',
      'Security firewalls (WAF) flagged the request pattern as prohibited.'
    ],
    solutions: [
      'Verify your account permission level with an organization administrator.',
      'Disable VPN or proxy connections that might trigger security restrictions.',
      'Navigate to public Hyggshi OS repositories and documentation.'
    ],
    tags: ['403', 'forbidden', 'access denied', 'permission', 'security', 'http']
  },
  '408': {
    code: '408',
    numericCode: 408,
    title: 'Request Timeout',
    titleEn: 'Request Timeout',
    subtitle: 'HTTP 408 / ERR_TIMED_OUT',
    description: 'The server timed out waiting for the complete request stream from your client browser.',
    category: 'http',
    severity: 'warning',
    causes: [
      'Your Internet connection is intermittent or experiencing heavy packet loss.',
      'Network routing latency between client and host exceeded threshold.',
      'Uploaded payload was too large over a slow uplink connection.'
    ],
    solutions: [
      'Check your Wi-Fi, Ethernet, or mobile data connection.',
      'Refresh the page once network connectivity stabilizes.',
      'Attempt the request on an alternate network or lower upload payload.'
    ],
    tags: ['408', 'timeout', 'request timeout', 'slow network', 'http']
  },
  '429': {
    code: '429',
    numericCode: 429,
    title: 'Too Many Requests',
    titleEn: 'Too Many Requests',
    subtitle: 'HTTP 429 / ERR_RATE_LIMITED',
    description: 'You have sent too many requests in a given amount of time and hit the upstream rate-limiting threshold.',
    category: 'network',
    severity: 'warning',
    causes: [
      'Rapidly sending automated requests or refreshing the page excessively.',
      'Shared public IP address reached GitHub API public rate limit (60 req/hr).',
      'Multiple background tabs synchronizing data concurrently.'
    ],
    solutions: [
      'Wait 1 to 5 minutes before retrying your operation.',
      'Pace network interactions and avoid rapid consecutive page reloads.',
      'Authenticate with an API token to enjoy higher request rate quotas.'
    ],
    tags: ['429', 'rate limit', 'too many requests', 'throttle', 'api']
  },
  '500': {
    code: '500',
    numericCode: 500,
    title: 'Internal Server Error',
    titleEn: 'Internal Server Error',
    subtitle: 'HTTP 500 / ERR_SERVER_CRASH',
    description: 'The server encountered an unexpected condition that prevented it from fulfilling the incoming request.',
    category: 'http',
    severity: 'critical',
    causes: [
      'An unhandled exception occurred in the server-side application logic.',
      'Database connection pool exhaustion or backend service failure.',
      'Server host experienced out-of-memory or CPU throttling limits.'
    ],
    solutions: [
      'Wait a moment and perform a hard refresh (Ctrl + Shift + R or Cmd + Shift + R).',
      'Check the Hyggshi OS Discord or GitHub Status channel for incident reports.',
      'Report this issue to the engineering team with your diagnostic payload.'
    ],
    tags: ['500', 'internal server error', 'server crash', 'backend', 'http']
  },
  '502': {
    code: '502',
    numericCode: 502,
    title: 'Bad Gateway',
    titleEn: 'Bad Gateway',
    subtitle: 'HTTP 502 / ERR_BAD_GATEWAY',
    description: 'The edge server or reverse proxy received an invalid response from the upstream application server.',
    category: 'http',
    severity: 'error',
    causes: [
      'The upstream backend application process crashed or failed to bind to its port.',
      'Edge gateway (Cloudflare, Nginx, Vercel) failed connecting to origin.',
      'Network firewall configuration blocked inter-service communication.'
    ],
    solutions: [
      'Perform a hard refresh of the page to bypass CDN cached errors.',
      'Wait a few moments for the backend service to complete its auto-restart.',
      'Check DNS resolving integrity and CDN origin status.'
    ],
    tags: ['502', 'bad gateway', 'upstream', 'proxy', 'http']
  },
  '503': {
    code: '503',
    numericCode: 503,
    title: 'Service Unavailable',
    titleEn: 'Service Unavailable',
    subtitle: 'HTTP 503 / ERR_SERVICE_UNAVAILABLE',
    description: 'The server is currently unable to handle the request due to temporary maintenance or excessive traffic overload.',
    category: 'http',
    severity: 'warning',
    causes: [
      'Scheduled maintenance or rolling infrastructure upgrade is underway.',
      'Spike in network traffic has saturated all available worker threads.',
      'A background database migration is locking required tables.'
    ],
    solutions: [
      'Please check back in a few minutes once maintenance completes.',
      'Monitor announcements on the official Hyggshi OS Discord community.',
      'Refrain from spamming reload requests to allow server recovery.'
    ],
    tags: ['503', 'service unavailable', 'maintenance', 'overload', 'http']
  },
  '504': {
    code: '504',
    numericCode: 504,
    title: 'Gateway Timeout',
    titleEn: 'Gateway Timeout',
    subtitle: 'HTTP 504 / ERR_GATEWAY_TIMEOUT',
    description: 'The gateway or proxy server did not receive a timely response from the origin host while attempting to process the request.',
    category: 'http',
    severity: 'error',
    causes: [
      'The origin server was delayed executing a long-running database query.',
      'Routing network degradation occurred between the edge and origin node.',
      'A third-party external API integration is unresponsive.'
    ],
    solutions: [
      'Reload the page after a brief delay.',
      'Check if your network route can reach other international endpoints.',
      'Contact support if the timeout persists over extended periods.'
    ],
    tags: ['504', 'gateway timeout', 'upstream delay', 'http']
  },
  '0x0001214': {
    code: '0x0001214',
    title: 'Hyggshi API Connection Failure',
    titleEn: 'Hyggshi API Connection Failure',
    subtitle: 'HOS_NET_0x0001214 / API_CONN_FAILED',
    description: 'The system was unable to retrieve software releases, packages, or OTA update metadata from the API server.',
    category: 'network',
    severity: 'error',
    causes: [
      'Network connectivity issue or custom DNS blocking api.github.com.',
      'GitHub REST API hourly rate limit reached for your client IP address.',
      'Aggressive ad-blockers or privacy extensions intercepting fetch calls.'
    ],
    solutions: [
      'Check your Internet connection and consider using DNS 1.1.1.1 or 8.8.8.8.',
      'Temporarily whitelist this domain in script-blocking extensions.',
      'Wait 5 to 10 minutes for your hourly API rate quota to renew.'
    ],
    tags: ['0x0001214', 'api', 'github', 'network', 'connection', 'hos']
  },
  'SYS_BOOT_ERR': {
    code: 'SYS_BOOT_ERR',
    title: 'System Boot Failure',
    titleEn: 'System Boot Failure',
    subtitle: 'HOS_CORE / BOOT_SEQUENCE_ABORT',
    description: 'The operating system encountered an unrecoverable failure during runtime kernel initialization, stalling the boot sequence.',
    category: 'os',
    severity: 'critical',
    causes: [
      'System configuration file or startup script corrupted during sudden power loss.',
      'Required assets, display shaders, or core modules failed to mount.',
      'Version mismatch between HOSRT Runtime and Roblox Studio / Linux Kernel.'
    ],
    solutions: [
      'Restart the system in Safe Mode (hold Shift during startup).',
      'Download and reinstall the latest Hyggshi OS Core package.',
      'Clear cached local application state and initiate a clean boot.'
    ],
    tags: ['sys_boot_err', 'boot', 'crash', 'startup', 'kernel', 'os']
  },
  'KERNEL_PANIC_0x01': {
    code: 'KERNEL_PANIC_0x01',
    title: 'Hyggshi Kernel Panic',
    titleEn: 'Hyggshi Kernel Panic',
    subtitle: 'CRITICAL / KERNEL_HALT_EXCEPTION',
    description: 'The Hyggshi OS kernel detected an unrecoverable low-level exception and halted execution to safeguard filesystem integrity.',
    category: 'os',
    severity: 'critical',
    causes: [
      'Segmentation fault: attempted memory access to a null pointer or protected page.',
      'Incompatible hardware driver module loaded in Hyggshi OS Linux Edition.',
      'Physical RAM defect or corrupted disk sectors detected.'
    ],
    solutions: [
      'Record the diagnostic stop code displayed on the screen.',
      'Perform a physical hardware power cycle.',
      'Run disk fsck and memory verification diagnostics (memtest).'
    ],
    tags: ['kernel_panic', 'panic', 'halt', 'critical', 'hardware', 'os']
  },
  'HOSRT_MEM_ERR': {
    code: 'HOSRT_MEM_ERR',
    title: 'Runtime Memory Overflow',
    titleEn: 'HOSRT Memory Allocation Overflow',
    subtitle: 'RUNTIME / OUT_OF_HEAP_MEMORY',
    description: 'The HOSRT runtime environment exceeded maximum heap allocation limits, resulting in unexpected thread termination.',
    category: 'runtime',
    severity: 'error',
    causes: [
      'Background process or plugin exhibiting memory leak behaviors.',
      'High-resolution 3D models or audio buffers exhausting system heap.',
      'Browser WebAssembly / JavaScript sandbox memory limits reached.'
    ],
    solutions: [
      'Close unnecessary background windows inside Hyggshi OS.',
      'Reload the tab to flush the WebAssembly / JavaScript memory heap.',
      'Inspect recently added community plugins and custom scripts.'
    ],
    tags: ['hosrt_mem_err', 'memory', 'ram', 'heap', 'overflow', 'runtime']
  },
  'OTA_PKG_FAIL': {
    code: 'OTA_PKG_FAIL',
    title: 'OTA Signature Verification Failed',
    titleEn: 'OTA Package Signature Verification Failed',
    subtitle: 'SECURITY / CHECKSUM_MISMATCH',
    description: 'The downloaded system update package failed cryptographic SHA-256 signature verification and was discarded.',
    category: 'network',
    severity: 'warning',
    causes: [
      'Incomplete package download caused by network connection drop.',
      'Man-in-the-middle tampering detected on insecure public Wi-Fi.',
      'OTA metadata out of sync between staging and edge CDN mirrors.'
    ],
    solutions: [
      'Purge partial download cache and check for updates again.',
      'Switch to a trusted and encrypted network connection.',
      'Download full ISO or ZIP releases directly from GitHub Releases or SourceForge.'
    ],
    tags: ['ota_pkg_fail', 'update', 'checksum', 'signature', 'ota', 'network']
  },
  'NEX_SYNTAX_ERR': {
    code: 'NEX_SYNTAX_ERR',
    title: 'NexCode Compilation Error',
    titleEn: 'NexCode Script Compilation Error',
    subtitle: 'NEX_IDE / PARSE_SYNTAX_ERROR',
    description: 'The NexCode IDE lexer and parser encountered invalid syntax tokens during script compilation.',
    category: 'runtime',
    severity: 'info',
    causes: [
      'Missing closing bracket, semicolon, or block delimiter (e.g. "then", "end").',
      'Language feature used is unsupported in the currently active dialect version.',
      'Invalid non-UTF-8 characters or hidden whitespace tokens.'
    ],
    solutions: [
      'Open NexCode IDE and check lines marked with red wavy underlines.',
      'Review the "Problems" panel in the bottom status bar.',
      'Refer to the Hyggshi OS Code Mini syntax and API documentation.'
    ],
    tags: ['nex_syntax_err', 'syntax', 'nexcode', 'ide', 'compiler', 'runtime']
  }
};

export const COMMON_ERROR_CODES = [
  '400',
  '401',
  '403',
  '404',
  '408',
  '429',
  '500',
  '502',
  '503',
  '504',
  '0x0001214',
  'SYS_BOOT_ERR',
  'KERNEL_PANIC_0x01'
];

export function findError(rawCode?: string | null): ErrorDetail {
  if (!rawCode) return ERROR_DATABASE['404'];

  const normalized = rawCode.trim().toLowerCase();

  // Direct match
  if (ERROR_DATABASE[rawCode.trim()]) {
    return ERROR_DATABASE[rawCode.trim()];
  }

  // Case-insensitive match on keys
  for (const [key, item] of Object.entries(ERROR_DATABASE)) {
    if (key.toLowerCase() === normalized) {
      return item;
    }
  }

  // Match by tags or numericCode
  for (const item of Object.values(ERROR_DATABASE)) {
    if (String(item.numericCode) === normalized || item.tags.some((t) => t.toLowerCase() === normalized)) {
      return item;
    }
  }

  // Generic custom error fallback
  return {
    code: rawCode.toUpperCase(),
    title: `Unrecognized Error Code: ${rawCode}`,
    titleEn: `Unrecognized Error Code: ${rawCode}`,
    subtitle: `SYSTEM_ALERT / CODE_${rawCode.replace(/[^A-Za-z0-9_]/g, '_').toUpperCase()}`,
    description: `The system reported diagnostic code "${rawCode}". This code is not yet registered in the standard Hyggshi OS error reference database.`,
    category: 'system' as const,
    severity: 'warning' as const,
    causes: [
      'Custom error generated by a third-party module or custom extension.',
      'Current system database version is older than the generating service.',
      'URL parameter syntax was provided with an irregular identifier.'
    ],
    solutions: [
      'Copy the system diagnostic report below and submit it to community support.',
      'Update Hyggshi OS to the latest release version.',
      'Return to the homepage or reload the application.'
    ],
    tags: [normalized, 'unknown', 'custom']
  };
}

export function getAllErrors(): ErrorDetail[] {
  return Object.values(ERROR_DATABASE);
}
