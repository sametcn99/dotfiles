import type { BunFile } from "bun";
import type {
	ISystemContext,
	ITask,
	TaskCheckResult,
} from "../core/interfaces";

export class SnapPackagesTask implements ITask {
	name = "Install Snap Applications";
	private _toInstall: { name: string; flags: string[] }[] = [];
	private _needsSnapd: boolean = false;

	applySelection(selectedItems: Set<string>): void {
		this._toInstall = this._toInstall.filter((req) =>
			selectedItems.has(req.name),
		);
		if (this._toInstall.length === 0) {
			this._needsSnapd = false;
		}
	}

	async check(context: ISystemContext): Promise<TaskCheckResult> {
		this._toInstall = [];
		this._needsSnapd = false;

		const result: TaskCheckResult = { upToDate: [], toInstall: [] };

		const snapListPath = `${context.rootDir}/src/lists/snap-apps.list`;
		const file = Bun.file(snapListPath);

		if (!(await file.exists())) {
			return { ...result, warnings: [`${snapListPath} not found.`] };
		}

		const requests = await this.getSnapRequests(file);
		if (requests.length === 0) return result;

		const hasSnap = Bun.which("snap");
		let installedSet = new Set<string>();

		if (hasSnap) {
			installedSet = await this.getInstalledSnaps(context);
		} else {
			this._needsSnapd = true;
			result.warnings = ["Snapd is missing. It will be installed first."];
		}

		for (const req of requests) {
			if (installedSet.has(req.name)) {
				result.upToDate.push(req.name);
			} else {
				result.toInstall.push(req.name);
				this._toInstall.push(req);
			}
		}

		return result;
	}

	async execute(context: ISystemContext): Promise<void> {
		const logger = context.getLogger();

		if (this._toInstall.length === 0) {
			logger.log("No snap action required.");
			return;
		}

		// Install snapd if needed
		if (this._needsSnapd) {
			logger.log("Installing snapd...");
			await this.installSnapd(context);
			// Enable socket
			const hasSystemCtl = Bun.which("systemctl");
			if (hasSystemCtl) {
				await context.execStream([
					"sudo",
					"systemctl",
					"enable",
					"--now",
					"snapd.socket",
				]);
			}
		}

		for (const req of this._toInstall) {
			logger.log(`Installing Snap app: ${req.name} ${req.flags.join(" ")}`);
			await context.execStream([
				"sudo",
				"snap",
				"install",
				req.name,
				...req.flags,
			]);
		}
	}

	private async getSnapRequests(
		file: BunFile,
	): Promise<{ name: string; flags: string[] }[]> {
		const content = await file.text();
		const lines = content.split("\n");
		const requests: { name: string; flags: string[] }[] = [];

		for (let line of lines) {
			line = line.trim();
			if (!line || line.startsWith("#")) continue;

			// Remove inline comments
			if (line.includes("#")) {
				line = line.substring(0, line.indexOf("#")).trim();
			}

			const flags: string[] = [];
			if (line.includes("--classic")) {
				flags.push("--classic");
				line = line.replace("--classic", "").trim();
			}

			const appName = line;
			if (appName) {
				requests.push({ name: appName, flags });
			}
		}
		return requests;
	}

	private async getInstalledSnaps(
		context: ISystemContext,
	): Promise<Set<string>> {
		const installed = new Set<string>();
		try {
			const output = await context.exec(["snap", "list"]);
			// Name      Version ...
			// core      ...
			const lines = output.split("\n");
			for (let i = 1; i < lines.length; i++) {
				// Skip header
				const line = lines[i]?.trim();
				if (!line) continue;
				const parts = line.split(/\s+/);
				const pkgName = parts[0];
				if (pkgName) {
					installed.add(pkgName);
				}
			}
		} catch {
			// snap list might fail if no snaps? usually returns header at least.
		}
		return installed;
	}

	private async installSnapd(context: ISystemContext): Promise<void> {
		let cmd: string[] = [];
		switch (context.packageManager) {
			case "apt":
			case "dnf":
			case "zypper":
				cmd = ["sudo", context.packageManager, "install", "-y", "snapd"];
				break;
			case "pacman":
				cmd = ["sudo", "pacman", "-S", "--noconfirm", "snapd"];
				break;
		}
		if (cmd.length > 0) {
			await context.execStream(cmd);
		}
	}
}
