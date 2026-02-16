import {
	BoxRenderable,
	bold,
	brightCyan,
	brightGreen,
	brightWhite,
	createCliRenderer,
	dim,
	fg,
	type KeyEvent,
	StyledText,
	type TextChunk,
	TextRenderable,
	yellow,
} from "@opentui/core";
import { ICONS, THEME } from "./constants";
import {
	buildProgressBar,
	emptyLine,
	line,
	mergeChunks,
	separator,
} from "./styled";
import type { SelectionCategory, SelectionResult } from "./types";

interface FlattenedItem {
	id: string;
	categoryKey: string;
	categoryTitle: string;
	value: string;
}

function buildSelectionView(
	categories: SelectionCategory[],
	items: FlattenedItem[],
	cursorIndex: number,
	selectedItems: Set<string>,
	warnings: string[] = [],
): StyledText {
	const parts: (StyledText | TextChunk)[] = [];

	parts.push(
		line(bold(fg(THEME.primary)(`  ${ICONS.pkg} Packages to Install`))),
	);
	parts.push(separator());
	parts.push(emptyLine());

	if (warnings.length > 0) {
		parts.push(line(bold(yellow(`  ${ICONS.warning} Warnings`))));
		for (const warning of warnings) {
			parts.push(line(fg(THEME.warning)(`    • ${warning}`)));
		}
		parts.push(emptyLine());
	}

	for (const category of categories) {
		parts.push(line(bold(fg(THEME.secondary)(`  ▸ ${category.title}`))));

		const categoryItems = items.filter(
			(item) => item.categoryKey === category.key,
		);

		for (const item of categoryItems) {
			const isCursor = items[cursorIndex]?.id === item.id;
			const isSelected = selectedItems.has(item.id);

			const chunks: TextChunk[] = [];

			if (isCursor) {
				chunks.push(brightCyan(`    ${ICONS.arrow} `));
			} else {
				chunks.push(dim("      "));
			}

			if (isSelected) {
				chunks.push(brightGreen(`${ICONS.dot} `));
			} else {
				chunks.push(fg(THEME.muted)(`${ICONS.circle} `));
			}

			if (isCursor) {
				chunks.push(bold(brightWhite(item.value)));
			} else if (isSelected) {
				chunks.push(fg(THEME.text)(item.value));
			} else {
				chunks.push(dim(item.value));
			}

			parts.push(new StyledText([...chunks, dim("\n")]));
		}

		parts.push(emptyLine());
	}

	parts.push(separator());

	const selectedCount = selectedItems.size;
	parts.push(
		new StyledText([
			...buildProgressBar(selectedCount, items.length),
			dim("\n"),
		]),
	);

	parts.push(emptyLine());
	parts.push(
		new StyledText([
			dim("  "),
			fg(THEME.accent)("↑↓"),
			dim(" Navigate  "),
			fg(THEME.accent)("Space"),
			dim(" Toggle  "),
			fg(THEME.accent)("A"),
			dim(" Toggle All"),
			dim("\n  "),
			fg(THEME.accent)("Enter"),
			dim(" Start Install  "),
			fg(THEME.accent)("Esc"),
			dim(" Cancel"),
		]),
	);

	return mergeChunks(...parts);
}

function toSelectionMap(
	selectedItems: Set<string>,
	flatItems: FlattenedItem[],
): Record<string, string[]> {
	const map: Record<string, string[]> = {};
	for (const item of flatItems) {
		if (!selectedItems.has(item.id)) continue;
		if (!map[item.categoryKey]) map[item.categoryKey] = [];
		map[item.categoryKey]?.push(item.value);
	}
	return map;
}

export async function selectPackagesWithOpenTui(
	categories: SelectionCategory[],
	warnings: string[] = [],
): Promise<SelectionResult> {
	const normalized = categories.filter((category) => category.items.length > 0);

	if (normalized.length === 0) {
		return { confirmed: false, selectedByCategory: {} };
	}

	const flatItems: FlattenedItem[] = normalized.flatMap((category) =>
		category.items.map((item) => ({
			id: `${category.key}::${item}`,
			categoryKey: category.key,
			categoryTitle: category.title,
			value: item,
		})),
	);

	const selectedItems = new Set(flatItems.map((item) => item.id));
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
		borderColor: THEME.secondary,
		backgroundColor: THEME.surface,
		title: ` ${ICONS.pkg} Dotfiles Setup — Package Selection `,
		titleAlignment: "center",
		flexDirection: "column",
	});

	const content = new TextRenderable(renderer, {
		content: buildSelectionView(
			normalized,
			flatItems,
			cursorIndex,
			selectedItems,
			warnings,
		),
	});

	wrapper.add(content);
	renderer.root.add(wrapper);

	return await new Promise<SelectionResult>((resolve) => {
		let done = false;

		const finish = (result: SelectionResult) => {
			if (done) return;
			done = true;
			renderer.keyInput.off("keypress", onKeyPress);
			if (!renderer.isDestroyed) renderer.destroy();
			resolve(result);
		};

		const update = () => {
			content.content = buildSelectionView(
				normalized,
				flatItems,
				cursorIndex,
				selectedItems,
				warnings,
			);
		};

		const onKeyPress = (key: KeyEvent) => {
			const keyName = key.name.toLowerCase();

			if (keyName === "up" || keyName === "k") {
				cursorIndex = cursorIndex <= 0 ? flatItems.length - 1 : cursorIndex - 1;
				update();
				return;
			}

			if (keyName === "down" || keyName === "j") {
				cursorIndex = cursorIndex >= flatItems.length - 1 ? 0 : cursorIndex + 1;
				update();
				return;
			}

			if (key.sequence === " ") {
				const current = flatItems[cursorIndex];
				if (!current) return;
				if (selectedItems.has(current.id)) {
					selectedItems.delete(current.id);
				} else {
					selectedItems.add(current.id);
				}
				update();
				return;
			}

			if (keyName === "a") {
				if (selectedItems.size === flatItems.length) {
					selectedItems.clear();
				} else {
					for (const item of flatItems) selectedItems.add(item.id);
				}
				update();
				return;
			}

			if (keyName === "return" || keyName === "enter") {
				finish({
					confirmed: true,
					selectedByCategory: toSelectionMap(selectedItems, flatItems),
				});
				return;
			}

			if (keyName === "escape") {
				finish({ confirmed: false, selectedByCategory: {} });
			}
		};

		renderer.keyInput.on("keypress", onKeyPress);
	});
}
