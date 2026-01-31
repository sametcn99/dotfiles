import type {
	ISystemContext,
	ITask,
	TaskCheckResult,
} from "../core/interfaces";

export class DotfilesTask implements ITask {
	name = "Link Dotfiles";

	async check(_context: ISystemContext): Promise<TaskCheckResult> {
		return {
			upToDate: [],
			toInstall: [],
			warnings: ["Dotfiles linking not fully implemented."],
		};
	}

	async execute(context: ISystemContext): Promise<void> {
		const logger = context.getLogger();
		// Future implementation: Read a config map JSON and link files.
		// For now, mirroring the original script's placeholder behavior.

		logger.log("No specific dotfiles configuration map found.");
		logger.warn(
			"Skipping dotfiles linking (placeholder). Add logic here when you have files to link.",
		);
	}
}
