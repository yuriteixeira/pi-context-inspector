import type { Theme } from "@earendil-works/pi-coding-agent";
import type { TabContent } from "./tabbed-overlay.js";
import { ScrollableBase } from "./scrollable-base.js";

export interface ScrollableTabContentOptions {
  rawText: string;
  displayLines: string[];
  theme: Theme;
}

export class ScrollableTabContent extends ScrollableBase implements TabContent {
  constructor(
    private opts: ScrollableTabContentOptions,
    public readonly name: string = "",
  ) {
    super();
  }

  protected get rawText(): string { return this.opts.rawText; }
  protected get displayLines(): string[] { return this.opts.displayLines; }
  protected get theme(): Theme { return this.opts.theme; }

  getAboveContentLine(_innerWidth: number): string | null {
    const th = this.opts.theme;
    if (this.searchMode) {
      return ` ${th.fg("accent", "/")} ${this.searchQuery}${th.fg("dim", "▏")}`;
    }
    if (this.searchMatches.length > 0) {
      return ` ${th.fg("accent", "/")} ${th.fg("text", this.searchQuery)} ${th.fg("dim", "—")} ${th.fg("accent", `${this.currentMatchIndex + 1}/${this.searchMatches.length}`)}`;
    }
    if (this.searchQuery.length > 0) {
      return ` ${th.fg("accent", "/")} ${th.fg("text", this.searchQuery)} ${th.fg("dim", "—")} ${th.fg("warning", "0 matches")}`;
    }
    return null;
  }

  getFooterLeft(): string {
    const th = this.opts.theme;
    const total = this.visualTotal > 0 ? this.visualTotal : this.opts.displayLines.length;
    const maxScroll = Math.max(0, total - 1);
    const visibleEnd = Math.min(this.scrollOffset + 1, total);

    const scrollPercent =
      total === 0
        ? "All"
        : this.scrollOffset === 0
          ? "Top"
          : this.scrollOffset >= maxScroll
            ? "Bot"
            : `${Math.round(((this.scrollOffset + 1) / total) * 100)}%`;

    let left = `${visibleEnd}/${total} [${scrollPercent}]`;
    if (this.copyFlash) {
      left += th.fg("success", " ✓ Copied!");
    }
    return left;
  }

  readonly footerHints = "↑↓ scroll · / search · n/N next · y copy";

  handleInput(data: string): boolean {
    return this.handleScrollKey(data);
  }

  renderContent(innerWidth: number, height: number): string[] {
    this.buildVisualLines(innerWidth);
    const th = this.opts.theme;
    const lines: string[] = [];

    const maxScroll = Math.max(0, this.visualTotal - height);
    this.scrollOffset = Math.min(this.scrollOffset, maxScroll);
    this.scrollOffset = Math.max(0, this.scrollOffset);

    for (let i = 0; i < height; i++) {
      const lineIdx = this.scrollOffset + i;
      if (lineIdx < this.visualTotal) {
        let line = this.visualLines[lineIdx]!;

        const logicalIdx = this.visualToLogical[lineIdx]!;
        const isCurrentMatch =
          this.searchMatches.length > 0 &&
          this.currentMatchIndex >= 0 &&
          this.searchMatches[this.currentMatchIndex] === logicalIdx;
        const isOtherMatch =
          this.searchMatches.length > 0 && this.searchMatches.includes(logicalIdx) && !isCurrentMatch;

        if (isCurrentMatch) {
          line = th.bg("selectedBg", line);
        } else if (isOtherMatch) {
          line = th.fg("warning", line);
        }

        lines.push(line);
      } else {
        lines.push(th.fg("dim", "~"));
      }
    }

    return lines;
  }
}
