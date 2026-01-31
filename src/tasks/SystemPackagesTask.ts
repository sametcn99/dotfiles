import type {
	ISystemContext,
	ITask,
	TaskCheckResult,
} from "../core/interfaces";

export class SystemPackagesTask implements ITask {
	name = "Install System Packages";
	private _toInstall: string[] = [];

	async check(context: ISystemContext): Promise<TaskCheckResult> {
		const result: TaskCheckResult = { upToDate: [], toInstall: [] };

		const appsListPath = `${context.rootDir}/src/lists/apps.list`;
		const file = Bun.file(appsListPath);

		if (!(await file.exists())) {
			return { ...result, warnings: [`${appsListPath} not found.`] };
		}

		const content = await file.text();
		const packages = content
			.split("\n")
			.map((line) => line.trim())
			.filter((line) => line && !line.startsWith("#"));

		if (packages.length === 0) return result;

		const installedSet = await this.getInstalledPackages(context);

		for (const pkg of packages) {
			if (installedSet.has(pkg)) {
				result.upToDate.push(pkg);
			} else {
				result.toInstall.push(pkg);
			}
		}

		// Cache for execute
		this._toInstall = result.toInstall;
		return result;
	}

	async execute(context: ISystemContext): Promise<void> {
		const logger = context.getLogger();

		// If check() wasn't called or produced nothing, we might want to re-run logic or trust _toInstall
		// But for safety, if _toInstall is empty, we might skip.
		// However, if the user skips the check phase in other workflows?
		// Let's rely on _toInstall being populated by check().
		// If check() wasn't called, _toInstall is empty.

		if (this._toInstall.length === 0) {
			// Either everything installed or check not run.
			// Let's assume the Runner ensures check is run or we just perform no-op.
			logger.log(`No system packages to install (or check not run).`);
			return;
		}

		logger.log(`Installing ${this._toInstall.length} packages...`);
		await this.updateRepositories(context);
		await this.installPackages(context, this._toInstall);
		logger.success("System packages installed.");
	}

	private async getInstalledPackages(
		context: ISystemContext,
	): Promise<Set<string>> {
		const installed = new Set<string>();
		let output = "";
		try {
			switch (context.packageManager) {
				case "apt":
					output = await context.exec([
						"dpkg-query",
						"-f",
						`\${Package}\n`,
						"-W",
					]);
					break;
				case "dnf":
				case "zypper":
					output = await context.exec(["rpm", "-qa", "--qf", "%{NAME}\\n"]);
					break;
				case "pacman":
					output = await context.exec(["pacman", "-Qq"]);
					break;
			}
		} catch {
			// Some commands might fail if no packages found or some other error,
			// but usually valid PM implies valid query tool.
		}

		if (output) {
			output.split("\n").forEach((line) => {
				const pkg = line.trim();
				if (pkg) installed.add(pkg);
			});
		}
		return installed;
	}

	private async updateRepositories(context: ISystemContext): Promise<void> {
		const logger = context.getLogger();
		logger.log("Updating package repositories...");

		let cmd: string[] = [];
		switch (context.packageManager) {
			case "apt":
				cmd = ["sudo", "apt", "update", "-y"];
				break;
			case "dnf":
			case "zypper":
				cmd = ["sudo", context.packageManager, "check-update"];
				// exit code 100 on dnf means updates available, 0 means none. 1 is error.
				// We'll wrap execution to be safe or ignore errors for check-update
				break;
			case "pacman":
				cmd = ["sudo", "pacman", "-Sy", "--noconfirm"];
				break;
		}

		if (cmd.length > 0) {
			await context.execStream(cmd);
		}
	}

	private async installPackages(
		context: ISystemContext,
		packages: string[],
	): Promise<void> {
		const logger = context.getLogger();
		// Batch install is efficient
		// original script used xargs -n1 which is one by one. apt can take multiple.
		// But for safety one by one is better if one fails?
		// Let's stick to batching but maybe separate if needed.
		// Original: xargs -r -n1 sudo "$PACKAGE_MANAGER" install -y
		// OOP version: Let's do batch for speed, or loop to replicate behavior.
		// Let's try batch first, usually better.

		let installCmd: string[] = [];

		// Command prefix
		switch (context.packageManager) {
			case "apt":
			case "dnf":
			case "zypper":
				installCmd = ["sudo", context.packageManager, "install", "-y"];
				break;
			case "pacman":
				installCmd = ["sudo", "pacman", "-S", "--noconfirm"];
				break;
		}

		// Install all at once
		const fullCmd = [...installCmd, ...packages];
		const success = await context.execStream(fullCmd);

		if (!success) {
			logger.warn("Batch installation had issues. Retrying individually...");
			for (const pkg of packages) {
				await context.execStream([...installCmd, pkg]);
			}
		}
	}
}
