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
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) MusabAI-Code/0.1 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/json,text/plain;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en,ar;q=0.8',
};

export async function webFetch(url: string, fetchImpl: typeof fetch = fetch, maxChars = 40_000): Promise<{ url: string; title: string; text: string; contentType: string }> {
  if (!/^https?:\/\//i.test(url)) throw new Error('Only http(s) URLs can be fetched.');
  const host = new URL(url).hostname;
  if (/^(localhost|127\.|0\.0\.0\.0|\[?::1\]?|169\.254\.)/.test(host) && !process.env.MUSABAI_ALLOW_LOCAL_FETCH) {
    // The agent can still reach local servers with run_terminal_cmd (curl), where the user sees it.
    throw new Error('Local addresses are not fetched by web_fetch; use run_terminal_cmd with curl for a local server.');
  }
  const res = await fetchImpl(url, { headers: BROWSER_HEADERS, redirect: 'follow', signal: AbortSignal.timeout(25_000) });
  const contentType = res.headers.get('content-type') || '';
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
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
  return { url: res.url || url, title, text, contentType };
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
