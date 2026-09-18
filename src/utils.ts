/**
 * Shared utility helpers for pi-context-inspector.
 */

import { visibleWidth } from "@earendil-works/pi-tui";
import type { Theme } from "@earendil-works/pi-coding-agent";

export const formatTokens = (n: number | null | undefined): string => {
	if (n == null) return "N/A";
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${Math.min(999, Math.round(n / 1_000))}k`;
	return n.toString();
};

export const CONTENT_HEIGHT = 28;

export interface BorderHelpers {
  pad: (s: string, len: number) => string;
  row: (content: string) => string;
  borderTop: string;
  borderSep: string;
  borderBottom: string;
}

export function createBorderHelpers(th: Theme, innerW: number): BorderHelpers {
  const pad = (s: string, len: number) => s + " ".repeat(Math.max(0, len - visibleWidth(s)));
  const row = (content: string) => th.fg("border", "│") + pad(content, innerW) + th.fg("border", "│");
  const borderTop = th.fg("border", `╭${"─".repeat(innerW)}╮`);
  const borderSep = th.fg("border", `├${"─".repeat(innerW)}┤`);
  const borderBottom = th.fg("border", `╰${"─".repeat(innerW)}╯`);
  return { pad, row, borderTop, borderSep, borderBottom };
}

export function createTitle(th: Theme, title: string, subtitle: string): string {
  return ` ${th.fg("accent", th.bold(title))}  ${th.fg("dim", `(${subtitle})`)}`;
}
