import readline from "node:readline";

const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of lines) {
	const request = JSON.parse(line);
	process.stdout.write(`${JSON.stringify({
		id: request.id,
		ok: true,
		result: {
			text: `recognized:${request.imagePath}`,
			blocks: [{ text: "recognized", confidence: 0.9 }],
			metadata: { model: "fake", durationMs: 1 },
		},
	})}\n`);
}
