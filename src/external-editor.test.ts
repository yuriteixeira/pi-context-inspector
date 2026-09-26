import { readFile } from "node:fs/promises";
import { EventEmitter } from "node:events";
import type { TUI } from "@earendil-works/pi-tui";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openInExternalEditor } from "./external-editor.js";

const spawn = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({ spawn }));

afterEach(() => {
	vi.unstubAllEnvs();
	spawn.mockReset();
});

describe("openInExternalEditor", () => {
	it("opens the raw view, restores the terminal and removes the temporary file", async () => {
		vi.stubEnv("EDITOR", "vim -R");
		const events: string[] = [];
		const tui = {
			stop: () => events.push("stop"),
			start: () => events.push("start"),
			requestRender: () => events.push("render"),
		} as unknown as TUI;
		let path = "";
		let content = "";
		spawn.mockImplementation((_editor: string, args: string[]) => {
			path = args.at(-1)!;
			const child = new EventEmitter();
			void readFile(path, "utf8").then((text) => {
				content = text;
				child.emit("close", 0);
			});
			return child;
		});

		await openInExternalEditor(tui, "Tools", "Tool: read\nParameters: {}\n");
		expect(spawn).toHaveBeenCalledWith("vim", ["-R", path], expect.objectContaining({ stdio: "inherit" }));
		expect(content).toBe("Tool: read\nParameters: {}\n");
		expect(events).toEqual(["stop", "start", "render"]);
		await expect(readFile(path, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
	});

	it("does not stop the terminal without an editor", async () => {
		vi.stubEnv("EDITOR", "");
		const stop = vi.fn();
		await expect(openInExternalEditor({ stop } as unknown as TUI, "Full", "text")).rejects.toThrow("Set $EDITOR");
		expect(stop).not.toHaveBeenCalled();
	});
});
