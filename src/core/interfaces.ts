export enum LogLevel {
	INFO,
	SUCCESS,
	WARNING,
	ERROR,
}

export interface ILogger {
	log(message: string): void;
	success(message: string): void;
	warn(message: string): void;
	error(message: string): void;
}

export interface ISystemContext {
	packageManager: string;
	isSudo: boolean;
	rootDir: string;
	getLogger(): ILogger;
	exec(command: string[]): Promise<string>;
	execStream(command: string[]): Promise<boolean>;
	askConfirmation(message: string): Promise<boolean>;
}

export interface TaskCheckResult {
	upToDate: string[];
	toInstall: string[];
	warnings?: string[];
}

export interface ITask {
	name: string;
	check(context: ISystemContext): Promise<TaskCheckResult>;
	execute(context: ISystemContext): Promise<void>;
}
