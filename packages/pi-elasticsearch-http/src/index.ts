import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerEsHttpCommand } from "./commands.ts";
import { registerEsHttpTool } from "./tool.ts";

export default function piElasticsearchHttp(pi: ExtensionAPI) {
	registerEsHttpTool(pi);
	registerEsHttpCommand(pi);
}
