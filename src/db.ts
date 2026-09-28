import type { Pricing } from "./schema";

export interface SnapshotRow {
  id: number;
  provider_id: string;
  created_at: string;
  status: "published" | "flagged" | "rejected";
  price_changed: number;
  pricing: string;
  changes: string;
  problems: string;
  confidence: string;
}

export interface CheckRow {
  provider_id: string;
  checked_at: string;
  ok: number;
  content_hash: string | null;
  error: string | null;
  failed_sources: string | null;
}

export async function latestPublished(db: D1Database): Promise<Map<string, SnapshotRow>> {
  const { results } = await db
    .prepare(
      `SELECT s.* FROM snapshots s
       JOIN (SELECT provider_id, MAX(id) AS id FROM snapshots WHERE status = 'published' GROUP BY provider_id) l
       ON s.id = l.id`,
    )
    .all<SnapshotRow>();
  return new Map(results.map((r) => [r.provider_id, r]));
}

export async function latestPublishedFor(db: D1Database, providerId: string): Promise<SnapshotRow | null> {
  return db
    .prepare(`SELECT * FROM snapshots WHERE provider_id = ? AND status = 'published' ORDER BY id DESC LIMIT 1`)
    .bind(providerId)
    .first<SnapshotRow>();
}

export async function allChecks(db: D1Database): Promise<Map<string, CheckRow>> {
  const { results } = await db.prepare(`SELECT * FROM checks`).all<CheckRow>();
  return new Map(results.map((r) => [r.provider_id, r]));
}

export async function getCheck(db: D1Database, providerId: string): Promise<CheckRow | null> {
  return db.prepare(`SELECT * FROM checks WHERE provider_id = ?`).bind(providerId).first<CheckRow>();
}

export async function recordCheck(
  db: D1Database,
  c: { providerId: string; ok: boolean; hash: string | null; error: string | null; failedSources: string[] },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO checks (provider_id, checked_at, ok, content_hash, error, failed_sources) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (provider_id) DO UPDATE SET checked_at = excluded.checked_at, ok = excluded.ok,
         content_hash = COALESCE(excluded.content_hash, checks.content_hash), error = excluded.error,
         failed_sources = excluded.failed_sources`,
    )
    .bind(c.providerId, new Date().toISOString(), c.ok ? 1 : 0, c.hash, c.error, JSON.stringify(c.failedSources))
    .run();
}

export async function insertSnapshot(
  db: D1Database,
  s: {
    providerId: string;
    status: SnapshotRow["status"];
    priceChanged: boolean;
    pricing: Pricing;
    changes: string[];
    problems: string[];
    confidence: string;
  },
): Promise<number> {
  const row = await db
    .prepare(
      `INSERT INTO snapshots (provider_id, created_at, status, price_changed, pricing, changes, problems, confidence)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    )
    .bind(
      s.providerId,
      new Date().toISOString(),
      s.status,
      s.priceChanged ? 1 : 0,
      JSON.stringify(s.pricing),
      JSON.stringify(s.changes),
      JSON.stringify(s.problems),
      s.confidence,
    )
    .first<{ id: number }>();
  return row!.id;
}

export async function priceHistory(db: D1Database, providerId: string | null, limit: number) {
  const where = providerId ? `AND provider_id = ?` : "";
  const stmt = db.prepare(
    `SELECT id, provider_id, created_at, changes FROM snapshots
     WHERE status = 'published' AND price_changed = 1 ${where} ORDER BY id DESC LIMIT ?`,
  );
  const { results } = await (providerId ? stmt.bind(providerId, limit) : stmt.bind(limit)).all<
    Pick<SnapshotRow, "id" | "provider_id" | "created_at" | "changes">
  >();
  return results.map((r) => ({ ...r, changes: JSON.parse(r.changes) as string[] }));
}

export async function pendingReview(db: D1Database): Promise<Set<string>> {
  const { results } = await db
    .prepare(`SELECT DISTINCT provider_id FROM snapshots WHERE status = 'flagged'`)
    .all<{ provider_id: string }>();
  return new Set(results.map((r) => r.provider_id));
}
