import { SystemContext } from "./core/SystemContext";
import { DotfilesTask } from "./tasks/DotfilesTask";
import { GnomeSettingsTask } from "./tasks/GnomeSettingsTask";
import { SnapPackagesTask } from "./tasks/SnapPackagesTask";
import { SystemPackagesTask } from "./tasks/SystemPackagesTask";

async function main() {
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

	// 2. Define Tasks
	const tasks = [
		new SystemPackagesTask(),
		new DotfilesTask(),
		new SnapPackagesTask(),
		new GnomeSettingsTask(),
	];

	// 3. Check & Plan
	logger.log("\n--- Checking Prerequisites and System State ---");
	let hasPendingWork = false;

	for (const task of tasks) {
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
					logger.warn(
						`  To Install (${report.toInstall.length}): ${report.toInstall.join(", ")}`,
					);
				}

				if (report.warnings && report.warnings.length > 0) {
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

	if (!hasPendingWork) {
		logger.success("\nSystem appears up to date. No packages to install.");
		const force = await context.askConfirmation(
			"Do you want to run tasks anyway (force execution)?",
		);
		if (!force) {
			process.exit(0);
		}
	} else {
		const confirmed = await context.askConfirmation(
			"\nDo you want to proceed with the installation?",
		);
		if (!confirmed) {
			logger.warn("Aborted by user.");
			process.exit(0);
		}
	}

	// 4. Execute Tasks
	for (const task of tasks) {
		logger.log(`\n--- Running Task: ${task.name} ---`);
		try {
			await task.execute(context);
		} catch {
			logger.error(`Task [${task.name}] failed.`);
		}
	}

	logger.success("\nAll tasks completed.");
}

main();
