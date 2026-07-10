import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerEsHttpCommand } from "./commands.ts";
import { registerEsHttpTool } from "./tool.ts";
import { registerEsHttpProfilesTool } from "./tool-profiles.ts";

export default function piElasticsearchHttp(pi: ExtensionAPI) {
	registerEsHttpTool(pi);
	registerEsHttpProfilesTool(pi);
	registerEsHttpCommand(pi);
}
