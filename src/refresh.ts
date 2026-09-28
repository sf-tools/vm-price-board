import { PROVIDERS, type Provider } from "./providers";
import { SEED } from "./seed";
import type { Pricing } from "./schema";
import { fetchSources } from "./sources";
import { extract } from "./extract";
import { priceKey, review } from "./validate";
import { getCheck, insertSnapshot, latestPublishedFor, recordCheck } from "./db";

export type Outcome =
  | { provider: string; result: "unchanged-page" | "no-price-change" | "baseline" }
  | { provider: string; result: "published" | "flagged"; snapshotId: number; changes: string[]; problems: string[] }
  | { provider: string; result: "error"; error: string };

export async function refreshAll(env: Env): Promise<Outcome[]> {
  const settled = await Promise.allSettled(PROVIDERS.map((p) => refreshOne(env, p)));
  return settled.map((s, i) =>
    s.status === "fulfilled" ? s.value : { provider: PROVIDERS[i]!.id, result: "error", error: String(s.reason) },
  );
}

async function refreshOne(env: Env, provider: Provider): Promise<Outcome> {
  const id = provider.id;
  let hash: string | null = null;
  let failedSources: string[] = [];
  try {
    const bundle = await fetchSources(provider.sources);
    hash = bundle.hash;
    failedSources = bundle.failed.map((f) => f.url);

    const last = await getCheck(env.DB, id);
    if (last?.ok && last.content_hash === hash && !failedSources.length) {
      await recordCheck(env.DB, { providerId: id, ok: true, hash, error: null, failedSources });
      return { provider: id, result: "unchanged-page" };
    }

    const live = await latestPublishedFor(env.DB, id);
    const previous: Pricing = live ? JSON.parse(live.pricing) : SEED[id]!;
    const today = new Date().toISOString().slice(0, 10);
    const extraction = await extract(env.ANTHROPIC_API_KEY, env.EXTRACT_MODEL, provider, previous, bundle, today);

    const differs = priceKey(extraction.pricing) !== priceKey(previous);
    const priceChanged = differs && !!live;
    const verdict = differs ? review(previous, extraction) : { ok: true, problems: [] };
    const snapshotId = await insertSnapshot(env.DB, {
      providerId: id,
      status: verdict.ok ? "published" : "flagged",
      priceChanged,
      pricing: extraction.pricing,
      changes: priceChanged ? extraction.changes : [],
      problems: verdict.problems,
      confidence: extraction.confidence,
    });
    await recordCheck(env.DB, { providerId: id, ok: true, hash, error: null, failedSources });

    if (verdict.ok && !priceChanged) return { provider: id, result: live ? "no-price-change" : "baseline" };
    return {
      provider: id,
      result: verdict.ok ? "published" : "flagged",
      snapshotId,
      changes: extraction.changes,
      problems: verdict.problems,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await recordCheck(env.DB, { providerId: id, ok: false, hash: null, error, failedSources });
    return { provider: id, result: "error", error };
  }
}
