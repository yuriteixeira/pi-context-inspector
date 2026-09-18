/**
 * pi-context-inspector
 *
 * Single command for inspecting the full LLM context in a tabbed overlay:
 *
 *   /context  — opens a tabbed overlay with:
 *                       [Stats]  token distribution grid + category breakdown
 *                       [System] full system prompt (scrollable)
 *                       [Tools]  active tool definitions (scrollable)
 *                       [Messages] all session messages (scrollable)
 *                       [Full]   complete context dump (scrollable)
 *
 * Tab / Shift+Tab navigates between views.
 * Each content tab supports: line numbers, scroll, live search (/), clipboard copy (y).
 */

import {
	buildSessionContext,
	type ContextUsage,
	DEFAULT_COMPACTION_SETTINGS,
	estimateTokens,
	type ExtensionAPI,
	type ExtensionCommandContext,
	type SessionContext,
	type SessionEntry,
	type Theme,
	type ToolInfo,
} from "@earendil-works/pi-coding-agent";
import { ScrollableTabContent } from "./scrollable-tab-content.js";
import { type ContextTokenBreakdown, StatsTabContent } from "./stats-tab-content.js";
import { TabbedOverlay } from "./tabbed-overlay.js";
import { formatTokens } from "./utils.js";

type AgentMessage = SessionContext["messages"][number];
type AssistantMessage = Extract<AgentMessage, { role: "assistant" }>;
type ToolCallBlock = Extract<AssistantMessage["content"][number], { type: "toolCall" }>;
type MessageContent = Extract<AgentMessage, { content: unknown }>["content"];
type ToolDefView = Pick<ToolInfo, "name"> & { description?: string; parameters?: unknown };
// ── Helpers ────────────────────────────────────────────────────────────────────

/** Build display lines with line numbers from raw text. */
export function buildNumberedLines(text: string, theme: Theme): string[] {
	const rawLines = text.split("\n");
	const numWidth = String(rawLines.length).length;
	return rawLines.map((line, i) => {
		const num = String(i + 1).padStart(numWidth, " ");
		return `${theme.fg("dim", num)} ${theme.fg("dim", "│")} ${line}`;
	});
}

function numberedTab(text: string, name: string, theme: Theme): ScrollableTabContent {
	return new ScrollableTabContent(
		{ rawText: text, displayLines: buildNumberedLines(text, theme), theme },
		name,
	);
}

function formatContent(content: MessageContent): string[] {
	if (typeof content === "string") return [content];

	const lines: string[] = [];
	for (const block of content) {
		switch (block.type) {
			case "text":
				lines.push(block.text);
				break;
			case "thinking":
				lines.push(`[Thinking: ${block.thinking}]`);
				break;
			case "toolCall":
				lines.push(`[Tool Call: ${block.name}(${JSON.stringify(block.arguments ?? {})})]`);
				break;
			case "image":
				lines.push(`[Image: ${block.mimeType ?? "unknown"}]`);
				break;
			default:
				lines.push(`[${(block as { type?: string }).type ?? "unknown"}]`);
		}
	}
	return lines;
}

