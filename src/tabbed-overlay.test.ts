import type { Theme } from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";
import { ScrollableTabContent } from "./scrollable-tab-content.js";
import { TabbedOverlay } from "./tabbed-overlay.js";

const theme = {
	fg: (_color: string, text: string) => text,
	bold: (text: string) => text,
} as Theme;

function createOverlay(rows: number) {
	const terminal = { rows };
	const tab = new ScrollableTabContent({
		rawText: Array.from({ length: 50 }, (_, i) => `line ${i}`).join("\n"),
		displayLines: Array.from({ length: 50 }, (_, i) => `line ${i}`),
		theme,
	}, "Text");
	const overlay = new TabbedOverlay({ title: "Context", subtitle: "test", tabs: [tab], theme, done: () => {} }, {
		terminal,
	} as TUI);
	return { overlay, terminal };
}

describe("overlay height", () => {
	it("keeps the footer inside the overlay at short terminal heights", () => {
		const { overlay } = createOverlay(20);
		const lines = overlay.render(80);
		expect(lines).toHaveLength(18);
		expect(lines.at(-2)).toContain("q close");
		expect(lines.at(-1)).toContain("╰");
	});

	it("renders the complete frame when only seven rows fit", () => {
		const { overlay } = createOverlay(8);
		const lines = overlay.render(80);
		expect(lines).toHaveLength(7);
		expect(lines.at(-2)).toContain("q close");
		expect(lines.at(-1)).toContain("╰");
	});

	it("uses the normal content height when there is enough room", () => {
		const { overlay } = createOverlay(50);
		expect(overlay.render(80)).toHaveLength(35);
	});

	it("updates page scrolling after a terminal resize", () => {
		const { overlay, terminal } = createOverlay(50);
		overlay.render(80);
		terminal.rows = 20;
		overlay.render(80);
		overlay.handleInput("\x1b[6~");
		const lines = overlay.render(80);
		expect(lines[4]).toContain("line 9");
		expect(lines.at(-2)).toContain("q close");
	});
});
