import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", hellip: '…', mdash: '—', ndash: '–', copy: '©' };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (match, code: string) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

/** Readable text from HTML: drops scripts, styles and navigation chrome, keeps headings, lists, links and code. */
export function htmlToText(html: string): { title: string; text: string } {
  const title = decodeEntities((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] || '').replace(/\s+/g, ' ').trim());
  let body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html;
  const main = /<(main|article)[^>]*>([\s\S]*?)<\/\1>/i.exec(body)?.[2];
  if (main && main.length > 500) body = main;
  body = body
    .replace(/<(script|style|noscript|svg|template|iframe|head)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(nav|footer|aside)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_m, code: string) => `\n\`\`\`\n${code.replace(/<[^>]+>/g, '')}\n\`\`\`\n`)
    .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_m, code: string) => `\`${code.replace(/<[^>]+>/g, '')}\``)
    .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, level: string, text: string) => `\n\n${'#'.repeat(Number(level))} ${text.replace(/<[^>]+>/g, '').trim()}\n`)
    .replace(/<a\s[^>]*href="(https?:[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, text: string) => {
      const label = text.replace(/<[^>]+>/g, '').trim();
      return label ? `[${label}](${href})` : '';
    })
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<(br|hr)\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|tr|table|ul|ol|blockquote|li|dd|dt)>/gi, '\n')
    .replace(/<t[dh][^>]*>/gi, ' | ')
    .replace(/<[^>]+>/g, ' ');
  const text = decodeEntities(body)
    .split('\n')
    .map((l) => l.replace(/[ \t ]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { title, text };
}

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) MusabAI-Code/0.2 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/json,text/plain;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en,ar;q=0.8',
};

function ipv4Private(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 || // this host, private, loopback, multicast and reserved
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local (cloud metadata)
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) || // IETF protocol assignments
    (a === 198 && (b === 18 || b === 19)) // benchmarking
  );
}

function embeddedIpv4(hi: string, lo: string): string {
  const h = Number.parseInt(hi, 16);
  const l = Number.parseInt(lo, 16);
  return `${h >> 8}.${h & 255}.${l >> 8}.${l & 255}`;
}

/**
 * True for the addresses web_fetch must never reach from this laptop: loopback, private and carrier-grade NAT
 * networks, link-local (cloud metadata), multicast, unique-local and link-local IPv6, and IPv4 written as IPv6
 * (::ffff:127.0.0.1, NAT64, 6to4).
 */
export function isPrivateAddress(address: string): boolean {
  let ip = address.toLowerCase().replace(/^\[|\]$/g, '').replace(/%.*$/, '');
  const kind = isIP(ip);
  if (kind === 4) return ipv4Private(ip);
  if (kind !== 6) return true;
  // The URL parser writes every IPv6 form the same way: compressed, lowercase, an embedded IPv4 in hex.
  ip = new URL(`http://[${ip}]/`).hostname.slice(1, -1);
  const mapped = /^::(?:ffff:(?:0:)?)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(ip) ?? /^64:ff9b::(?:[0-9a-f]{1,4}:)*?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(ip);
  if (mapped) return ipv4Private(embeddedIpv4(mapped[1], mapped[2]));
  const sixToFour = /^2002:([0-9a-f]{1,4}):([0-9a-f]{1,4})(:|$)/.exec(ip);
  if (sixToFour) return ipv4Private(embeddedIpv4(sixToFour[1], sixToFour[2]));
  // ::/96 (unspecified, loopback, IPv4-compatible), unique-local fc00::/7, link- and site-local fe80::/9, multicast ff00::/8.
  return ip.startsWith('::') || /^f[cd]/.test(ip) || /^fe[89a-f]/.test(ip) || ip.startsWith('ff');
}

type Lookup = (host: string) => Promise<string[]>;

const systemLookup: Lookup = async (host) => (await lookup(host, { all: true, verbatim: true })).map((a) => a.address);

/** Refuses a URL whose host is, or resolves to, a local or private address. */
async function assertPublic(url: URL, resolve: Lookup): Promise<void> {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const local = new Error('Local and private network addresses are not fetched by web_fetch; use run_terminal_cmd with curl for a local server.');
  if (!host || /(^|\.)localhost\.?$/i.test(host)) throw local;
  let addresses: string[];
  try {
    addresses = isIP(host) ? [host] : await resolve(host);
  } catch (error) {
    throw new Error(`Could not resolve ${host}: ${(error as Error).message}`);
  }
  if (!addresses.length || addresses.some(isPrivateAddress)) throw local;
}

export async function webFetch(
  url: string,
  fetchImpl: typeof fetch = fetch,
  maxChars = 40_000,
  options: { lookup?: Lookup } = {},
): Promise<{ url: string; title: string; text: string; contentType: string }> {
  if (!/^https?:\/\//i.test(url)) throw new Error('Only http(s) URLs can be fetched.');
  // The agent can still reach local servers with run_terminal_cmd (curl), where the user sees and approves it.
  const checked = !process.env.MUSABAI_ALLOW_LOCAL_FETCH;
  let current = new URL(url);
  let res: Response;
  // Redirects are followed by hand so every hop is checked, not only the first host.
  for (let hop = 0; ; hop++) {
    if (checked) await assertPublic(current, options.lookup ?? systemLookup);
    res = await fetchImpl(current, { headers: BROWSER_HEADERS, redirect: 'manual', signal: AbortSignal.timeout(25_000) });
    const location = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
    if (!location) break;
    await res.body?.cancel().catch(() => undefined);
    if (hop >= 5) throw new Error(`Too many redirects for ${url}`);
    current = new URL(location, current);
    if (!/^https?:$/.test(current.protocol)) throw new Error(`${url} redirects to a URL that is not http(s).`);
  }
  const contentType = res.headers.get('content-type') || '';
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${current.href}`);
  const raw = await res.text();
  let title = '';
  let text = raw;
  if (/html/i.test(contentType) || /^\s*<(!doctype|html)/i.test(raw)) ({ title, text } = htmlToText(raw));
  else if (/json/i.test(contentType)) {
    try {
      text = JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      text = raw;
    }
  }
  if (text.length > maxChars) text = `${text.slice(0, maxChars)}\n…(page truncated at ${maxChars} characters)`;
  return { url: current.href, title, text, contentType };
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export function parseDuckDuckGo(html: string, limit = 8): SearchResult[] {
  const results: SearchResult[] = [];
  const blocks = html.split(/<div[^>]+class="[^"]*\bresult\b[^"]*"/i).slice(1);
  for (const block of blocks) {
    const link = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(block);
    if (!link) continue;
    let url = decodeEntities(link[1]);
    const uddg = /[?&]uddg=([^&]+)/.exec(url);
    if (uddg) url = decodeURIComponent(uddg[1]);
    if (url.startsWith('//')) url = `https:${url}`;
    if (!/^https?:\/\//.test(url) || /duckduckgo\.com\/y\.js/.test(url)) continue;
    const snippet = /<(?:a|div)[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|div)>/i.exec(block)?.[1] || '';
    results.push({
      title: decodeEntities(link[2].replace(/<[^>]+>/g, '')).trim(),
      url,
      snippet: decodeEntities(snippet.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim(),
    });
    if (results.length >= limit) break;
  }
  return results;
}

export async function webSearch(query: string, fetchImpl: typeof fetch = fetch, limit = 8): Promise<SearchResult[]> {
  const res = await fetchImpl(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
    headers: BROWSER_HEADERS,
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Web search failed: HTTP ${res.status}`);
  return parseDuckDuckGo(await res.text(), limit);
}
