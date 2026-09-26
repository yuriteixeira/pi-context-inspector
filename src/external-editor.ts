import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TUI } from "@earendil-works/pi-tui";

/** Show a snapshot in an external editor. Changes to the file do not change the session. */
export async function openInExternalEditor(tui: TUI, name: string, text: string): Promise<void> {
	const command = process.env.EDITOR?.trim();
	if (!command) throw new Error("Set $EDITOR to open a context view in an editor.");

	const directory = await mkdtemp(join(tmpdir(), "pi-context-"));
	const filePath = join(directory, `${name.toLowerCase()}.txt`);
	try {
		await writeFile(filePath, text, { encoding: "utf8", mode: 0o600 });
		const [editor, ...args] = command.split(/\s+/);
		tui.stop();
		try {
			const exitCode = await new Promise<number>((resolve, reject) => {
				const child = spawn(editor!, [...args, filePath], { stdio: "inherit", shell: process.platform === "win32" });
				child.once("error", reject);
				child.once("close", (code) => resolve(code ?? 1));
			});
			if (exitCode !== 0) throw new Error(`Editor exited with code ${exitCode}.`);
		} finally {
			tui.start();
			tui.requestRender(true);
		}
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
}
