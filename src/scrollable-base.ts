import { copyToClipboard as copyTextToClipboard, type Theme } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, sliceByColumn, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { CONTENT_HEIGHT } from "./utils.js";

export abstract class ScrollableBase {
  protected scrollOffset = 0;
  protected searchMode = false;
  protected searchQuery = "";
  protected searchMatches: number[] = [];
  protected currentMatchIndex = -1;
  protected copyFlash = false;
  protected copyFlashTimer: ReturnType<typeof setTimeout> | undefined;
  protected visualLines: string[] = [];
  protected visualToLogical: number[] = [];
  protected visualTotal = 0;

  protected abstract get rawText(): string;
  protected abstract get displayLines(): string[];
  protected abstract get theme(): Theme;

  protected getVisibleLines(): number {
    return CONTENT_HEIGHT;
  }

  protected buildVisualLines(innerWidth: number): void {
    const th = this.theme;
    const total = this.displayLines.length;
    const numWidth = String(total).length;
    const prefixWidth = numWidth + 3;
    const continuationPrefix = th.fg("dim", " ".repeat(numWidth) + " · ");

    this.visualLines = [];
    this.visualToLogical = [];

    for (let logicalIdx = 0; logicalIdx < total; logicalIdx++) {
      const displayLine = this.displayLines[logicalIdx]!;
      const lineWidth = visibleWidth(displayLine);

      if (lineWidth <= innerWidth) {
        this.visualLines.push(displayLine);
        this.visualToLogical.push(logicalIdx);
        continue;
      }

      const contentMaxWidth = innerWidth - prefixWidth;
      const origPrefix = sliceByColumn(displayLine, 0, prefixWidth);
      const content = sliceByColumn(displayLine, prefixWidth, lineWidth - prefixWidth);
      const wrapped = wrapTextWithAnsi(content, contentMaxWidth);

      for (let w = 0; w < wrapped.length; w++) {
        this.visualLines.push(w === 0 ? origPrefix + wrapped[w]! : continuationPrefix + wrapped[w]!);
        this.visualToLogical.push(logicalIdx);
      }
    }

    this.visualTotal = this.visualLines.length;
  }

  protected handleSearchInput(data: string): boolean {
    if (!this.searchMode) return false;

    if (matchesKey(data, Key.escape)) {
      this.searchMode = false;
      this.searchQuery = "";
      this.searchMatches = [];
      this.currentMatchIndex = -1;
      return true;
    }
    if (matchesKey(data, Key.enter)) {
      if (this.searchQuery.length > 0) {
        this.findMatches();
        if (this.searchMatches.length > 0) {
          this.currentMatchIndex = 0;
          this.scrollToMatch(this.getVisibleLines());
        }
      }
      this.searchMode = false;
      return true;
    }
    if (matchesKey(data, Key.backspace)) {
      this.searchQuery = this.searchQuery.slice(0, -1);
      this.findMatches();
      if (this.searchMatches.length > 0) {
        this.currentMatchIndex = 0;
        this.scrollToMatch(this.getVisibleLines());
      }
      return true;
    }
    if (data.length === 1 && data.charCodeAt(0) >= 32) {
      this.searchQuery += data;
      this.findMatches();
      if (this.searchMatches.length > 0) {
        this.currentMatchIndex = 0;
        this.scrollToMatch(this.getVisibleLines());
      }
      return true;
    }
    return true;
  }

  protected handleScrollKey(data: string): boolean {
    if (this.handleSearchInput(data)) return true;

    const visibleLines = this.getVisibleLines();
    const maxOffset = Math.max(0, this.visualTotal - visibleLines);

    if (matchesKey(data, Key.down) || data === "j") {
      this.scrollDown(1, maxOffset);
      return true;
    }
    if (matchesKey(data, Key.up) || data === "k") {
      this.scrollUp(1);
      return true;
    }
    if (matchesKey(data, Key.home) || data === "g") {
      this.scrollOffset = 0;
      return true;
    }
    if (matchesKey(data, Key.end) || data === "G") {
      this.scrollToBottom(maxOffset);
      return true;
    }
    if (matchesKey(data, Key.pageDown) || matchesKey(data, Key.ctrl("f"))) {
      this.scrollDown(visibleLines - 2, maxOffset);
      return true;
    }
    if (matchesKey(data, Key.pageUp) || matchesKey(data, Key.ctrl("b"))) {
      this.scrollUp(visibleLines - 2);
      return true;
    }
    if (matchesKey(data, Key.ctrl("d"))) {
      this.scrollDown(Math.floor(visibleLines / 2), maxOffset);
      return true;
    }
    if (matchesKey(data, Key.ctrl("u"))) {
      this.scrollUp(Math.floor(visibleLines / 2));
      return true;
    }
    if (data === "/") {
      this.searchMode = true;
      this.searchQuery = "";
      this.searchMatches = [];
      this.currentMatchIndex = -1;
      return true;
    }
    if (data === "n") {
      this.nextMatch();
      return true;
    }
    if (data === "N") {
      this.prevMatch();
      return true;
    }
    if (data === "y") {
      void this.copyToClipboard();
      return true;
    }

    return false;
  }
  protected findMatches(): void {
    const query = this.searchQuery.toLowerCase();
    const rawLines = this.rawText.split("\n");
    this.searchMatches = [];
    if (query.length === 0) {
      this.currentMatchIndex = -1;
      return;
    }
    for (let i = 0; i < rawLines.length; i++) {
      if (rawLines[i]!.toLowerCase().includes(query)) {
        this.searchMatches.push(i);
      }
    }
  }

  protected scrollToMatch(visibleLines: number): void {
    if (this.currentMatchIndex >= 0 && this.currentMatchIndex < this.searchMatches.length) {
      const logicalLine = this.searchMatches[this.currentMatchIndex]!;
      const targetLine = this.visualToLogical.indexOf(logicalLine);
      if (targetLine >= 0) {
        if (targetLine < this.scrollOffset || targetLine >= this.scrollOffset + visibleLines) {
          this.scrollOffset = Math.max(0, targetLine - Math.floor(visibleLines / 3));
        }
      }
    }
  }

  protected nextMatch(): void {
    if (this.searchMatches.length === 0) return;
    this.currentMatchIndex = (this.currentMatchIndex + 1) % this.searchMatches.length;
    this.scrollToMatch(this.getVisibleLines());
  }

  protected prevMatch(): void {
    if (this.searchMatches.length === 0) return;
    this.currentMatchIndex = (this.currentMatchIndex - 1 + this.searchMatches.length) % this.searchMatches.length;
    this.scrollToMatch(this.getVisibleLines());
  }

  protected async copyToClipboard(): Promise<void> {
    this.copyFlash = true;
    try {
      await copyTextToClipboard(this.rawText);
    } catch {
      // Silently fail if clipboard tools aren't available
    }
    clearTimeout(this.copyFlashTimer);
    this.copyFlashTimer = setTimeout(() => {
      this.copyFlash = false;
    }, 1500);
  }

  protected scrollDown(amount: number, maxOffset: number): void {
    this.scrollOffset = Math.min(this.scrollOffset + amount, maxOffset);
  }

  protected scrollUp(amount: number): void {
    this.scrollOffset = Math.max(0, this.scrollOffset - amount);
  }

  protected scrollToBottom(maxOffset: number): void {
    this.scrollOffset = Math.max(0, maxOffset);
  }

  invalidate(): void {
    this.visualLines = [];
    this.visualToLogical = [];
    this.visualTotal = 0;
  }
}
