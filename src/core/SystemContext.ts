import type { ILogger, ISystemContext } from "./interfaces";
import { ConsoleLogger } from "./Logger";

export class SystemContext implements ISystemContext {
	public packageManager: string = "";
	public isSudo: boolean = false;
	public rootDir: string;
	private logger: ILogger;

	constructor(rootDir: string) {
		this.rootDir = rootDir;
		this.logger = ConsoleLogger.getInstance();
	}

	public async initialize(): Promise<void> {
		this.isSudo = (await this.exec(["id", "-u"])).trim() === "0";
		if (!this.isSudo) {
			// In the original script, it exits if not sudo.
			// Here we just flag it, tasks can decide to fail or sudo.
			// But usually dotfiles setup needs sudo.
			try {
				// Try to sudo -v to check/prompt
				await this.execStream(["sudo", "-v"]);
				this.isSudo = true;
			} catch {
				this.logger.warn(
					"Not running as root and sudo failed. Some tasks may fail.",
				);
			}
		}
		await this.detectPackageManager();
	}

	public getLogger(): ILogger {
		return this.logger;
	}

	public async exec(command: string[]): Promise<string> {
		const proc = Bun.spawn(command, {
			stdout: "pipe",
			stderr: "inherit",
		});
		const text = await new Response(proc.stdout).text();
		await proc.exited;
		return text;
	}

	public async execStream(
		command: string[],
		options?: { silent?: boolean },
	): Promise<boolean> {
		const proc = Bun.spawn(command, {
			stdout: options?.silent ? "pipe" : "inherit",
			stderr: options?.silent ? "pipe" : "inherit",
			stdin: "inherit",
		});
		const exitCode = await proc.exited;
		return exitCode === 0;
	}

	public async askConfirmation(message: string): Promise<boolean> {
		const response = prompt(`${message} [y/N]`);
		return response?.toLowerCase() === "y";
	}

	private async detectPackageManager(): Promise<void> {
		const managers = ["apt", "dnf", "pacman", "zypper"];
		for (const pm of managers) {
			const path = Bun.which(pm);
			if (path) {
				this.packageManager = pm;
				this.logger.success(`Detected package manager: ${pm}`);
				return;
			}
		}
		throw new Error("No supported package manager found.");
	}
}
