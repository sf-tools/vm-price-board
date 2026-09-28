import type { Extraction, Pricing } from "./schema";
import { estimate, REFERENCE } from "../web/cost";

const MAX_SWING = 0.5;

export function review(previous: Pricing, next: Extraction): { ok: boolean; problems: string[] } {
  const problems = [...sanity(next.pricing)];
  if (next.confidence === "low") problems.push("extractor reported low confidence");

  const before = estimate(previous, REFERENCE)?.total ?? null;
  const after = estimate(next.pricing, REFERENCE)?.total ?? null;
  if (before !== null && after === null) {
    problems.push("the 2 vCPU / 4 GB reference machine can no longer be priced");
  } else if (before !== null && after !== null && before > 0) {
    const swing = (after - before) / before;
    if (Math.abs(swing) > MAX_SWING) {
      problems.push(`reference machine moved ${fmt(before)} → ${fmt(after)} (${Math.round(swing * 100)}%)`);
    }
  }
  return { ok: problems.length === 0, problems };
}

function sanity(p: Pricing): string[] {
  const out: string[] = [];
  if (!p.metered && !p.sizes.length) out.push("no metered rates and no sizes");
  if (p.metered) {
    const m = p.metered;
    if (m.vcpu_hour <= 0 || m.vcpu_hour > 1) out.push(`vCPU-hour $${m.vcpu_hour} is outside $0–1`);
    if (m.ram_gb_hour <= 0 || m.ram_gb_hour > 0.5) out.push(`GB-hour $${m.ram_gb_hour} is outside $0–0.5`);
    if (m.base_per_hour > 1) out.push(`base fee $${m.base_per_hour}/h looks too high`);
    if (m.disk_gb_month_always > 2 || m.disk_gb_month_awake > 2) out.push("disk over $2/GB-month looks wrong");
  }
  for (const s of p.sizes) {
    if (s.usd_per_hour == null && s.usd_per_month_flat == null) out.push(`size ${s.name} has no price`);
    const hourly = s.usd_per_hour ?? (s.usd_per_month_flat ?? 0) / 730;
    const perVcpu = hourly / s.vcpu;
    if (!s.gpu && (perVcpu < 0.001 || perVcpu > 0.3)) out.push(`size ${s.name} costs $${perVcpu.toFixed(4)} per vCPU-hour`);
  }
  return out;
}

export function priceKey(p: Pricing): string {
  return stable({
    metered: p.metered,
    sizes: p.sizes.map((s) => [s.name, s.vcpu, s.ram_gb, s.disk_gb, s.usd_per_hour, s.usd_per_month_flat]),
    plans: p.plans.filter((pl) => pl.usd_per_month !== null).map((pl) => [pl.name, pl.usd_per_month, pl.usage_credit_usd, pl.included_vcpu_hours, pl.included_ram_gb_hours, pl.included_disk_gb_months, pl.hard_cap]),
    stopped: p.stopped_disk_gb_month,
    egress: p.egress_usd_per_gb,
  });
}

export function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}

const fmt = (n: number) => `$${n.toFixed(2)}`;
