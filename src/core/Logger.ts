import type { ILogger } from "./interfaces";

export class ConsoleLogger implements ILogger {
	private static instance: ConsoleLogger;

	private constructor() {}

	public static getInstance(): ConsoleLogger {
		if (!ConsoleLogger.instance) {
			ConsoleLogger.instance = new ConsoleLogger();
		}
		return ConsoleLogger.instance;
	}

	log(message: string): void {
		console.log(message);
	}

	success(message: string): void {
		console.log(`\x1b[32m[SUCCESS]\x1b[0m ${message}`);
	}

	warn(message: string): void {
		console.log(`\x1b[33m[WARNING]\x1b[0m ${message}`);
	}

	error(message: string): void {
		console.error(`\x1b[31m[ERROR]\x1b[0m ${message}`);
	}
}
