import {
	ASCIIFontRenderable,
	BoxRenderable,
	bold,
	brightGreen,
	brightRed,
	createCliRenderer,
	dim,
	green,
	italic,
	type KeyEvent,
	red,
	StyledText,
	type TextChunk,
	TextRenderable,
} from "@opentui/core";
import { ICONS, THEME } from "./constants";
import { emptyLine, line, mergeChunks } from "./styled";
import type { InstallationStepResult } from "./types";

export async function showCompletionSummary(
	results: InstallationStepResult[],
): Promise<void> {
	const completed = results.filter((r) => r.status === "completed");
	const failed = results.filter((r) => r.status === "failed");

	const renderer = await createCliRenderer({
		exitOnCtrlC: true,
		useAlternateScreen: true,
	});

	const borderClr = failed.length > 0 ? THEME.warning : THEME.success;

	const wrapper = new BoxRenderable(renderer, {
		width: "100%",
		height: "100%",
		padding: 1,
		borderStyle: "rounded",
		borderColor: borderClr,
		backgroundColor: THEME.surface,
		flexDirection: "column",
		justifyContent: "center",
		alignItems: "center",
		gap: 1,
	});

	const bannerColors =
		failed.length > 0
			? [THEME.warning, THEME.error]
			: [THEME.success, THEME.primary];

	const banner = new ASCIIFontRenderable(renderer, {
		text: "DONE!",
		font: "slick",
		color: bannerColors,
	});

	const parts: (StyledText | TextChunk)[] = [];

	parts.push(line(dim("─".repeat(44))));
	parts.push(emptyLine());

	if (completed.length > 0) {
		parts.push(
			line(
				bold(green(`  ${ICONS.check} Completed Tasks (${completed.length})`)),
			),
		);
		for (const task of completed) {
			parts.push(line(green(`    ${ICONS.check} ${task.name}`)));
		}
		parts.push(emptyLine());
	}

	if (failed.length > 0) {
		parts.push(
			line(bold(red(`  ${ICONS.cross} Failed Tasks (${failed.length})`))),
		);
		for (const task of failed) {
			parts.push(line(red(`    ${ICONS.cross} ${task.name}`)));
			if (task.error) {
				parts.push(line(dim(italic(`      → ${task.error}`))));
			}
		}
		parts.push(emptyLine());
	}

	parts.push(line(dim("─".repeat(44))));

	const summaryChunks: TextChunk[] = [
		dim("  "),
		brightGreen(`${completed.length} successful`),
	];
	if (failed.length > 0) {
		summaryChunks.push(dim("  •  "));
		summaryChunks.push(brightRed(`${failed.length} failed`));
	}
	summaryChunks.push(dim(`  •  ${results.length} total`));
	parts.push(new StyledText([...summaryChunks, dim("\n")]));

	parts.push(emptyLine());
	parts.push(line(dim(italic("  Press any key to exit..."))));

	const summaryContent = new TextRenderable(renderer, {
		content: mergeChunks(...parts),
	});

	wrapper.add(banner);
	wrapper.add(summaryContent);
	renderer.root.add(wrapper);

	return await new Promise<void>((resolve) => {
		let done = false;

		const finish = () => {
			if (done) return;
			done = true;
			renderer.keyInput.off("keypress", onKey);
			clearTimeout(timer);
			if (!renderer.isDestroyed) renderer.destroy();
			resolve();
		};

		const onKey = (_key: KeyEvent) => finish();
		renderer.keyInput.on("keypress", onKey);

		const timer = setTimeout(finish, 8000);
	});
}
