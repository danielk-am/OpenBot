# Optional advanced MCP integration for OpenBot v1.0.3

This release-specific integration powers the local Desktop, personal, Alkamy and Asia Mannequin deployments. It is separate from upstream navigation PR #1683. It requires the matching frontend and four server patches on branch deployed/advanced-mcp-v1.0.3; do not overlay this frontend onto current main's newer API.

The existing native Add custom MCP server screen supports HTTPS Streamable HTTP with automatic OAuth discovery, bearer tokens or multiple named secret headers, and STDIO commands with explicit JSON argv and environment rows. Existing OAuth client ID/secret fields are available for providers that do not accept automatic registration. Provider consent remains an interactive account-owner step.

WordPress.com uses https://public-api.wordpress.com/wpcom/v2/mcp/v1. A normal WordPress REST endpoint is not an MCP server. Use the header editor for an MCP provider's documented custom Authorization scheme or API-key headers.

STDIO example: command `node`, arguments `["/app/fixtures/stdio-demo.mjs"]`, no environment. This exposes echo and runtime_info. Commands execute inside a separate runner container, with no host mounts, Docker socket or credential-vault mount. Packages must exist in the runner image; install approved dependencies by rebuilding that image. Arguments must be a JSON array, not a shell command.

## Runtime contract

Adapter: Node 24, port 3330 privately, persistent /state owned by node, MCP_ADAPTER_ADMIN_TOKEN, MCP_RUNNER_TOKEN, MCP_RUNNER_URL=http://mcp-runner:3331, OPENBOT_MCP_PUBLIC_URL set to the public OpenBot origin. MCP_LANDING_PATH defaults to /admin/plugins/composio/add-mcp-server; Desktop uses /connections/composio/add-mcp-server. Keep the vault and key together in backups.

Runner: same image with `node src/runner.mjs`, private port 3331, matching MCP_RUNNER_TOKEN, read-only root, writable /tmp and /workspace tmpfs, process and memory limits. Do not expose either service's ports publicly. Backend server and worker require MCP_ADAPTER_INTERNAL_URL=http://mcp-adapter:3330 and the matching MCP_ADAPTER_ADMIN_TOKEN; existing OpenBot credential encryption and gateway settings remain required. Check source configuration names before integrating with another release.

OAuth tokens, header values, environment values and argv are encrypted at rest; public status responses omit secret values and argv. Native OpenBot credentials hold opaque registration tokens. Bots still use existing grants and approval policy. Calls made outside a conversation that requires approval are refused rather than bypassing approval. Removing the local connection does not revoke an external provider account grant.

The HTTP client uses `CopilotKit-MCP-Adapter/0.1`: n8n's global crawler filter returns empty 204 responses for user agents containing `bot`, including `OpenBot`.

## Verification on 2026-11-15

- `npm test`: 11 passed, 0 failed. Includes local OAuth discovery/DCR/PKCE/callback/refresh, real custom-header tool calls, STDIO process lifecycle, vault encryption and network rejection tests.
- `bun test tests/managed-mcp.test.ts` in server: 3 passed, 0 failed. Includes exact callback redirects for hosted/Desktop and external redirect rejection.
- Frontend/backend TypeScript checks and native frontend build passed. Four advanced browser fixture cases passed.
- All four actual deployments: native STDIO registration, discovery of two tools and an echo call through the native MCP transport passed. Temporary registrations were removed. Existing approval policy separately refused an approval-required call outside a conversation, as expected.
- Personal, Asia Mannequin and local n8n: live OAuth discovery, registration and PKCE consent URL passed. Alkamy n8n responds `MCP access is disabled`; enable instance-level MCP in n8n before connecting it.
- WordPress.com: local discovery/registration/PKCE consent URL passed. All three Hetzner deployments receive `Registration failed. Please try again.` from the provider's registration endpoint. An existing OAuth client may be supplied, but that fallback has not been tested with a real client. No provider account consent was granted by these tests.
- Hosted gateway checks: anonymous/wrong credentials 401; correct credentials 200; same-origin input validation reached; cross-origin POST 403.

## Review trail

- https://github.com/CopilotKit/OpenBot/pull/1683 — native admin navigation, independently focused on current main.
- https://github.com/CopilotKit/OpenBot/issues/1685 — upstream STDIO support.
- https://github.com/CopilotKit/OpenBot/issues/1686 — upstream multi-header UI.

The adapter is currently one instance per deployment with a local encrypted volume. It is not a horizontally replicated shared-state service. A multi-replica upstream implementation needs shared durable configuration, OAuth pending state and runner routing.