function formatUsage(usage: AssistantMessage["usage"]): string {
	const parts: string[] = [];
	parts.push(`input: ${usage.input}`);
	parts.push(`output: ${usage.output}`);
	parts.push(`cache-read: ${usage.cacheRead}`);
	parts.push(`cache-write: ${usage.cacheWrite}`);
	parts.push(`total: ${usage.totalTokens}`);
	return `Tokens: ${parts.join(", ")}`;
}
export function formatMessageForDisplay(message: SessionContext["messages"][number], index: number): string[] {
	const lines: string[] = ["", `──── Message ${index + 1} ────`, `Role: ${message.role}`];

	if (message.role === "assistant") {
		lines.push(`Model: ${[message.provider, message.model].filter(Boolean).join("/")}`);
		lines.push(formatUsage(message.usage));
		lines.push(`Stop: ${message.stopReason}`);
		if (message.errorMessage) lines.push(`Error: ${message.errorMessage}`);
	}

	if (message.role === "toolResult") {
		lines.push(`Tool: ${message.toolName ?? "unknown"}`);
		lines.push(`Tool Call ID: ${message.toolCallId ?? "unknown"}`);
		lines.push(`Error: ${message.isError ? "yes" : "no"}`);
	}

	if (message.role === "bashExecution") {
		lines.push(`Command: ${message.command}`);
		lines.push(...(message.output ? message.output.split("\n") : ["(no output)"]));
		const status: string[] = [];
		if (message.cancelled) status.push("cancelled");
		if (message.truncated) status.push("truncated");
		lines.push(
			`Exit: ${message.exitCode == null ? "unknown" : message.exitCode}${status.length > 0 ? ` (${status.join(", ")})` : ""}`,
		);
		if (message.truncated && message.fullOutputPath) {
			lines.push(`Full output: ${message.fullOutputPath}`);
		}
		return lines;
	}

	if (message.role === "branchSummary") {
		lines.push(`Branch from: ${message.fromId}`);
		lines.push(message.summary);
		return lines;
	}

	if (message.role === "compactionSummary") {
		lines.push(`Tokens before: ${message.tokensBefore}`);
		lines.push(message.summary);
		return lines;
	}

	if (message.role === "custom") {
		lines.push(`Custom type: ${message.customType}`);
	}

	if ("content" in message) {
		lines.push(...formatContent(message.content));
	}
	return lines;
}

export function formatMessagesText(context: SessionContext): string {
	const lines: string[] = [];
	if (context.messages.length > 0) {
		for (let i = 0; i < context.messages.length; i++) {
			lines.push(...formatMessageForDisplay(context.messages[i]!, i));
		}
	} else {
		lines.push("(no messages yet)");
	}
	return lines.join("\n");
}

interface ContextViewerModelInfo {
	provider: string;
	id: string;
	contextWindow?: number;
}

export function buildTotalContextText(
	systemPrompt: string,
	context: SessionContext,
	usage: ContextUsage | undefined,
	model: ContextViewerModelInfo | undefined,
): string {
	const sections: string[] = [];

	sections.push("═══════════════════════════════════════════════════════");
	sections.push("SYSTEM PROMPT");
	sections.push("═══════════════════════════════════════════════════════");
	sections.push(systemPrompt);
	sections.push("");

	sections.push("═══════════════════════════════════════════════════════");
	sections.push("MESSAGES");
	sections.push("═══════════════════════════════════════════════════════");

	sections.push(formatMessagesText(context));

	sections.push("");
	sections.push("═══════════════════════════════════════════════════════");
	sections.push("CONTEXT USAGE");
	sections.push("═══════════════════════════════════════════════════════");
	if (usage) {
		sections.push(`Tokens: ${usage.tokens?.toLocaleString() ?? "unknown"}`);
		if (model) {
			sections.push(`Model: ${model.provider}/${model.id}`);
			const contextWindow = model.contextWindow ?? usage.contextWindow;
			if (contextWindow) {
				const pct = usage.percent ?? (usage.tokens == null ? null : (usage.tokens / contextWindow) * 100);
				sections.push(
					`Usage: ${usage.tokens?.toLocaleString() ?? "unknown"} / ${contextWindow.toLocaleString()} (${pct == null ? "unknown" : `${pct.toFixed(1)}%`})`,
				);
			}
		}
	} else {
		sections.push("(no usage data available)");
	}

	return sections.join("\n");
}

/** Format active tool definitions as readable text for the Tools tab. */
export function buildToolsText(activeToolDefs: ToolDefView[]): string {
	if (activeToolDefs.length === 0) return "(no active tools)";

	const sections: string[] = [];
	for (const tool of activeToolDefs) {
		sections.push(`${"─".repeat(56)}`);
		sections.push(`Tool: ${tool.name}`);
		if (tool.description) {
			sections.push(`Description: ${tool.description}`);
		}
		if (tool.parameters) {
			sections.push("Parameters:");
			const params = tool.parameters as { properties?: Record<string, { type?: string; description?: string }>; required?: string[] };
			if (params?.properties) {
				for (const [key, val] of Object.entries(params.properties)) {
					const required = params.required?.includes(key) ? "" : " (optional)";
					const type = val.type ?? "unknown";
					const desc = val.description ? `: ${val.description}` : "";
					sections.push(`  ${key} (${type}${required})${desc}`);
				}
			} else {
				sections.push(`  ${JSON.stringify(tool.parameters, null, 2).split("\n").join("\n  ")}`);
			}
		}
		sections.push("");
	}

	return sections.join("\n");
}

