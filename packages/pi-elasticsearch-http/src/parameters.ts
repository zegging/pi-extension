import { type Static, Type } from "typebox";
import { EsHttpError } from "./errors.ts";
import type { EsHttpInput } from "./types.ts";

const VariableValue = Type.Union([Type.String(), Type.Number(), Type.Boolean()]);
const VariablesSchema = Type.Optional(Type.Record(Type.String(), VariableValue));

/**
 * Flat parameter shape exposed to LLM tool calling.
 *
 * The tool has three mutually exclusive invocation modes:
 *   - file + name           (run one named request from a workspace .http/.rest file)
 *   - file + all: true      (run every request in the file sequentially)
 *   - raw                   (run a single raw HTTP request)
 *
 * A discriminated Union at the schema root cannot be represented as tool-calling
 * `function.parameters` in current LLM APIs — they require the root to be
 * `{ type: "object", properties: {...} }` and silently drop root-level
 * `anyOf`/`oneOf`, which flattens the schema to `{}` and hides every field name
 * from the model. So we accept a flat Object here and enforce the three-way
 * exclusivity at runtime via `normalizeEsHttpInput`.
 */
export const EsHttpParameters = Type.Object(
	{
		profile: Type.Optional(
			Type.String({ description: "Profile name from ~/.pi/agent/es-http/config.json (defaults to the configured default profile)" }),
		),
		file: Type.Optional(
			Type.String({ description: "Workspace-relative .http/.rest file path. Combine with `name` or `all`." }),
		),
		name: Type.Optional(
			Type.String({ description: "# @name of the request to execute from `file`. Requires `file`; mutually exclusive with `all` and `raw`." }),
		),
		all: Type.Optional(
			Type.Literal(true, { description: "With `file`: execute every request in the file sequentially. Mutually exclusive with `name` and `raw`." }),
		),
		raw: Type.Optional(
			Type.String({ description: "Raw HTTP text containing exactly one request. Mutually exclusive with `file`/`name`/`all`." }),
		),
		variables: VariablesSchema,
	},
	{ additionalProperties: false },
);

export type EsHttpRawParameters = Static<typeof EsHttpParameters>;

/**
 * Validate the three-way exclusive invocation modes and produce a
 * discriminated `EsHttpInput` for the rest of the pipeline to narrow against.
 */
export function normalizeEsHttpInput(raw: EsHttpRawParameters): EsHttpInput {
	const hasFile = typeof raw.file === "string" && raw.file.length > 0;
	const hasName = typeof raw.name === "string" && raw.name.length > 0;
	const hasAll = raw.all === true;
	const hasRaw = typeof raw.raw === "string" && raw.raw.length > 0;

	if (hasFile && hasRaw) {
		throw new EsHttpError("PARSE_ERROR", "`file` and `raw` are mutually exclusive; pass exactly one.", {
			hint: "Use `{ file, name }` or `{ file, all: true }` OR `{ raw }`.",
		});
	}

	if (hasRaw) {
		if (hasName || hasAll) {
			throw new EsHttpError("PARSE_ERROR", "`raw` cannot be combined with `name` or `all`.", {
				hint: "Pass `raw` alone (optionally with `profile` and `variables`).",
			});
		}
		return { profile: raw.profile, raw: raw.raw as string, variables: raw.variables };
	}

	if (hasFile) {
		if (hasName && hasAll) {
			throw new EsHttpError("PARSE_ERROR", "`name` and `all` are mutually exclusive under `file`.", {
				hint: "Use `{ file, name }` for one request, or `{ file, all: true }` for the whole file.",
			});
		}
		if (hasName) {
			return { profile: raw.profile, file: raw.file as string, name: raw.name as string, variables: raw.variables };
		}
		if (hasAll) {
			return { profile: raw.profile, file: raw.file as string, all: true, variables: raw.variables };
		}
		throw new EsHttpError("PARSE_ERROR", "`file` requires either `name` or `all: true`.", {
			hint: "Pass `{ file, name }` to run one named request, or `{ file, all: true }` for all requests.",
		});
	}

	if (hasName || hasAll) {
		throw new EsHttpError("PARSE_ERROR", "`name` and `all` require `file`.", {
			hint: "Pass `{ file, name }` or `{ file, all: true }`, or use `raw` instead.",
		});
	}

	throw new EsHttpError("PARSE_ERROR", "Missing required parameters: choose exactly one invocation mode.", {
		hint: "Pass `{ file, name }`, `{ file, all: true }`, or `{ raw }`.",
	});
}
