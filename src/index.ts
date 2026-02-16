import type { ILogger, ISystemContext, ITask } from "./core/interfaces";
import { SystemContext } from "./core/SystemContext";
import { DotfilesTask } from "./tasks/DotfilesTask";
import { GitHubReposCloneTask } from "./tasks/GitHubReposCloneTask";
import { GnomeSettingsTask } from "./tasks/GnomeSettingsTask";
import { SnapPackagesTask } from "./tasks/SnapPackagesTask";
import { SystemPackagesTask } from "./tasks/SystemPackagesTask";
import {
	type InstallationStep,
	promptGitHubTokenWithOpenTui,
	runAnimatedInstallation,
	type SelectionCategory,
	selectPackagesWithOpenTui,
	selectTasksWithOpenTui,
	showCompletionSummary,
	showWelcomeBanner,
	type TaskOption,
} from "./ui/index.ts";

class SilentLogger implements ILogger {
	log(_message: string): void {}
	success(_message: string): void {}
	warn(_message: string): void {}
	error(_message: string): void {}
}

async function main() {
	// 0. Welcome Banner
	await showWelcomeBanner();

	// 1. Initialize Context
	const rootDir = Bun.env.PWD || "."; // Using Env for PWD
	const context = new SystemContext(rootDir);
	const logger = context.getLogger();

	try {
		await context.initialize();
	} catch {
		logger.error(
			`Initialization failed. Ensure you have sufficient privileges.`,
		);
		process.exit(1);
	}

	logger.success("Context initialized successfully.");

	// 2. Define Tasks (UI selectable)
	const githubReposTask = new GitHubReposCloneTask();
	const taskEntries: { id: string; task: ITask; option: TaskOption }[] = [
		{
			id: "system-packages",
			task: new SystemPackagesTask(),
			option: {
				id: "system-packages",
				label: "Install System Packages",
				description: "Installs system packages listed in apps.list.",
				selectedByDefault: true,
			},
		},
		{
			id: "dotfiles",
			task: new DotfilesTask(),
			option: {
				id: "dotfiles",
				label: "Link Dotfiles",
				description: "Runs dotfile linking steps.",
				selectedByDefault: true,
			},
		},
		{
			id: "snap-packages",
			task: new SnapPackagesTask(),
			option: {
				id: "snap-packages",
				label: "Install Snap Applications",
				description: "Installs applications listed in snap-apps.list.",
				selectedByDefault: true,
			},
		},
		{
			id: "gnome-settings",
			task: new GnomeSettingsTask(),
			option: {
				id: "gnome-settings",
				label: "Configure Gnome Settings",
				description: "Applies predefined GNOME settings.",
				selectedByDefault: true,
			},
		},
		{
			id: "github-repos",
			task: githubReposTask,
			option: {
				id: "github-repos",
				label: "Clone GitHub Repositories",
				description:
					"Paste your GitHub token in-app, then select repositories to clone.",
				selectedByDefault: true,
				badge: "token required",
			},
		},
	];

	const taskSelection = await selectTasksWithOpenTui(
		taskEntries.map((entry) => entry.option),
	);

	if (!taskSelection.confirmed) {
		logger.warn("Aborted by user.");
		process.exit(0);
	}

	const selectedTaskSet = new Set(taskSelection.selectedTaskIds);

	if (selectedTaskSet.has("github-repos")) {
		const tokenInput = await promptGitHubTokenWithOpenTui();
		if (!tokenInput.confirmed) {
			logger.warn(
				"GitHub token input cancelled. GitHub clone task will be skipped.",
			);
			selectedTaskSet.delete("github-repos");
		}

		if (tokenInput.confirmed) {
			githubReposTask.setAuthToken(tokenInput.token);
		}
	}

	const filteredTasks = taskEntries
		.filter((entry) => selectedTaskSet.has(entry.id))
		.map((entry) => entry.task);

	if (filteredTasks.length === 0) {
		logger.warn("No task selected. Exiting.");
		process.exit(0);
	}

	// 3. Check & Plan
	logger.log("\n--- Checking Prerequisites and System State ---");
	let hasPendingWork = false;
	const selectableCategories: SelectionCategory[] = [];
	const uiWarnings: string[] = [];

	for (const task of filteredTasks) {
		try {
			// Check
			const report = await task.check(context);

			// Report
			if (
				(report.toInstall && report.toInstall.length > 0) ||
				(report.warnings && report.warnings.length > 0)
			) {
				logger.log(`\n[${task.name}] Report:`);

				if (report.toInstall.length > 0) {
					hasPendingWork = true;
					selectableCategories.push({
						key: task.name,
						title: task.name,
						items: report.toInstall,
					});
					logger.warn(
						`  To Install (${report.toInstall.length}): ${report.toInstall.join(", ")}`,
					);
				}

				if (report.warnings && report.warnings.length > 0) {
					for (const warning of report.warnings) {
						uiWarnings.push(`[${task.name}] ${warning}`);
					}
					logger.warn(`  Warnings: ${report.warnings.join("\n    ")}`);
				}
			} else {
				if (report.upToDate.length > 0) {
					// Optional: print fully up-to-date tasks
					// logger.success(`[${task.name}] is up to date.`);
				}
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			logger.error(`Pre-check failed for [${task.name}]: ${message}`);
		}
	}

	if (hasPendingWork) {
		const selection = await selectPackagesWithOpenTui(
			selectableCategories,
			uiWarnings,
		);

		if (!selection.confirmed) {
			logger.warn("Aborted by user.");
			process.exit(0);
		}

		for (const task of filteredTasks) {
			const selectedForTask = selection.selectedByCategory[task.name] ?? [];
			task.applySelection?.(new Set(selectedForTask));
		}

		const totalSelected = Object.values(selection.selectedByCategory).reduce(
			(total, list) => total + list.length,
			0,
		);

		if (totalSelected === 0) {
			logger.warn(
				"No installable item selected. Selected tasks will still run.",
			);
		}
	}

	if (!hasPendingWork && uiWarnings.length > 0) {
		logger.warn(`Warnings detected:\n - ${uiWarnings.join("\n - ")}`);
	}

	const confirmed = await context.askConfirmation(
		"\nSelected tasks will run with current selections. Continue?",
	);
	if (!confirmed) {
		logger.warn("Aborted by user.");
		process.exit(0);
	}

	// 4. Execute Tasks (OpenTUI animated installation screen)
	const silentLogger = new SilentLogger();
	const animatedContext: ISystemContext = {
		packageManager: context.packageManager,
		isSudo: context.isSudo,
		rootDir: context.rootDir,
		getLogger: () => silentLogger,
		exec: (command: string[]) => context.exec(command),
		execStream: (command: string[]) =>
			context.execStream(command, { silent: true }),
		askConfirmation: (message: string) => context.askConfirmation(message),
	};

	const steps: InstallationStep[] = filteredTasks.map((task) => ({
		name: task.name,
		run: async () => {
			await task.execute(animatedContext);
		},
	}));

	const results = await runAnimatedInstallation(steps);

	// 5. Completion Summary Screen
	await showCompletionSummary(results);

	// Console summary for logs
	for (const result of results) {
		if (result.status === "completed") {
			logger.success(`Task completed: ${result.name}`);
		} else {
			logger.error(
				`Task failed: ${result.name}${result.error ? ` (${result.error})` : ""}`,
			);
		}
	}

	logger.success("\nAll tasks completed.");
}

main();
