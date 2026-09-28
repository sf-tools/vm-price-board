const MAX_CHARS_PER_SOURCE = 60_000;
const USER_AGENT = "vm-price-board/1.0 (+weekly pricing check)";

export interface SourceText {
  url: string;
  text: string;
}

export interface SourceBundle {
  sources: SourceText[];
  failed: { url: string; error: string }[];
  hash: string;
}

export async function fetchSources(urls: string[]): Promise<SourceBundle> {
  const results = await Promise.allSettled(urls.map(fetchOne));
  const sources: SourceText[] = [];
  const failed: SourceBundle["failed"] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") sources.push(r.value);
    else failed.push({ url: urls[i]!, error: String(r.reason?.message ?? r.reason) });
  });
  if (!sources.length) throw new Error(`all sources failed: ${failed.map((f) => `${f.url} (${f.error})`).join("; ")}`);
  const hash = await sha256(sources.map((s) => `${s.url}\n${s.text}`).join("\n\n"));
  return { sources, failed, hash };
}

async function fetchOne(url: string): Promise<SourceText> {
  const res = await fetch(url, {
    headers: { "user-agent": USER_AGENT, accept: "text/markdown, text/plain;q=0.9, text/html;q=0.8, */*;q=0.5" },
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const type = res.headers.get("content-type") ?? "";
  const text = type.includes("text/html") ? await htmlToText(res) : await res.text();
  const clean = text.replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n").trim();
  if (clean.length < 200) throw new Error(`only ${clean.length} chars of text; page may need JS rendering`);
  return { url, text: clean.slice(0, MAX_CHARS_PER_SOURCE) };
}

async function htmlToText(res: Response): Promise<string> {
  const stripped = await new HTMLRewriter()
    .on("script:not([type='application/ld+json']):not([type='application/json']), style, svg, noscript, template, head > link, head > meta", {
      element: (el) => {
        el.remove();
      },
    })
    .transform(res)
    .text();
  return decodeEntities(
    stripped
      .replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6]|\/dt|\/dd|\/section|\/table|\/ul|\/ol)\b[^>]*>/gi, "\n")
      .replace(/<\/t[dh]>/gi, " | ")
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<[^>]+>/g, " "),
  );
}

function decodeEntities(s: string): string {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", euro: "€", cent: "¢", times: "×", mdash: "—", ndash: "–" };
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return named[code.toLowerCase()] ?? m;
  });
}

async function sha256(s: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
