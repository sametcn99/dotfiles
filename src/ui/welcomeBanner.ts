import {
	ASCIIFontRenderable,
	BoxRenderable,
	bold,
	createCliRenderer,
	dim,
	fg,
	italic,
	type KeyEvent,
	TextRenderable,
} from "@opentui/core";
import { ICONS, THEME } from "./constants";
import { emptyLine, line, mergeChunks } from "./styled";

export async function showWelcomeBanner(): Promise<void> {
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
		flexDirection: "column",
		justifyContent: "center",
		alignItems: "center",
		gap: 1,
	});

	const banner = new ASCIIFontRenderable(renderer, {
		text: "DOTFILES",
		font: "slick",
		color: [THEME.primary, THEME.secondary, THEME.error],
	});

	const subtitle = new TextRenderable(renderer, {
		content: mergeChunks(
			line(dim("─".repeat(44))),
			line(
				fg(THEME.text)("        "),
				bold(fg(THEME.primary)(`${ICONS.gear} Setup Wizard`)),
				fg(THEME.text)("  •  "),
				dim("Interactive System Configurator"),
			),
			line(dim("─".repeat(44))),
			emptyLine(),
			line(dim(italic("  Press any key to continue..."))),
		),
	});

	wrapper.add(banner);
	wrapper.add(subtitle);
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

		const timer = setTimeout(finish, 3500);
	});
}
