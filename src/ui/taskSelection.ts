import {
	BoxRenderable,
	bold,
	brightCyan,
	brightGreen,
	brightWhite,
	createCliRenderer,
	dim,
	fg,
	italic,
	type KeyEvent,
	StyledText,
	type TextChunk,
	TextRenderable,
} from "@opentui/core";
import { ICONS, THEME } from "./constants";
import { badgeChunk, emptyLine, line, mergeChunks, separator } from "./styled";
import type { TaskOption, TaskSelectionResult } from "./types";

function buildTaskSelectionView(
	options: TaskOption[],
	cursorIndex: number,
	selectedOptions: Set<string>,
): StyledText {
	const parts: (StyledText | TextChunk)[] = [];

	parts.push(line(bold(fg(THEME.primary)(`  ${ICONS.rocket} Tasks to Run`))));
	parts.push(separator());
	parts.push(line(dim(italic("  Select the tasks you want to execute."))));
	parts.push(emptyLine());

	for (let index = 0; index < options.length; index++) {
		const option = options[index];
		if (!option) continue;

		const isCursor = index === cursorIndex;
		const isSelected = selectedOptions.has(option.id);

		const chunks: TextChunk[] = [];

		if (isCursor) {
			chunks.push(brightCyan(`  ${ICONS.arrow} `));
		} else {
			chunks.push(dim("    "));
		}

		if (isSelected) {
			chunks.push(brightGreen(`${ICONS.dot} `));
		} else {
			chunks.push(fg(THEME.muted)(`${ICONS.circle} `));
		}

		if (isCursor) {
			chunks.push(bold(brightWhite(option.label)));
		} else if (isSelected) {
			chunks.push(fg(THEME.text)(option.label));
		} else {
			chunks.push(dim(option.label));
		}

		if (option.badge) {
			chunks.push(dim(" "));
			if (option.badge === "ready") {
				chunks.push(badgeChunk(option.badge, "success"));
			} else if (
				option.badge.includes("missing") ||
				option.badge.includes("required")
			) {
				chunks.push(badgeChunk(option.badge, "warning"));
			} else {
				chunks.push(badgeChunk(option.badge, "success"));
			}
		}

		chunks.push(dim("\n"));
		parts.push(new StyledText(chunks));

		if (option.description) {
			parts.push(line(dim(italic(`      ${option.description}`))));
		}
	}

	parts.push(emptyLine());
	parts.push(separator());

	const countChunks: TextChunk[] = [
		dim("  Selected: "),
		brightCyan(selectedOptions.size.toString()),
		dim(`/${options.length}  `),
	];
	for (let i = 0; i < options.length; i++) {
		const opt = options[i];
		if (opt && selectedOptions.has(opt.id)) {
			countChunks.push(brightGreen("●"));
		} else {
			countChunks.push(fg(THEME.border)("○"));
		}
	}
	countChunks.push(dim("\n"));
	parts.push(new StyledText(countChunks));

	parts.push(emptyLine());
	parts.push(
		new StyledText([
			dim("  "),
			fg(THEME.accent)("↑↓"),
			dim(" Navigate  "),
			fg(THEME.accent)("Space"),
			dim(" Toggle  "),
			fg(THEME.accent)("A"),
			dim(" Toggle All  "),
			fg(THEME.accent)("Enter"),
			dim(" Continue  "),
			fg(THEME.accent)("Esc"),
			dim(" Cancel"),
		]),
	);

	return mergeChunks(...parts);
}

export async function selectTasksWithOpenTui(
	options: TaskOption[],
): Promise<TaskSelectionResult> {
	if (options.length === 0) {
		return { confirmed: false, selectedTaskIds: [] };
	}

	const selectedTaskIds = new Set(
		options
			.filter((option) => option.selectedByDefault !== false)
			.map((option) => option.id),
	);
	let cursorIndex = 0;

	const renderer = await createCliRenderer({
		exitOnCtrlC: true,
		useAlternateScreen: true,
	});

	const wrapper = new BoxRenderable(renderer, {
		width: "100%",
		height: "100%",
		padding: 1,
		borderStyle: "rounded",
		borderColor: THEME.primary,
		backgroundColor: THEME.surface,
		title: ` ${ICONS.gear} Dotfiles Setup — Task Selection `,
		titleAlignment: "center",
		flexDirection: "column",
	});

	const content = new TextRenderable(renderer, {
		content: buildTaskSelectionView(options, cursorIndex, selectedTaskIds),
	});

	wrapper.add(content);
	renderer.root.add(wrapper);

	return await new Promise<TaskSelectionResult>((resolve) => {
		let done = false;

		const finish = (result: TaskSelectionResult) => {
			if (done) return;
			done = true;
			renderer.keyInput.off("keypress", onKeyPress);
			if (!renderer.isDestroyed) renderer.destroy();
			resolve(result);
		};

		const update = () => {
			content.content = buildTaskSelectionView(
				options,
				cursorIndex,
				selectedTaskIds,
			);
		};

		const onKeyPress = (key: KeyEvent) => {
			const keyName = key.name.toLowerCase();

			if (keyName === "up" || keyName === "k") {
				cursorIndex = cursorIndex <= 0 ? options.length - 1 : cursorIndex - 1;
				update();
				return;
			}

			if (keyName === "down" || keyName === "j") {
				cursorIndex = cursorIndex >= options.length - 1 ? 0 : cursorIndex + 1;
				update();
				return;
			}

			if (key.sequence === " ") {
				const current = options[cursorIndex];
				if (!current) return;
				if (selectedTaskIds.has(current.id)) {
					selectedTaskIds.delete(current.id);
				} else {
					selectedTaskIds.add(current.id);
				}
				update();
				return;
			}

			if (keyName === "a") {
				if (selectedTaskIds.size === options.length) {
					selectedTaskIds.clear();
				} else {
					for (const option of options) selectedTaskIds.add(option.id);
				}
				update();
				return;
			}

			if (keyName === "return" || keyName === "enter") {
				finish({ confirmed: true, selectedTaskIds: [...selectedTaskIds] });
				return;
			}

			if (keyName === "escape") {
				finish({ confirmed: false, selectedTaskIds: [] });
			}
		};

		renderer.keyInput.on("keypress", onKeyPress);
	});
}
