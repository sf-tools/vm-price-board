import { estimate, HOURS_PER_MONTH, type Config, type Estimate } from "./cost";
import type { HistoryResponse, PriceChange, PricesResponse, ProviderView } from "../src/api";

declare global {
  interface Window { __PRICES__?: PricesResponse; }
}

const VCPU_OPTIONS = [1, 2, 4, 8, 16];
const RAM_OPTIONS = [1, 2, 4, 8, 16, 32];
const STATE_KEY = "vm-price-board:config";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const els = {
  vcpu: $<HTMLInputElement>("vcpu"),
  ram: $<HTMLInputElement>("ram"),
  disk: $<HTMLInputElement>("disk"),
  hours: $<HTMLInputElement>("hours"),
  load: $<HTMLInputElement>("load"),
};

type Field = keyof typeof els;

let providers: ProviderView[] = [];
const open = new Set<string>();

function options(id: string, input: HTMLInputElement, values: number[]) {
  const host = $(id);
  host.innerHTML = values
    .map((v) => `<button type="button" role="radio" data-v="${v}" aria-checked="${String(v) === input.value}">${v}</button>`)
    .join("");
  host.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest("button");
    if (!btn) return;
    input.value = btn.dataset.v ?? input.value;
    update();
  });
}

function syncControls() {
  for (const [id, input] of [["vcpu-opts", els.vcpu], ["ram-opts", els.ram]] as const) {
    $(id).querySelectorAll("button").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.v === input.value)));
  }
  $("hour-presets").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.hours === els.hours.value)));
}

function config(): Config {
  return {
    vcpu: Number(els.vcpu.value),
    ram: Number(els.ram.value),
    disk: Math.max(1, Number(els.disk.value) || 1),
    hours: Number(els.hours.value),
    cpuLoad: Number(els.load.value) / 100,
  };
}

function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(STATE_KEY) ?? "null") as Partial<Record<Field, string>> | null;
    if (!saved) return;
    for (const k of Object.keys(els) as Field[]) if (saved[k] != null) els[k].value = String(saved[k]);
  } catch {}
}

function save() {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(Object.fromEntries(Object.entries(els).map(([k, el]) => [k, el.value]))));
  } catch {}
}

const money = (n: number) => (n >= 1000 ? `$${Math.round(n).toLocaleString("en-US")}` : `$${n.toFixed(2)}`);
const rate = (n: number) =>
  `$${n === 0 ? "0" : n < 0.01 ? n.toPrecision(3) : n.toFixed(4).replace(/0+$/, "").replace(/\.$/, "")}`;
const ENTITIES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ENTITIES[c] ?? c);
const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const ago = (iso: string) => {
  const h = (Date.now() - Date.parse(iso)) / 36e5;
  if (h < 1) return "under an hour ago";
  if (h < 36) return `${Math.round(h)} h ago`;
  return `${Math.round(h / 24)} days ago`;
};
const leader = (k: string, v: string, cls = "") =>
  `<li class="${cls}"><span>${esc(k)}</span><span class="dots"></span><span class="v">${esc(v)}</span></li>`;

function update() {
  syncControls();
  const cfg = config();
  $("hours-out").textContent = `${cfg.hours} h`;
  $("load-out").textContent = `${els.load.value}%`;
  save();
  render(cfg);
}

function render(cfg: Config) {
  const priced = providers.map((p) => ({ p, est: estimate(p.pricing, cfg) }));
  const fits = priced
    .filter((x): x is { p: ProviderView; est: Estimate } => x.est !== null)
    .sort((a, b) => a.est.total - b.est.total);
  const misses = priced.filter((x) => !x.est);
  const max = Math.max(...fits.map((x) => x.est.total), 1);

  const when = cfg.hours >= HOURS_PER_MONTH ? "running all month" : `awake ${cfg.hours} h a month`;
  $("board-title").textContent = `monthly cost, ${cfg.vcpu} vcpu / ${cfg.ram} gb / ${cfg.disk} gb disk, ${when}`;
  $("board").innerHTML = fits.map((x, i) => row(x.p, x.est, i, max)).join("");
  $("nofit").innerHTML = misses.length
    ? `Too big for ${misses.map((x) => `${esc(x.p.name)} (max ${esc(x.p.pricing.max_size)})`).join(", ")}.`
    : "";
}

