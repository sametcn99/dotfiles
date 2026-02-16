import {
	BoxRenderable,
	bold,
	brightCyan,
	brightGreen,
	brightRed,
	createCliRenderer,
	dim,
	fg,
	green,
	red,
	StyledText,
	type TextChunk,
	TextRenderable,
} from "@opentui/core";
import { ICONS, SPINNER_FRAMES, THEME } from "./constants";
import {
	buildProgressBar,
	emptyLine,
	formatElapsed,
	line,
	mergeChunks,
	separator,
} from "./styled";
import type { InstallationStep, InstallationStepResult } from "./types";

function buildInstallView(
	steps: InstallationStep[],
	states: Array<"pending" | "running" | "completed" | "failed">,
	spinnerFrame: string,
	startTime: number,
): StyledText {
	const parts: (StyledText | TextChunk)[] = [];

	parts.push(
		line(
			bold(fg(THEME.primary)(`  ${ICONS.sparkle} Installation in Progress`)),
		),
	);
	parts.push(separator());
	parts.push(emptyLine());

	const completedCount = states.filter((s) => s === "completed").length;
	const failedCount = states.filter((s) => s === "failed").length;

	for (let index = 0; index < steps.length; index++) {
		const step = steps[index];
		const state = states[index];

		const chunks: TextChunk[] = [dim("  ")];

		switch (state) {
			case "running":
				chunks.push(brightCyan(spinnerFrame));
				chunks.push(brightCyan(` ${step?.name ?? ""}`));
				chunks.push(dim(" ..."));
				break;
			case "completed":
				chunks.push(brightGreen(ICONS.check));
				chunks.push(green(` ${step?.name ?? ""}`));
				break;
			case "failed":
				chunks.push(brightRed(ICONS.cross));
				chunks.push(red(` ${step?.name ?? ""}`));
				break;
			default:
				chunks.push(fg(THEME.muted)(ICONS.circle));
				chunks.push(dim(` ${step?.name ?? ""}`));
				break;
		}

		parts.push(new StyledText([...chunks, dim("\n")]));
	}

	parts.push(emptyLine());
	parts.push(separator());

	const doneCount = completedCount + failedCount;
	parts.push(
		new StyledText([...buildProgressBar(doneCount, steps.length), dim("\n")]),
	);

	parts.push(
		line(dim("  ⏱  Elapsed: "), fg(THEME.accent)(formatElapsed(startTime))),
	);

	if (failedCount > 0) {
		parts.push(
			line(
				dim("  "),
				brightGreen(`${ICONS.check} ${completedCount}`),
				dim("  "),
				brightRed(`${ICONS.cross} ${failedCount}`),
				dim(`  / ${steps.length} total`),
			),
		);
	}

	return mergeChunks(...parts);
}

export async function runAnimatedInstallation(
	steps: InstallationStep[],
): Promise<InstallationStepResult[]> {
	if (steps.length === 0) return [];

	const renderer = await createCliRenderer({
		exitOnCtrlC: true,
		useAlternateScreen: true,
	});

	const wrapper = new BoxRenderable(renderer, {
		width: "100%",
		height: "100%",
		padding: 1,
		borderStyle: "rounded",
		borderColor: THEME.accent,
		backgroundColor: THEME.surface,
		title: ` ${ICONS.sparkle} Dotfiles Setup — Installation `,
		titleAlignment: "center",
		flexDirection: "column",
	});

	const states: Array<"pending" | "running" | "completed" | "failed"> =
		steps.map(() => "pending");

	let spinnerIndex = 0;
	const startTime = Date.now();

	const content = new TextRenderable(renderer, {
		content: buildInstallView(
			steps,
			states,
			SPINNER_FRAMES[spinnerIndex] ?? "⣾",
			startTime,
		),
	});

	wrapper.add(content);
	renderer.root.add(wrapper);
	renderer.requestLive();

	const interval = setInterval(() => {
		spinnerIndex = (spinnerIndex + 1) % SPINNER_FRAMES.length;
		content.content = buildInstallView(
			steps,
			states,
			SPINNER_FRAMES[spinnerIndex] ?? "⣾",
			startTime,
		);
	}, 80);

	const results: InstallationStepResult[] = [];

	try {
		for (let index = 0; index < steps.length; index++) {
			states[index] = "running";
			content.content = buildInstallView(
				steps,
				states,
				SPINNER_FRAMES[spinnerIndex] ?? "⣾",
				startTime,
			);

			try {
				await steps[index]?.run();
				states[index] = "completed";
				results.push({ name: steps[index]?.name ?? "", status: "completed" });
			} catch (error) {
				states[index] = "failed";
				results.push({
					name: steps[index]?.name ?? "",
					status: "failed",
					error: error instanceof Error ? error.message : String(error),
				});
			}

			content.content = buildInstallView(
				steps,
				states,
				SPINNER_FRAMES[spinnerIndex] ?? "⣾",
				startTime,
			);
			await Bun.sleep(200);
		}

		await Bun.sleep(500);
	} finally {
		clearInterval(interval);
		renderer.dropLive();
		if (!renderer.isDestroyed) renderer.destroy();
	}

	return results;
}
