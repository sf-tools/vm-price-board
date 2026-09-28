export interface Provider {
  id: string;
  name: string;
  url: string;
  tagline: string;
  sources: string[];
}

export const PROVIDERS: Provider[] = [
  {
    id: "boat",
    name: "boat",
    url: "https://boat.dev/",
    tagline: "Persistent Ubuntu VMs with SSH, Docker, snapshots and fork",
    sources: [
      "https://docs.boat.dev/pricing.md",
      "https://docs.boat.dev/billing.md",
      "https://docs.boat.dev/machines.md",
    ],
  },
  {
    id: "exe-dev",
    name: "exe.dev",
    url: "https://exe.dev/",
    tagline: "A pool of CPU and RAM shared by up to 50 VMs, over SSH",
    sources: [
      "https://exe.dev/pricing",
      "https://exe.dev/pricing.js",
      "https://exe.dev/docs/billing/overview.md",
    ],
  },
  {
    id: "machine0",
    name: "machine0",
    url: "https://machine0.io/",
    tagline: "Persistent cloud VMs for long-running agents, GPUs available",
    sources: ["https://docs.machine0.io/introduction/pricing.md"],
  },
  {
    id: "sail",
    name: "Sailboxes",
    url: "https://www.sailresearch.com/sailboxes",
    tagline: "Full VMs for long-horizon agents, free while asleep",
    sources: [
      "https://docs.sailresearch.com/sailboxes-pricing.md",
      "https://docs.sailresearch.com/sailboxes-billing.md",
    ],
  },
  {
    id: "ix",
    name: "ix",
    url: "https://ix.dev/",
    tagline: "Bare-metal NixOS VMs metered on what they actually use",
    sources: ["https://ix.dev/pricing", "https://ix.dev/docs/billing"],
  },
  {
    id: "freestyle",
    name: "Freestyle",
    url: "https://www.freestyle.sh/",
    tagline: "Full Linux VMs for AI agents, with fork and pause",
    sources: [
      "https://www.freestyle.sh/pricing",
      "https://www.freestyle.sh/docs/vms/pricing-and-limits.md",
    ],
  },
  {
    id: "sprites",
    name: "Sprites",
    url: "https://fly.io/sprites/",
    tagline: "Fly.io's Firecracker computers that sleep when idle",
    sources: ["https://fly.io/pricing.md", "https://fly.io/sprites/"],
  },
  {
    id: "boxd",
    name: "boxd",
    url: "https://boxd.sh/",
    tagline: "Forkable KVM machines over SSH, hosted in the EU",
    sources: ["https://boxd.sh/pricing"],
  },
  {
    id: "smol",
    name: "smol machines",
    url: "https://smolmachines.com/",
    tagline: "libkrun microVMs that run the same locally and in the cloud",
    sources: ["https://smolmachines.com/pricing"],
  },
  {
    id: "e2b",
    name: "E2B",
    url: "https://e2b.dev/",
    tagline: "Firecracker sandboxes built for AI agents",
    sources: ["https://e2b.dev/pricing.md", "https://docs.e2b.dev/billing.md"],
  },
  {
    id: "daytona",
    name: "Daytona",
    url: "https://www.daytona.io/",
    tagline: "Fast container and VM sandboxes for agent code",
    sources: ["https://www.daytona.io/pricing", "https://www.daytona.io/docs/en/sandboxes.md"],
  },
  {
    id: "modal",
    name: "Modal",
    url: "https://modal.com/products/sandboxes",
    tagline: "Serverless gVisor sandboxes billed per second",
    sources: ["https://modal.com/pricing", "https://modal.com/docs/guide/network-egress-billing.md"],
  },
  {
    id: "morph",
    name: "Morph Cloud",
    url: "https://cloud.morph.so/",
    tagline: "Snapshot-and-branch VMs billed in compute units",
    sources: ["https://cloud.morph.so/web/pricing"],
  },
];
