import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { PageSection, PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { client } from "@/lib/client";
import { useManagePaths } from "@/lib/manage-paths";
import {
  type McpCredential,
  matchingMcpCredentials,
  validateCustomMcp,
} from "@/lib/plugins/custom-mcp";
import {
  type PluginServer,
  pluginsPageQueryOptions,
} from "@/lib/plugins/queries";
import { AdvancedMcpPage } from "./advanced-mcp-page";

/** Native admin form, sharing OpenBot's transport, encrypted credential store and tool controls. */
export function CustomMcpPage() {
  const [legacy, setLegacy] = useState(false);
  const adapter = useQuery({
    queryKey: ["mcp-adapter-status"],
    queryFn: async () => {
      const response = await client("/api/plugins/adapter/status");
      return response.json() as Promise<{ enabled?: boolean }>;
    },
    retry: false,
    staleTime: 60000,
  });
  if (adapter.data?.enabled && !legacy)
    return <AdvancedMcpPage onLegacy={() => setLegacy(true)} />;
  return (
    <LegacyCustomMcpPage
      onAdvanced={adapter.data?.enabled ? () => setLegacy(false) : undefined}
    />
  );
}
function LegacyCustomMcpPage({ onAdvanced }: { onAdvanced?: () => void }) {
  const paths = useManagePaths();
  const cache = useQueryClient();
  const plugins = useQuery(pluginsPageQueryOptions());
  const credentials = useQuery({
    queryKey: ["custom-mcp-credentials"],
    queryFn: () =>
      client<McpCredential[]>("/api/admin/credentials", "credentials"),
  });
  const [id, setId] = useState("");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [auth, setAuth] = useState("none");
  const [token, setToken] = useState("");
  const [credentialId, setCredentialId] = useState("");
  const [storedCredential, setStoredCredential] = useState<string>();
  const [server, setServer] = useState<PluginServer>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const available = matchingMcpCredentials(credentials.data ?? [], id.trim());
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const input = { id: id.trim(), title: title.trim(), url: url.trim() };
    if (!plugins.data || credentials.isPending || credentials.error) {
      setError("Wait for servers and credentials to load, then try again.");
      return;
    }
    const invalid = validateCustomMcp(
      input,
      (plugins.data?.servers ?? []).map((s) => s.id),
    );
    if (invalid) {
      setError(invalid);
      return;
    }
    if (auth === "saved" && !available.some((c) => c.id === credentialId)) {
      setError("Choose an active credential for this server ID.");
      return;
    }
    if (auth === "new" && !storedCredential && !token.trim()) {
      setError("Enter a bearer token.");
      return;
    }
    setBusy(true);
    try {
      let savedId =
        storedCredential ?? (auth === "saved" ? credentialId : undefined);
      if (auth === "new" && !savedId) {
        const saved = await client<McpCredential>(
          "/api/admin/credentials",
          "credential",
          {
            method: "POST",
            body: {
              kind: "mcp",
              provider: input.id,
              keyId: `mcp-${crypto.randomUUID()}`,
              metadata: {
                label: input.title,
                origin: new URL(input.url).origin,
              },
              plaintext: token.trim(),
            },
          },
        );
        savedId = saved.id;
        setStoredCredential(saved.id);
        setToken("");
      }
      const added = await client<PluginServer>(
        "/api/plugins/servers/custom",
        "server",
        {
          method: "POST",
          body: { ...input, ...(savedId ? { credentialId: savedId } : {}) },
        },
      );
      setServer(added);
      await cache.invalidateQueries({
        queryKey: pluginsPageQueryOptions().queryKey,
      });
    } catch (e) {
      // Registration may have persisted before discovery failed. Recover its settings instead of adding twice.
      try {
        const response = await client("/api/plugins");
        const data = await response.json();
        const saved = data.servers?.find(
          (s: PluginServer) => s.id === input.id,
        );
        if (saved) setServer(saved);
      } catch {}
      setError(
        e instanceof Error ? e.message : "Could not add the server. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    if (!server) return;
    setBusy(true);
    setError("");
    try {
      setServer(
        await client<PluginServer>(
          `/api/plugins/servers/${encodeURIComponent(server.id)}/refresh`,
          "server",
          { method: "POST", body: {} },
        ),
      );
      await cache.invalidateQueries({
        queryKey: pluginsPageQueryOptions().queryKey,
      });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not test the connection.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <PageShell
      title="Add MCP server"
      action={
        onAdvanced ? (
          <Button variant="outline" onClick={onAdvanced}>
            OAuth, headers or STDIO
          </Button>
        ) : undefined
      }
      description="Connect a custom service by URL, discover its tools, then manage access in OpenBot."
      backButton={{ linkProps: paths.plugins(), label: paths.pluginsLabel }}
    >
      {server ? (
        <PageSection
          title={
            server.lastError
              ? "Server saved · connection needs attention"
              : "Server connected"
          }
        >
          <div className="mt-4 space-y-4">
            <p role="status" className="text-sm">
              {server.title} · {server.tools.length} tools discovered
            </p>
            {server.lastError ? (
              <p role="alert" className="text-sm text-destructive break-words">
                {server.lastError}
              </p>
            ) : null}
            <p className="text-sm text-muted-foreground">
              Open the server’s settings to review its tools and access
              controls.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button render={<Link {...paths.plugin(server.id)} />}>
                Review tools and access
              </Button>
              <Button variant="outline" disabled={busy} onClick={refresh}>
                {busy ? "Testing…" : "Test connection again"}
              </Button>
            </div>
          </div>
        </PageSection>
      ) : (
        <form onSubmit={save} className="pb-8" aria-busy={busy}>
          <fieldset disabled={busy} className="min-w-0">
            <PageSection
              title="Server details"
              description="Use the service’s Streamable HTTP MCP endpoint. Local commands and legacy SSE endpoints are not supported here."
            >
              <FieldGroup className="mt-5">
                <Field>
                  <FieldLabel htmlFor="mcp-name">Display name</FieldLabel>
                  <Input
                    id="mcp-name"
                    placeholder="Company knowledge"
                    required
                    maxLength={120}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="mcp-id">Server ID</FieldLabel>
                  <Input
                    id="mcp-id"
                    placeholder="company-knowledge"
                    required
                    minLength={2}
                    maxLength={40}
                    pattern="[a-z0-9][a-z0-9-]{0,38}[a-z0-9]"
                    value={id}
                    disabled={!!storedCredential}
                    onChange={(e) => {
                      setId(e.target.value);
                      setCredentialId("");
                    }}
                    aria-describedby="mcp-id-help"
                  />
                  <FieldDescription id="mcp-id-help">
                    A unique ID: 2–40 lowercase letters, numbers or hyphens.
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="mcp-url">MCP endpoint URL</FieldLabel>
                  <Input
                    id="mcp-url"
                    type="url"
                    placeholder="https://mcp.example.com/mcp"
                    autoComplete="off"
                    required
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    aria-describedby="mcp-url-help"
                  />
                  <FieldDescription id="mcp-url-help">
                    HTTPS only. Keep secrets out of the URL; use a bearer token
                    below.
                  </FieldDescription>
                </Field>
              </FieldGroup>
            </PageSection>
            <PageSection
              title="Authentication"
              description="Tokens are saved in OpenBot’s encrypted credential store and are never shown again."
            >
              <FieldGroup className="mt-5">
                <Field>
                  <FieldLabel htmlFor="mcp-auth">
                    Authentication method
                  </FieldLabel>
                  <Select
                    items={{
                      none: "No authentication",
                      new: "New bearer token",
                      saved: "Saved MCP credential",
                    }}
                    value={auth}
                    disabled={!!storedCredential}
                    onValueChange={(v) => {
                      setAuth(v ?? "none");
                      setToken("");
                      setCredentialId("");
                    }}
                  >
                    <SelectTrigger id="mcp-auth" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No authentication</SelectItem>
                      <SelectItem value="new">New bearer token</SelectItem>
                      <SelectItem value="saved">
                        Saved MCP credential
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                {auth === "new" && !storedCredential ? (
                  <Field>
                    <FieldLabel htmlFor="mcp-token">Bearer token</FieldLabel>
                    <Input
                      id="mcp-token"
                      type="password"
                      autoComplete="new-password"
                      required
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                    />
                  </Field>
                ) : null}
                {storedCredential ? (
                  <p className="text-sm text-muted-foreground">
                    Token saved securely. Retrying will reuse this credential.
                  </p>
                ) : null}
                {auth === "saved" ? (
                  <Field>
                    <FieldLabel htmlFor="mcp-credential">
                      Saved credential
                    </FieldLabel>
                    <Select
                      items={Object.fromEntries(
                        available.map((c) => [
                          c.id,
                          c.metadata?.label ?? c.keyId,
                        ]),
                      )}
                      value={credentialId}
                      onValueChange={(v) => setCredentialId(v ?? "")}
                    >
                      <SelectTrigger id="mcp-credential" className="w-full">
                        <SelectValue placeholder="Choose a credential" />
                      </SelectTrigger>
                      <SelectContent>
                        {available.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.metadata?.label ?? c.keyId}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FieldDescription>
                      Only active MCP credentials matching this server ID appear
                      here.
                    </FieldDescription>
                  </Field>
                ) : null}
              </FieldGroup>
            </PageSection>
            <div className="mt-8">
              <Button
                type="submit"
                disabled={
                  plugins.isPending ||
                  credentials.isPending ||
                  !!plugins.error ||
                  !!credentials.error
                }
              >
                {busy ? "Connecting…" : "Add and test connection"}
              </Button>
            </div>
          </fieldset>
        </form>
      )}
      {plugins.isPending || credentials.isPending ? (
        <p role="status" className="mt-4 text-sm text-muted-foreground">
          Loading servers and credentials…
        </p>
      ) : null}
      {plugins.error || credentials.error ? (
        <p role="alert" className="mt-4 text-sm text-destructive">
          Could not load servers or credentials. Reload before adding a server.
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="mt-4 pb-6 text-sm text-destructive break-words"
        >
          {error}
        </p>
      ) : null}
    </PageShell>
  );
}
