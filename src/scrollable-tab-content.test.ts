import type { Theme } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { ScrollableTabContent } from "./scrollable-tab-content.js";

describe("editor shortcut", () => {
	it("opens the text tab but lets search accept the letter e", () => {
		const onOpenEditor = vi.fn();
		const tab = new ScrollableTabContent({
			rawText: "example",
			displayLines: ["example"],
			theme: {} as Theme,
			onOpenEditor,
		}, "Tools");
		expect(tab.handleInput("e")).toBe(true);
		expect(onOpenEditor).toHaveBeenCalledOnce();
		tab.handleInput("/");
		tab.handleInput("e");
		expect(onOpenEditor).toHaveBeenCalledOnce();
	});
});
