const LISTS_DIR = `${import.meta.dir}/../src/lists`;

async function checkDuplicates(filePath: string): Promise<string[]> {
	const file = Bun.file(filePath);
	if (!(await file.exists())) {
		console.error(`Error: ${filePath} not found!`);
		return [];
	}

	const content = await file.text();
	const lines = content
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0);

	const counts = new Map<string, number>();
	for (const line of lines) {
		counts.set(line, (counts.get(line) || 0) + 1);
	}

	const duplicates = Array.from(counts.entries())
		.filter(([_, count]) => count > 1)
		.map(([line]) => line);

	return duplicates;
}

async function run() {
	let hasError = false;

	const filesToCheck = ["apps.list", "snap-apps.list"];

	for (const fileName of filesToCheck) {
		const filePath = `${LISTS_DIR}/${fileName}`;
		console.log(`Checking duplicates in ${fileName}...`);

		const duplicates = await checkDuplicates(filePath);

		if (duplicates.length > 0) {
			console.error(`Error: Duplicate applications found in ${fileName}:`);
			for (const dup of duplicates) {
				console.error(`  - ${dup}`);
			}
			hasError = true;
		} else {
			console.log(`No duplicates found in ${fileName}.`);
		}
	}

	// Check for overlaps
	console.log("Checking for overlaps between apps.list and snap-apps.list...");
	const apps = new Set(
		(await Bun.file(`${LISTS_DIR}/apps.list`).text())
			.split("\n")
			.map((l) => l.trim())
			.filter((l) => l.length > 0),
	);
	const snapApps = new Set(
		(await Bun.file(`${LISTS_DIR}/snap-apps.list`).text())
			.split("\n")
			.map((l) => l.trim())
			.filter((l) => l.length > 0),
	);

	const overlaps = Array.from(apps).filter((app) => snapApps.has(app));

	if (overlaps.length > 0) {
		console.warn("Warning: Same applications found in both files:");
		for (const overlap of overlaps) {
			console.warn(`  - ${overlap}`);
		}
		// The shell script didn't set exit_code=1 for overlaps, keeping that behavior.
	}

	if (hasError) {
		process.exit(1);
	}
}

run();
