export type VariableValue = string | number | boolean;
export type Variables = Record<string, VariableValue>;

export type EsHttpInput =
	| { profile?: string; file: string; name: string; variables?: Variables }
	| { profile?: string; file: string; all: true; variables?: Variables }
	| { profile?: string; raw: string; variables?: Variables };

export interface ParsedHttpRequest {
	name?: string;
	method: string;
	target: string;
	version?: string;
	headers: Array<{ name: string; value: string }>;
	body: string;
	startLine: number;
}

export interface PreparedHttpRequest extends ParsedHttpRequest {
	url: URL;
	normalizedPath: string;
	bodyBytes: number;
	headersMap: Record<string, string>;
}

export type RiskLevel = "readonly" | "write" | "dangerous";

export interface RiskClassification {
	level: RiskLevel;
	reason: string;
	requiresConfirmation: boolean;
	highlight?: string[];
}

export interface EsHttpProfileAuthBasic {
	type: "basic";
	username: string;
	credential?: string;
	passwordEnv?: string;
}

export interface EsHttpProfileAuthAuthorization {
	type: "authorization";
	credential?: string;
	valueEnv?: string;
}

export type EsHttpProfileAuth = EsHttpProfileAuthBasic | EsHttpProfileAuthAuthorization;

export interface EsHttpProfile {
	baseUrl: string;
	timeoutMs?: number;
	headers?: Record<string, string>;
	auth?: EsHttpProfileAuth;
}

export interface EsHttpGlobalConfig {
	defaultProfile?: string;
	contextMaxBytes?: number;
	contextMaxLines?: number;
	profiles: Record<string, EsHttpProfile>;
}

export interface EsHttpProjectConfig {
	defaultProfile?: string;
}

export interface ResolvedProfile {
	name: string;
	baseUrl: URL;
	timeoutMs: number;
	headers: Record<string, string>;
	auth?: EsHttpProfileAuth;
}

export interface LoadedConfig {
	global: EsHttpGlobalConfig;
	project: EsHttpProjectConfig | undefined;
	profile: ResolvedProfile;
	contextMaxBytes: number;
	contextMaxLines: number;
	paths: {
		globalConfig: string;
		authFile: string;
		projectConfig: string;
	};
}

export interface HttpExecutionResult {
	status: number;
	statusText: string;
	headers: Record<string, string>;
	bodyText: string;
	bodyBytes: number;
	truncated: boolean;
	fullOutputPath?: string;
}
