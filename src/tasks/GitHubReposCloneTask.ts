import type {
	ISystemContext,
	ITask,
	TaskCheckResult,
} from "../core/interfaces";

interface GitHubRepo {
	full_name: string;
	clone_url: string;
}

export class GitHubReposCloneTask implements ITask {
	name = "Clone GitHub Repositories";
	private _authToken = "";
	private _repos: GitHubRepo[] = [];
	private _selectedRepoNames = new Set<string>();
	private _cloneBaseDir = "";

	applySelection(selectedItems: Set<string>): void {
		this._selectedRepoNames = selectedItems;
	}

	setAuthToken(token: string): void {
		this._authToken = token.trim();
	}

	async check(context: ISystemContext): Promise<TaskCheckResult> {
		this._repos = [];
		this._selectedRepoNames = new Set<string>();
		const defaultCloneDir = Bun.env.HOME
			? `${Bun.env.HOME}/Documents/git-repos`
			: `${context.rootDir}/Documents/git-repos`;
		this._cloneBaseDir = Bun.env.GITHUB_CLONE_DIR || defaultCloneDir;

		if (!Bun.which("git")) {
			return {
				upToDate: [],
				toInstall: [],
				warnings: ["git is not installed. Repository cloning will be skipped."],
			};
		}

		if (!this._authToken) {
			return {
				upToDate: [],
				toInstall: [],
				warnings: [
					"GitHub token is not provided. Open the GitHub task and paste the token.",
				],
			};
		}

		try {
			this._repos = await this.fetchAllRepos();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return {
				upToDate: [],
				toInstall: [],
				warnings: [`Failed to fetch GitHub repository list: ${message}`],
			};
		}

		const repoNames = this._repos.map((repo) => repo.full_name);
		for (const repoName of repoNames) {
			this._selectedRepoNames.add(repoName);
		}

		return {
			upToDate: [],
			toInstall: repoNames,
			warnings:
				repoNames.length === 0
					? ["No repositories found for the authenticated user."]
					: [`Repositories will be cloned into ${this._cloneBaseDir}.`],
		};
	}

	async execute(context: ISystemContext): Promise<void> {
		const logger = context.getLogger();
		if (!this._authToken || this._repos.length === 0) {
			logger.warn("No GitHub repositories available to clone.");
			return;
		}

		await context.execStream(["mkdir", "-p", this._cloneBaseDir], {
			silent: true,
		});

		for (const repo of this._repos) {
			if (!this._selectedRepoNames.has(repo.full_name)) {
				continue;
			}

			const targetDir = this.joinPath(this._cloneBaseDir, repo.full_name);
			const alreadyCloned = await this.isAlreadyCloned(targetDir);
			if (alreadyCloned) {
				logger.log(`Already cloned, skipping: ${repo.full_name}`);
				continue;
			}

			await context.execStream(["mkdir", "-p", this.dirnamePath(targetDir)], {
				silent: true,
			});

			const success = await context.execStream([
				"git",
				"-c",
				`http.extraHeader=Authorization: Bearer ${this._authToken}`,
				"clone",
				repo.clone_url,
				targetDir,
			]);

			if (!success) {
				logger.error(`Clone failed: ${repo.full_name}`);
			}
		}
	}

	private async fetchAllRepos(): Promise<GitHubRepo[]> {
		const allRepos: GitHubRepo[] = [];
		let page = 1;

		while (true) {
			const response = await fetch(
				`https://api.github.com/user/repos?visibility=all&affiliation=owner&per_page=100&page=${page}&sort=full_name`,
				{
					headers: {
						Authorization: `Bearer ${this._authToken}`,
						Accept: "application/vnd.github+json",
					},
				},
			);

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}

			const repos = (await response.json()) as GitHubRepo[];
			if (!Array.isArray(repos) || repos.length === 0) {
				break;
			}

			for (const repo of repos) {
				allRepos.push(repo);
			}

			page += 1;
		}

		return allRepos;
	}

	private async isAlreadyCloned(repoDir: string): Promise<boolean> {
		return Bun.file(this.joinPath(repoDir, ".git")).exists();
	}

	private joinPath(...parts: string[]): string {
		return parts
			.map((part, index) => {
				if (index === 0) {
					return part.replace(/\/+$/g, "");
				}
				return part.replace(/^\/+|\/+$/g, "");
			})
			.filter((part) => part.length > 0)
			.join("/");
	}

	private dirnamePath(path: string): string {
		const normalized = path.replace(/\/+$/g, "");
		const separatorIndex = normalized.lastIndexOf("/");
		if (separatorIndex <= 0) {
			return ".";
		}
		return normalized.slice(0, separatorIndex);
	}
}
