import {
	bgGreen,
	bgRed,
	bgYellow,
	black,
	bold,
	brightCyan,
	brightGreen,
	dim,
	fg,
	StyledText,
	type TextChunk,
	white,
} from "@opentui/core";
import { THEME } from "./constants";

export function mergeChunks(...parts: (StyledText | TextChunk)[]): StyledText {
	const chunks: TextChunk[] = [];
	for (const part of parts) {
		if (part instanceof StyledText) {
			chunks.push(...part.chunks);
		} else {
			chunks.push(part);
		}
	}
	return new StyledText(chunks);
}

export function line(...chunks: TextChunk[]): StyledText {
	return new StyledText([...chunks, dim("\n")]);
}

export function emptyLine(): StyledText {
	return new StyledText([dim("\n")]);
}

export function separator(width = 48): StyledText {
	return line(fg(THEME.border)(`  ${"─".repeat(width)}`));
}

export function buildProgressBar(
	current: number,
	total: number,
	width = 28,
): TextChunk[] {
	const pct = total > 0 ? current / total : 0;
	const filled = Math.round(pct * width);
	const empty = width - filled;

	return [
		dim("  "),
		fg(THEME.border)("["),
		brightGreen("█".repeat(filled)),
		fg(THEME.border)("░".repeat(empty)),
		fg(THEME.border)("] "),
		brightCyan(`${Math.round(pct * 100)}%`),
		dim(` (${current}/${total})`),
	];
}

export function badgeChunk(
	text: string,
	type: "success" | "warning" | "error",
): TextChunk {
	switch (type) {
		case "success":
			return bgGreen(bold(black(` ${text} `)));
		case "warning":
			return bgYellow(bold(black(` ${text} `)));
		case "error":
			return bgRed(bold(white(` ${text} `)));
	}
}

export function formatElapsed(startMs: number): string {
	const elapsed = Math.floor((Date.now() - startMs) / 1000);
	const minutes = Math.floor(elapsed / 60);
	const seconds = elapsed % 60;
	return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}