/** Build the token breakdown, scaling raw char-based estimates to match actual token count. */
function isSkillPath(path: unknown): boolean {
	if (typeof path !== "string") return false;
	return /(^|\/)\.agents\/skills\/|(^|\/)\.pi\/agent\/.*\/skills\/|(^|\/)skills\/[^/]+\/SKILL\.md$/i.test(path);
}

function isSkillReadToolCall(block: ToolCallBlock): boolean {
	if (block.name !== "read") return false;
	return isSkillPath(block.arguments?.path);
}

const ESTIMATED_IMAGE_CHARS = 4800;

export function buildTokenBreakdown(
	systemPrompt: string,
	activeToolDefs: ToolInfo[],
	branch: SessionEntry[],
	usage: ContextUsage | undefined,
): ContextTokenBreakdown | null {
	if (usage == null || usage.tokens == null || !usage.contextWindow) return null;

	const estimateChars = (text: string) => Math.ceil(text.length / 4);
	const reserveTokens = Math.min(DEFAULT_COMPACTION_SETTINGS.reserveTokens, usage.contextWindow);

	const systemRaw = estimateChars(systemPrompt);
	const toolDefsRaw = estimateChars(JSON.stringify(activeToolDefs));

	let msgTokensRaw = 0;
	let toolsRaw = 0;
	let skillsRaw = 0;
	const skillToolCallIds = new Set<string>();

	for (const entry of branch) {
		if (entry.type === "message") {
			const message = entry.message;
			const messageTotal = estimateTokens(message);
			const weights = { messages: 0, tools: 0, skills: 0 };

			if (message.role === "user" || message.role === "custom") {
				if (typeof message.content === "string") {
					weights.messages += estimateChars(message.content);
				} else {
					for (const block of message.content) {
						if (block.type === "text") weights.messages += estimateChars(block.text);
						else if (block.type === "image") weights.messages += ESTIMATED_IMAGE_CHARS;
					}
				}
			} else if (message.role === "assistant") {
				for (const block of message.content) {
					if (block.type === "text") weights.messages += estimateChars(block.text);
					else if (block.type === "thinking") weights.messages += estimateChars(block.thinking);
					else if (block.type === "toolCall") {
						if (isSkillReadToolCall(block)) {
							weights.skills += estimateChars(JSON.stringify(block));
							skillToolCallIds.add(block.id);
						} else {
							weights.tools += estimateChars(JSON.stringify(block));
						}
					}
				}
			} else if (message.role === "toolResult") {
				const isSkillResult = skillToolCallIds.has(message.toolCallId);
				for (const block of message.content) {
					if (block.type === "text") {
						if (isSkillResult) weights.skills += estimateChars(block.text);
						else weights.tools += estimateChars(block.text);
					}
				}
			} else if (message.role === "bashExecution") {
				weights.tools += estimateChars(message.command) + estimateChars(message.output);
			}

			const weightSum = weights.messages + weights.tools + weights.skills;
			if (weightSum > 0) {
				const scale = messageTotal / weightSum;
				msgTokensRaw += weights.messages * scale;
				toolsRaw += weights.tools * scale;
				skillsRaw += weights.skills * scale;
			}
		} else if (entry.type === "branch_summary" || entry.type === "compaction") {
			msgTokensRaw += estimateChars(entry.summary);
		}
	}

	const totalRaw = systemRaw + skillsRaw + toolDefsRaw + msgTokensRaw + toolsRaw;
	const ratio = totalRaw > 0 ? usage.tokens / totalRaw : 1;

	const exact = {
		systemPrompt: systemRaw * ratio,
		systemTools: toolDefsRaw * ratio,
		tools: toolsRaw * ratio,
		skills: skillsRaw * ratio,
		messages: msgTokensRaw * ratio,
	};
	const allocated = { systemPrompt: 0, systemTools: 0, tools: 0, skills: 0, messages: 0 };
	let remainder = usage.tokens;
	const keys = Object.keys(exact) as (keyof typeof exact)[];
	for (const key of keys) {
		const value = Math.floor(exact[key]);
		allocated[key] = value;
		remainder -= value;
	}
	if (totalRaw > 0) {
		const byFraction = [...keys].sort((a, b) => exact[b] % 1 - exact[a] % 1);
		for (const key of byFraction) {
			if (remainder <= 0) break;
			allocated[key] += 1;
			remainder -= 1;
		}
	}

	return {
		total: usage.tokens,
		contextWindow: usage.contextWindow,
		percent: usage.percent ?? (usage.tokens / usage.contextWindow) * 100,
		reserveTokens,
		safeAvailable: Math.max(0, usage.contextWindow - reserveTokens - usage.tokens),
		systemPrompt: allocated.systemPrompt,
		systemTools: allocated.systemTools,
		tools: allocated.tools,
		skills: allocated.skills,
		messages: allocated.messages,
		other: Math.max(0, usage.tokens - (allocated.systemPrompt + allocated.systemTools + allocated.tools + allocated.skills + allocated.messages)),
	};
}

