import * as z from "zod/v4";

const usd = () => z.number().min(0);

export const Metered = z.object({
  base_per_hour: usd().describe("Flat fee per running machine-hour, 0 if none"),
  vcpu_hour: usd().describe("USD per vCPU-hour"),
  ram_gb_hour: usd().describe("USD per GB(GiB)-hour of memory"),
  cpu_basis: z
    .enum(["allocated", "used"])
    .describe("'used' if CPU is billed on actual utilization, 'allocated' if on machine size"),
  ram_basis: z.enum(["allocated", "used"]),
  disk_gb_month_always: usd().describe("USD per GB-month of disk billed at all times, even when stopped/asleep"),
  disk_gb_month_awake: usd().describe("Extra USD per GB-month of disk billed only while running (e.g. hot/NVMe tier), 0 if none"),
});

export const Size = z.object({
  name: z.string(),
  vcpu: z.number().positive(),
  ram_gb: z.number().positive(),
  disk_gb: z.number().min(0),
  usd_per_hour: usd().nullable().describe("Hourly price while running; null if only sold as a flat monthly price"),
  usd_per_month_flat: usd()
    .nullable()
    .describe("Flat monthly price billed regardless of uptime (e.g. a resource pool); null if hourly"),
  gpu: z.string().nullable(),
  plan: z.string().nullable().describe("Exact name of the plan this size is only sold on, or null if any plan can use it"),
  note: z.string().nullable(),
});

export const Plan = z.object({
  name: z.string(),
  usd_per_month: usd().nullable().describe("null for contact-sales plans"),
  usage_credit_usd: usd().describe("How much of the monthly fee (or free monthly credit) is spendable on usage"),
  included_vcpu_hours: usd(),
  included_ram_gb_hours: usd(),
  included_disk_gb_months: usd(),
  hard_cap: z.boolean().describe("true if exceeding the allowances pauses machines instead of billing overage"),
  max_vcpu: z.number().nullable().describe("Largest machine allowed on this plan"),
  max_ram_gb: z.number().nullable(),
  max_disk_gb: z.number().nullable().describe("Largest disk per machine on this plan"),
  summary: z.string(),
});

export const Pricing = z.object({
  tech: z.string().describe("Isolation technology, e.g. 'Firecracker microVM'"),
  billing_summary: z.string().describe("One sentence on how billing works"),
  metered: Metered.nullable().describe("Per-resource rates; null if the provider only sells fixed sizes"),
  sizes: z.array(Size).describe("Fixed machine sizes or resource pools; empty if purely metered"),
  stopped_disk_gb_month: usd()
    .nullable()
    .describe("For fixed sizes: USD per GB-month while stopped/suspended; 0 if stopped machines are free; null if machines can't be stopped"),
  plans: z.array(Plan).describe("Subscription tiers. Include the free / pay-as-you-go tier if one exists"),
  egress_usd_per_gb: usd().nullable(),
  egress_note: z.string().nullable(),
  free_credit: z.string().nullable().describe("Trial or signup credit, e.g. '$30 one-time'"),
  scales_to_zero: z.boolean().describe("true if idle machines automatically stop billing compute"),
  idle_summary: z.string(),
  max_size: z.string(),
  features: z.array(z.string()).describe("Short feature bullets: snapshots, fork, SSH, GPU, regions..."),
  caveats: z.array(z.string()).describe("Contradictions, unpublished rates, assumptions made"),
  upcoming_changes: z.array(
    z.object({ effective_date: z.string().nullable().describe("YYYY-MM-DD"), summary: z.string() }),
  ),
});

export type Pricing = z.infer<typeof Pricing>;

export const Extraction = z.object({
  pricing: Pricing,
  changes: z
    .array(z.string())
    .describe("Human-readable list of what differs from the previous record, e.g. 'vCPU-hour $0.07 → $0.038'. Empty if nothing changed"),
  confidence: z.enum(["high", "medium", "low"]),
});

export type Extraction = z.infer<typeof Extraction>;
