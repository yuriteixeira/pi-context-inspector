import type { SessionContext } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { buildTotalContextText, formatMessagesText } from "./index.js";

const red = "\x1b[31m";
const trueColor = "\x1b[38;2;255;0;0m";
const reset = "\x1b[0m";
const context = {
	messages: [
		{ role: "user", content: `${red}user${reset}` },
		{
			role: "toolResult",
			toolName: "bash",
			toolCallId: "1",
			isError: false,
			content: [
				{ type: "text", text: `${red}error${reset}\n${trueColor}detail${reset}` },
				{ type: "image", mimeType: "image/png" },
			],
		},
	],
} as SessionContext;

describe("editor tool result colors", () => {
	it("removes color codes only from tool results in the editor message view", () => {
		const overlay = formatMessagesText(context);
		const editor = formatMessagesText(context, true);
		expect(overlay).toContain(`${red}error${reset}`);
		expect(overlay).toContain(`${trueColor}detail${reset}`);
		expect(editor).toContain("error\ndetail");
		expect(editor).not.toContain(`${red}error`);
		expect(editor).toContain(`${red}user${reset}`);
		expect(editor).toContain("[Image: image/png]");
	});

	it("removes tool result colors in the editor full view without changing the system prompt", () => {
		const full = buildTotalContextText(`${red}system${reset}`, context, undefined, undefined, true);
		expect(full).toContain(`${red}system${reset}`);
		expect(full).toContain("error\ndetail");
		expect(full).not.toContain(`${trueColor}detail`);
	});
});
