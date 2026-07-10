# pi-elasticsearch-http

A lightweight Pi extension for executing reviewable, reproducible Elasticsearch HTTP requests from `.http` / `.rest` files or one raw HTTP request.

Primary target: self-hosted Elasticsearch 6.x.

## Install

```bash
# latest
pi install npm:@zegging/pi-elasticsearch-http

# pinned
pi install npm:@zegging/pi-elasticsearch-http@0.2.0

# try without installing permanently
pi -e npm:@zegging/pi-elasticsearch-http@0.2.0
```

Local development from this monorepo:

```bash
pi -e ./packages/pi-elasticsearch-http
```

## Configure

Interactive:

```text
/es-http add dev
/es-http list
/es-http default dev
/es-http test dev
```

Files:

- Global config: `~/.pi/agent/es-http/config.json`
- Extension auth: `~/.pi/agent/es-http/auth.json` (`0600`)
- Project default only: `<workspace>/.pi/es-http.json`

Example global config:

```json
{
  "defaultProfile": "dev",
  "contextMaxBytes": 51200,
  "contextMaxLines": 2000,
  "profiles": {
    "dev": {
      "baseUrl": "https://es-dev.internal:9200",
      "timeoutMs": 30000,
      "headers": { "Accept": "application/json" },
      "auth": {
        "type": "basic",
        "username": "operator",
        "credential": "profile:dev",
        "passwordEnv": "ES_HTTP_DEV_PASSWORD"
      }
    }
  }
}
```

## Tools

### `es_http`

Accepts exactly one of:

```ts
{ profile?: string; file: string; name: string; variables?: Record<string, string | number | boolean> }
{ profile?: string; file: string; all: true; variables?: Record<string, string | number | boolean> }
{ profile?: string; raw: string; variables?: Record<string, string | number | boolean> }
```

Example `.http`:

```http
# @name findUser
POST /users/_search
Content-Type: application/json

{
  "query": { "term": { "user_id": "{{userId}}" } }
}
```

Example tool args:

```json
{
  "file": "queries.http",
  "name": "findUser",
  "variables": { "userId": "42" }
}
```

### `es_http_profiles`

Read-only, no parameters. Returns sanitized metadata for every configured profile so an agent can pick a profile without asking the user to reveal secrets. Output mirrors `/es-http list`:

- default profile marker
- profile name and base URL
- auth type (`none` / `basic` / `authorization`) plus basic-auth username
- timeout (ms)
- profile header names (values are omitted)

Basic-auth passwords and Authorization header values stored under `~/.pi/agent/es-http/auth.json` are never included in the output.

## Safety

- `file` must be workspace-relative and end with `.http` or `.rest`.
- Symlinks and `..` escapes outside the workspace are rejected.
- Requests may only target the selected profile origin.
- These request headers are forbidden: `Authorization`, `Proxy-Authorization`, `Host`, `Content-Length`, `Connection`, `Transfer-Encoding`.
- Read-only allowlist runs without confirmation: `GET`, `HEAD`, `POST */_search`, `*/_msearch`, `*/_count`, `*/_validate/query`, `*/_explain/*`.
- Writes and high-risk endpoints require interactive confirmation.
- Non-interactive modes reject requests requiring confirmation.
- Redirects are not followed (`manual`).
- No retries are performed.

## Response truncation

Responses are returned with head truncation. Defaults are 50 KiB / 2000 lines, configurable globally up to a hard 200 KiB context cap. When truncated, the full raw response is saved under:

```text
<os.tmpdir()>/pi-es-http-XXXXXX/response.json
```

The temp response file is written with `0600` permissions.
