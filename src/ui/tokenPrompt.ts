import {
	BoxRenderable,
	bold,
	brightWhite,
	createCliRenderer,
	dim,
	fg,
	type KeyEvent,
	StyledText,
	TextRenderable,
} from "@opentui/core";
import { ICONS, THEME } from "./constants";
import { emptyLine, line, mergeChunks, separator } from "./styled";
import type { TokenPromptResult } from "./types";

function buildTokenPromptView(token: string): StyledText {
	const maskedValue = token.length > 0 ? "•".repeat(token.length) : "";

	return mergeChunks(
		line(bold(fg(THEME.primary)(`  ${ICONS.gear} GitHub Token Input`))),
		separator(),
		emptyLine(),
		line(dim("  Paste your GitHub token below and press Enter.")),
		line(dim("  The token will be used only for this session.")),
		emptyLine(),
		line(dim("  Token:")),
		line(bold(brightWhite(`  ${maskedValue || "_"}`))),
		emptyLine(),
		line(dim("  Tip: personal access token with repo read access is enough.")),
		emptyLine(),
		new StyledText([
			dim("  "),
			fg(THEME.accent)("Enter"),
			dim(" Confirm  "),
			fg(THEME.accent)("Esc"),
			dim(" Cancel  "),
			fg(THEME.accent)("Backspace"),
			dim(" Delete"),
		]),
	);
}

export async function promptGitHubTokenWithOpenTui(): Promise<TokenPromptResult> {
	const renderer = await createCliRenderer({
		exitOnCtrlC: true,
		useAlternateScreen: true,
	});

	let token = "";

	const wrapper = new BoxRenderable(renderer, {
		width: "100%",
		height: "100%",
		padding: 1,
		borderStyle: "rounded",
		borderColor: THEME.primary,
		backgroundColor: THEME.surface,
		title: ` ${ICONS.gear} Dotfiles Setup — GitHub Authentication `,
		titleAlignment: "center",
		flexDirection: "column",
	});

	const content = new TextRenderable(renderer, {
		content: buildTokenPromptView(token),
	});

	wrapper.add(content);
	renderer.root.add(wrapper);

	return await new Promise<TokenPromptResult>((resolve) => {
		let done = false;

		const finish = (result: TokenPromptResult) => {
			if (done) return;
			done = true;
			renderer.keyInput.off("keypress", onKeyPress);
			if (!renderer.isDestroyed) {
				renderer.destroy();
			}
			resolve(result);
		};

		const refresh = () => {
			content.content = buildTokenPromptView(token);
		};

		const onKeyPress = (key: KeyEvent) => {
			const keyName = key.name.toLowerCase();

			if (keyName === "return" || keyName === "enter") {
				const trimmed = token.trim();
				if (trimmed.length === 0) {
					return;
				}
				finish({ confirmed: true, token: trimmed });
				return;
			}

			if (keyName === "escape") {
				finish({ confirmed: false, token: "" });
				return;
			}

			if (keyName === "backspace") {
				if (token.length > 0) {
					token = token.slice(0, -1);
					refresh();
				}
				return;
			}

			if (key.sequence && key.sequence.length > 0) {
				const sanitized = key.sequence.replace(/[\r\n]/g, "");
				if (
					sanitized.length > 0 &&
					!sanitized.startsWith("\u001b") &&
					!/\p{C}/u.test(sanitized)
				) {
					token += sanitized;
					refresh();
				}
			}
		};

		renderer.keyInput.on("keypress", onKeyPress);
	});
}