/** Overlay options shared across all tabs. */
const OVERLAY_OPTIONS = {
	overlay: true,
	overlayOptions: {
		anchor: "center" as const,
		width: "90%" as const,
		minWidth: 60,
		maxHeight: "90%" as const,
	},
};

// ── Extension ──────────────────────────────────────────────────────────────────

export default function contextViewerExtension(pi: ExtensionAPI): void {
	pi.registerCommand("context", {
		description: "Inspect context usage, system prompt, tools, messages, and full LLM context in a tabbed overlay",
		handler: async (_args: string, ctx: ExtensionCommandContext) => {
			if (!ctx.hasUI) return;

			// ── Gather data ─────────────────────────────────────────────────────
			const systemPrompt = ctx.getSystemPrompt() ?? "";
			const usage = ctx.getContextUsage();

			const allTools = pi.getAllTools();
			const activeToolNames = pi.getActiveTools();
			const activeToolDefs = allTools.filter((t) => activeToolNames.includes(t.name));

			const branch = ctx.sessionManager.getBranch();
			const context = buildSessionContext(ctx.sessionManager.getEntries(), ctx.sessionManager.getLeafId());

			const breakdown = buildTokenBreakdown(systemPrompt, activeToolDefs, branch, usage);
			const toolsText = buildToolsText(activeToolDefs);
			const fullText = buildTotalContextText(systemPrompt, context, usage, ctx.model);
			const messagesText = formatMessagesText(context);

			// ── Subtitle ────────────────────────────────────────────────────────
			const subtitle =
				usage?.tokens != null && usage.contextWindow != null
					? `${formatTokens(usage.tokens)} / ${formatTokens(usage.contextWindow)} (${(usage.percent ?? (usage.tokens / usage.contextWindow) * 100).toFixed(1)}%)`
					: "no usage data yet";

			// ── Build and open the overlay ──────────────────────────────────────
			await ctx.ui.custom<void>((_tui, theme, _keybindings, done) => {
				const modelName = ctx.model?.id ?? "unknown model";

				const tabs = [
					new StatsTabContent(breakdown, theme, {
						name: modelName,
						contextWindow: ctx.model?.contextWindow ?? usage?.contextWindow,
					}),
					numberedTab(systemPrompt, "System", theme),
					numberedTab(toolsText, "Tools", theme),
					numberedTab(messagesText, "Messages", theme),
					numberedTab(fullText, "Full", theme),
				];

				return new TabbedOverlay({
					title: "Context Viewer",
					subtitle,
					tabs,
					theme,
					done,
				});
			}, OVERLAY_OPTIONS);
		},
	});
}
