export interface SelectionCategory {
	key: string;
	title: string;
	items: string[];
}

export interface TaskOption {
	id: string;
	label: string;
	description?: string;
	selectedByDefault?: boolean;
	badge?: string;
}

export interface TaskSelectionResult {
	confirmed: boolean;
	selectedTaskIds: string[];
}

export interface SelectionResult {
	confirmed: boolean;
	selectedByCategory: Record<string, string[]>;
}

export interface InstallationStep {
	name: string;
	run: () => Promise<void>;
}

export interface InstallationStepResult {
	name: string;
	status: "completed" | "failed";
	error?: string;
}

export interface TokenPromptResult {
	confirmed: boolean;
	token: string;
}
