import { PROVIDERS } from "./providers";
import { SEED, SEED_DATE } from "./seed";
import type { Pricing } from "./schema";
import type { HistoryResponse, PricesResponse, ProviderView } from "./api";
import { refreshAll } from "./refresh";
import { allChecks, latestPublished, pendingReview, priceHistory } from "./db";

const CANONICAL_HOST = "vm-price-board.sf.tools";
const OLD_HOST = "vm-pricing.sf.tools";

export default {
  async fetch(req, env): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;

    if (url.hostname === OLD_HOST) {
      url.hostname = CANONICAL_HOST;
      return Response.redirect(url.toString(), 301);
    }

    if (req.method === "GET" && path === "/api/prices") return prices(env);
    if (req.method === "GET" && path === "/api/history") {
      const provider = url.searchParams.get("provider");
      return json({ changes: await priceHistory(env.DB, provider, 100) } satisfies HistoryResponse, 300);
    }

    if (path.startsWith("/api/")) return json({ error: "Not found" }, 0, 404);
    return env.ASSETS.fetch(req);
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      refreshAll(env).then((outcomes) => {
        for (const o of outcomes) console.log(JSON.stringify(o));
      }),
    );
  },
} satisfies ExportedHandler<Env>;

async function prices(env: Env): Promise<Response> {
  const [live, checks, recent, pending] = await Promise.all([
    latestPublished(env.DB),
    allChecks(env.DB),
    priceHistory(env.DB, null, 60),
    pendingReview(env.DB),
  ]);

  const providers = PROVIDERS.map((p): ProviderView => {
    const snap = live.get(p.id);
    const check = checks.get(p.id);
    const pricing: Pricing = snap ? JSON.parse(snap.pricing) : SEED[p.id]!;
    return {
      id: p.id,
      name: p.name,
      url: p.url,
      tagline: p.tagline,
      sources: p.sources,
      pricing,
      verified_at: snap?.created_at ?? `${SEED_DATE}T00:00:00Z`,
      verified_by: snap ? "weekly check" : "manual research",
      last_check: check
        ? { at: check.checked_at, ok: !!check.ok, error: check.error, failed_sources: JSON.parse(check.failed_sources ?? "[]") }
        : null,
      pending_review: pending.has(p.id),
      recent_changes: recent.filter((r) => r.provider_id === p.id).slice(0, 5),
    };
  });

  return json({ generated_at: new Date().toISOString(), providers } satisfies PricesResponse, 300);
}

function json(body: unknown, maxAge = 0, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": maxAge ? `public, max-age=${maxAge}` : "no-store",
      "access-control-allow-origin": "*",
    },
  });
}