function row(p: ProviderView, est: Estimate, i: number, max: number) {
  const pr = p.pricing;
  const today = new Date().toISOString().slice(0, 10);

  const notes: string[] = [];
  const plan = est.plan && (/pay as you go/i.test(est.plan) ? "pay as you go" : `${est.plan} plan`);
  const how = [est.size, plan].filter(Boolean).join(", ").toLowerCase();
  notes.push(esc(how || "pay as you go"));
  const next = pr.upcoming_changes.find((u) => !u.effective_date || u.effective_date > today);
  if (next) {
    const when = next.effective_date
      ? new Date(next.effective_date + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
      : "soon";
    notes.push(`<span class="flag">new price ${esc(when)}</span>`);
  }

  const isOpen = open.has(p.id);
  const width = Math.max(1, (est.total / max) * 100).toFixed(1);
  return `<li class="row${i === 0 ? " first" : ""}" data-id="${esc(p.id)}">
    <button type="button" aria-expanded="${isOpen}" aria-controls="d-${esc(p.id)}">
      <span class="rank">${String(i + 1).padStart(2, "0")}</span>
      <span class="name">${esc(p.name)}</span>
      <span class="amt">${money(est.total)}</span>
      <span class="sub">${notes.map((n) => `<span>${n}</span>`).join("")}</span>
      <span class="rule" aria-hidden="true"><i style="width:${width}%"></i></span>
    </button>
    <div class="detail" id="d-${esc(p.id)}" ${isOpen ? "" : "hidden"}>${isOpen ? detail(p, est) : ""}</div>
  </li>`;
}

function detail(p: ProviderView, est: Estimate) {
  const pr = p.pricing;
  const parts: string[] = [];

  parts.push(`<p>${esc(p.tagline)}. ${esc(pr.billing_summary)}</p>`);

  parts.push(`<div><h3>this estimate</h3><ul class="leaders">${est.lines
    .map((l) => leader(l.label, `${l.usd < 0 ? "−" : ""}${money(Math.abs(l.usd))}`))
    .join("")}${leader("total", money(est.total), "total")}</ul></div>`);

  const rates: [string, string][] = [];
  if (pr.metered) {
    const m = pr.metered;
    rates.push(["vcpu-hour", `${rate(m.vcpu_hour)}${m.cpu_basis === "used" ? ", on use" : ""}`]);
    rates.push(["gb-hour memory", `${rate(m.ram_gb_hour)}${m.ram_basis === "used" ? ", on use" : ""}`]);
    if (m.base_per_hour) rates.push(["machine-hour", rate(m.base_per_hour)]);
    if (m.disk_gb_month_always) rates.push(["disk gb-month", rate(m.disk_gb_month_always)]);
    if (m.disk_gb_month_awake) rates.push(["disk while awake", `+${rate(m.disk_gb_month_awake)} per gb-month`]);
  }
  if (pr.stopped_disk_gb_month != null && pr.sizes.length) rates.push(["disk while stopped", `${rate(pr.stopped_disk_gb_month)} per gb-month`]);
  rates.push(["egress", pr.egress_usd_per_gb == null ? "not published" : pr.egress_usd_per_gb === 0 ? "included" : `${rate(pr.egress_usd_per_gb)} per gb`]);
  if (pr.egress_note) rates.push(["", pr.egress_note]);
  if (pr.free_credit) rates.push(["free", pr.free_credit]);
  parts.push(`<div><h3>rates</h3><dl class="kv">${rates.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl></div>`);

  if (pr.sizes.length) {
    parts.push(`<div><h3>sizes</h3><div class="scroll"><table class="sizes"><thead><tr><th>name</th><th class="n">vcpu</th><th class="n">ram</th><th class="n">disk</th><th class="n">price</th></tr></thead><tbody>${pr.sizes
      .map(
        (s) =>
          `<tr class="${s.name === est.size ? "picked" : ""}"><td>${esc(s.name)}${s.gpu ? `, ${esc(s.gpu)}` : ""}</td><td class="n">${s.vcpu}</td><td class="n">${s.ram_gb}</td><td class="n">${s.disk_gb}</td><td class="n">${
            s.usd_per_month_flat != null ? `${money(s.usd_per_month_flat)}/mo` : s.usd_per_hour != null ? `${rate(s.usd_per_hour)}/h` : "—"
          }</td></tr>`,
      )
      .join("")}</tbody></table></div></div>`);
  }

  if (pr.plans.length) {
    parts.push(`<div><h3>plans</h3><dl class="kv">${pr.plans
      .map(
        (pl) =>
          `<dt>${esc(pl.name)}${pl.name === est.plan ? " ←" : ""}</dt><dd>${pl.usd_per_month == null ? "contact sales" : pl.usd_per_month === 0 ? "free" : `${money(pl.usd_per_month)}/mo`}. ${esc(pl.summary)}</dd>`,
      )
      .join("")}</dl></div>`);
  }

  parts.push(`<div><h3>when idle</h3><p>${esc(pr.idle_summary)}</p></div>`);
  parts.push(`<div><h3>largest machine</h3><p>${esc(pr.max_size)}</p></div>`);

  if (pr.upcoming_changes.length) {
    parts.push(`<div><h3>announced</h3><ul class="dash warn">${pr.upcoming_changes
      .map((u) => `<li>${u.effective_date ? `${esc(day(u.effective_date + "T00:00:00Z"))}: ` : ""}${esc(u.summary)}</li>`)
      .join("")}</ul></div>`);
  }

  parts.push(`<div><h3>features</h3><ul class="dash">${[pr.tech, ...pr.features].map((f) => `<li>${esc(f)}</li>`).join("")}</ul></div>`);
  if (pr.caveats.length) {
    parts.push(`<div><h3>caveats</h3><ul class="dash warn">${pr.caveats.map((c) => `<li>${esc(c)}</li>`).join("")}</ul></div>`);
  }

  if (p.recent_changes.length) {
    parts.push(`<div><h3>recent changes</h3><ul class="dash">${p.recent_changes
      .flatMap((c) => c.changes.map((t) => `<li>${esc(day(c.created_at))}: ${esc(t)}</li>`))
      .join("")}</ul></div>`);
  }

  parts.push(`<p class="src">Prices as of ${esc(day(p.verified_at))}.<br>${[
    `<a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.url.replace(/^https?:\/\//, "").replace(/\/$/, ""))}</a>`,
    ...p.sources.map((s) => `<a href="${esc(s)}" target="_blank" rel="noopener">${esc(s.replace(/^https?:\/\//, ""))}</a>`),
  ].join(" · ")}</p>`);

  return parts.join("");
}

function renderChanges(changes: PriceChange[]) {
  const names = Object.fromEntries(providers.map((p) => [p.id, p.name]));
  $("changes").innerHTML = changes.length
    ? changes
        .map((c) => `<li><time>${esc(day(c.created_at))}</time><span>${esc(names[c.provider_id] ?? c.provider_id)}: ${c.changes.map(esc).join("; ")}</span></li>`)
        .join("")
    : `<li class="empty">None yet. Tracking started Sep 28, 2026.</li>`;
}

$("board").addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest(".row > button");
  const id = btn?.parentElement?.dataset.id;
  if (!id) return;
  if (open.has(id)) open.delete(id);
  else open.add(id);
  render(config());
});

$("hour-presets").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest("button");
  if (!b) return;
  els.hours.value = b.dataset.hours ?? "730";
  update();
});
for (const el of [els.disk, els.hours, els.load]) el.addEventListener("input", update);
$("calc").addEventListener("submit", (e) => e.preventDefault());

async function load() {
  const inline = window.__PRICES__;
  const data: PricesResponse = inline ?? (await (await fetch("/api/prices")).json());
  providers = data.providers;

  const latest = providers
    .map((p) => p.last_check?.at)
    .filter((at): at is string => !!at)
    .sort()
    .at(-1);
  const first = providers[0];
  $("meta").textContent = `${providers.length} providers. ${
    latest ? `Last checked ${ago(latest)}.` : first ? `Prices verified ${day(first.verified_at)}.` : ""
  }`;

  restore();
  options("vcpu-opts", els.vcpu, VCPU_OPTIONS);
  options("ram-opts", els.ram, RAM_OPTIONS);
  update();

  try {
    const hist: HistoryResponse = inline ? { changes: [] } : await (await fetch("/api/history")).json();
    renderChanges(hist.changes);
  } catch {
    renderChanges([]);
  }
}

load().catch((err: Error) => {
  $("meta").textContent = `Couldn't load prices: ${err.message}. Try reloading.`;
});
