import type { Pricing } from "../src/schema";

type Plan = Pricing["plans"][number];

export interface Config {
  vcpu: number;
  ram: number;
  disk: number;
  hours: number;
  cpuLoad: number;
}

export interface Line {
  label: string;
  usd: number;
}

export interface Estimate {
  total: number;
  plan: string | null;
  size: string | null;
  lines: Line[];
}

export const HOURS_PER_MONTH = 730;

export const REFERENCE: Config = { vcpu: 2, ram: 4, disk: 20, hours: HOURS_PER_MONTH, cpuLoad: 1 };

export function estimate(pricing: Pricing, cfg: Config): Estimate | null {
  const plans = pricing.plans.filter((p) => p.usd_per_month !== null);
  const planOptions: (Plan | null)[] = plans.length ? plans : [null];
  const awake = Math.min(cfg.hours, HOURS_PER_MONTH) / HOURS_PER_MONTH;

  let best: Estimate | null = null;
  const consider = (e: Estimate) => {
    if (!best || e.total < best.total) best = e;
  };

  if (pricing.metered) {
    const m = pricing.metered;
    const cpuHours = cfg.vcpu * cfg.hours * (m.cpu_basis === "used" ? cfg.cpuLoad : 1);
    const ramHours = cfg.ram * cfg.hours;

    for (const plan of planOptions) {
      if (!fitsPlan(plan, cfg)) continue;
      const cpuBill = Math.max(0, cpuHours - (plan?.included_vcpu_hours ?? 0));
      const ramBill = Math.max(0, ramHours - (plan?.included_ram_gb_hours ?? 0));
      const diskBill = Math.max(0, cfg.disk - (plan?.included_disk_gb_months ?? 0));
      if (plan?.hard_cap && (cpuBill > 0 || ramBill > 0 || diskBill > 0)) continue;

      const usage: Line[] = [];
      if (m.base_per_hour) usage.push({ label: "Machine base fee", usd: m.base_per_hour * cfg.hours });
      usage.push({ label: `CPU (${fmtNum(cpuBill)} vCPU-h)`, usd: cpuBill * m.vcpu_hour });
      usage.push({ label: `Memory (${fmtNum(ramBill)} GB-h)`, usd: ramBill * m.ram_gb_hour });
      const disk = diskBill * m.disk_gb_month_always + cfg.disk * awake * m.disk_gb_month_awake;
      if (disk) usage.push({ label: `Disk (${cfg.disk} GB)`, usd: disk });
      consider(withPlan(plan, usage, null));
    }
  }

  for (const size of pricing.sizes) {
    if (size.gpu || size.vcpu < cfg.vcpu || size.ram_gb < cfg.ram || size.disk_gb < cfg.disk) continue;
    const usage: Line[] = [];
    if (size.usd_per_month_flat != null) {
      usage.push({ label: `${size.name} (flat monthly)`, usd: size.usd_per_month_flat });
    } else if (size.usd_per_hour != null) {
      if (pricing.stopped_disk_gb_month == null) {
        usage.push({ label: `${size.name} × ${HOURS_PER_MONTH} h (always on)`, usd: size.usd_per_hour * HOURS_PER_MONTH });
      } else {
        usage.push({ label: `${size.name} × ${fmtNum(cfg.hours)} h`, usd: size.usd_per_hour * cfg.hours });
        const parked = pricing.stopped_disk_gb_month * size.disk_gb * (1 - awake);
        if (parked) usage.push({ label: "Disk while stopped", usd: parked });
      }
    } else continue;
    for (const plan of planOptions) {
      if (!fitsPlan(plan, cfg)) continue;
      if (size.plan && plan?.name !== size.plan) continue;
      consider(withPlan(plan, usage, size.name));
    }
  }

  return best;
}

function fitsPlan(plan: Plan | null, cfg: Config): boolean {
  if (!plan) return true;
  if (plan.max_vcpu != null && cfg.vcpu > plan.max_vcpu) return false;
  if (plan.max_ram_gb != null && cfg.ram > plan.max_ram_gb) return false;
  if (plan.max_disk_gb != null && cfg.disk > plan.max_disk_gb) return false;
  return true;
}

function withPlan(plan: Plan | null, usage: Line[], size: string | null): Estimate {
  const usageTotal = usage.reduce((s, l) => s + l.usd, 0);
  const fee = plan?.usd_per_month ?? 0;
  const credit = Math.min(plan?.usage_credit_usd ?? 0, usageTotal);
  const lines = [...usage];
  if (fee) lines.push({ label: `${plan?.name} plan fee`, usd: fee });
  if (credit) lines.push({ label: fee ? "Covered by plan credit" : "Free monthly credit", usd: -credit });
  return { total: fee + usageTotal - credit, plan: plan?.name ?? null, size, lines };
}

function fmtNum(n: number): string {
  return n >= 100 ? Math.round(n).toLocaleString("en-US") : String(Math.round(n * 10) / 10);
}
