import type {
	ISystemContext,
	ITask,
	TaskCheckResult,
} from "../core/interfaces";

export class GnomeSettingsTask implements ITask {
	name = "Configure Gnome Settings";

	async check(_context: ISystemContext): Promise<TaskCheckResult> {
		// Simple check for binary availability
		if (!Bun.which("gsettings")) {
			return {
				upToDate: [],
				toInstall: [],
				warnings: ["gsettings not found. Skipping."],
			};
		}
		return { upToDate: [], toInstall: [] };
	}

	async execute(context: ISystemContext): Promise<void> {
		const logger = context.getLogger();

		if (!Bun.which("gsettings")) {
			logger.warn("gsettings not found. Skipping Gnome configuration.");
			return;
		}

		logger.log("Setting Dash-to-Dock click-action to 'minimize'...");
		const result = await context.execStream([
			"gsettings",
			"set",
			"org.gnome.shell.extensions.dash-to-dock",
			"click-action",
			"minimize",
		]);

		if (result) {
			logger.success("Dash-to-Dock configuration applied.");
		} else {
			logger.error(
				"Failed to apply Dash-to-Dock configuration. Schema may be missing.",
			);
		}
	}
}
