// ═══════════════════════════════════════════════════════════════
// Shared Theme Constants — Single Source of Truth
// ═══════════════════════════════════════════════════════════════

import type { AccentColor } from "@/types/hermes";

/** Aligns main-column top bar with Sidebar brand row (`--ch-shell-header-min-height` in globals.css). */
export const shellHeaderBarClasses =
  "border-b border-white/10 bg-dark-900/50 backdrop-blur-xl min-h-[var(--ch-shell-header-min-height)] flex items-center px-6";

// ── Icon Color Map ────────────────────────────────────────────
export const iconColorMap: Record<AccentColor, string> = {
  cyan: "text-neon-cyan",
  purple: "text-neon-purple",
  green: "text-neon-green",
  pink: "text-neon-pink",
  orange: "text-neon-orange",
};

// ── Border Color Map (for hover effects) — token-aligned ─────
export const colorBorderMap: Record<AccentColor, string> = {
  cyan:
    "border-neon-cyan/30 hover:border-neon-cyan/60 hover:shadow-[0_0_20px_rgb(var(--ch-rgb-neon-cyan)_/_0.12)]",
  purple:
    "border-neon-purple/30 hover:border-neon-purple/60 hover:shadow-[0_0_20px_rgb(var(--ch-rgb-neon-purple)_/_0.12)]",
  green:
    "border-neon-green/30 hover:border-neon-green/60 hover:shadow-[0_0_20px_rgb(var(--ch-rgb-neon-green)_/_0.12)]",
  pink:
    "border-neon-pink/30 hover:border-neon-pink/60 hover:shadow-[0_0_20px_rgb(var(--ch-rgb-neon-pink)_/_0.12)]",
  orange:
    "border-neon-orange/30 hover:border-neon-orange/60 hover:shadow-[0_0_20px_rgb(var(--ch-rgb-neon-orange)_/_0.12)]",
};

// ── Focus Ring Color (for inputs/selects) ─────────────────────
export const focusColorMap: Record<AccentColor, string> = {
  cyan: "focus:border-neon-cyan/50",
  purple: "focus:border-neon-purple/50",
  green: "focus:border-neon-green/50",
  pink: "focus:border-neon-pink/50",
  orange: "focus:border-neon-orange/50",
};

// ── Glow Class Map (legacy box-shadow utilities in globals.css) ─
export const glowClassMap: Record<AccentColor, string> = {
  cyan: "glow-cyan",
  purple: "glow-purple",
  green: "glow-green",
  pink: "glow-pink",
  orange: "glow-orange",
};

/** RGB triplets for `rgb(var(--glow-surface-rgb) / …)` — must match docs/design-tokens.md + globals :root */
export const glowSurfaceRgbMap: Record<AccentColor, string> = {
  cyan: "0, 191, 255",
  purple: "139, 92, 255",
  green: "163, 255, 18",
  pink: "232, 121, 249",
  orange: "255, 159, 28",
};

// ── Badge Background Color ────────────────────────────────────
export const badgeBgMap: Record<AccentColor, string> = {
  cyan: "bg-neon-cyan/10",
  purple: "bg-neon-purple/10",
  green: "bg-neon-green/10",
  pink: "bg-neon-pink/10",
  orange: "bg-neon-orange/10",
};

// ── Badge Text Color ──────────────────────────────────────────
export const badgeTextMap: Record<AccentColor, string> = {
  cyan: "text-neon-cyan",
  purple: "text-neon-purple",
  green: "text-neon-green",
  pink: "text-neon-pink",
  orange: "text-neon-orange",
};

// ── Badge Border Color ────────────────────────────────────────
export const badgeBorderMap: Record<AccentColor, string> = {
  cyan: "border-neon-cyan/20",
  purple: "border-neon-purple/20",
  green: "border-neon-green/20",
  pink: "border-neon-pink/20",
  orange: "border-neon-orange/20",
};

// ── Combined Badge Styles ─────────────────────────────────────
export function badgeClasses(color: AccentColor): string {
  return `${badgeBgMap[color]} ${badgeTextMap[color]} ${badgeBorderMap[color]} border`;
}

// ── Base Input Styles ─────────────────────────────────────────
export const baseInputStyles =
  "w-full bg-dark-900/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 outline-none transition-colors font-mono";
