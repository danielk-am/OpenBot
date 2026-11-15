import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { PageSection, PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Textarea } from "@/components/ui/textarea";
import { client } from "@/lib/client";
import { useManagePaths } from "@/lib/manage-paths";
import {
  type McpCredential,
  validateCustomMcp,
} from "@/lib/plugins/custom-mcp";
import {
  type PluginServer,
  pluginsPageQueryOptions,
} from "@/lib/plugins/queries";

const API = "/api/plugins/adapter";
type Managed = {
  auth?: string;
  id: string;
  title: string;
  transport: "http" | "stdio";
  status: string;
  toolsCount: number;
  lastError?: string;
  credentialId?: string;
  registrationToken?: string;
  authorizationUrl?: string;
  headerNames?: string[];
};
type Pair = { id: string; name: string; value: string };
const LIST_KEY = ["mcp-adapter", "servers"];
function PairFields({
  kind,
  rows,
  setRows,
}: {
  kind: "Header" | "Environment";
  rows: Pair[];
  setRows: (rows: Pair[]) => void;
}) {
  return (
    <div className="space-y-3">
      {rows.map((row, index) => (
        <div className="flex flex-wrap items-end gap-2" key={row.id}>
          <Field className="min-w-40 flex-1">
            <FieldLabel htmlFor={`${kind}-name-${index}`}>
              {kind} name {index + 1}
            </FieldLabel>
            <Input
              id={`${kind}-name-${index}`}
              required
              value={row.name}
              onChange={(e) =>
                setRows(
                  rows.map((v, i) =>
                    i === index ? { ...v, name: e.target.value } : v,
                  ),
                )
              }
            />
          </Field>
          <Field className="min-w-40 flex-1">
            <FieldLabel htmlFor={`${kind}-value-${index}`}>
              {kind} value {index + 1}
            </FieldLabel>
            <Input
              id={`${kind}-value-${index}`}
              type="password"
              autoComplete="new-password"
              value={row.value}
              onChange={(e) =>
                setRows(
                  rows.map((v, i) =>
                    i === index ? { ...v, value: e.target.value } : v,
                  ),
                )
              }
            />
          </Field>
          <Button
            type="button"
            variant="ghost"
            aria-label={`Remove ${kind.toLowerCase()} ${index + 1}`}
            onClick={() => setRows(rows.filter((_, i) => i !== index))}
          >
            Remove
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        onClick={() =>
          setRows([...rows, { id: crypto.randomUUID(), name: "", value: "" }])
        }
      >
        Add {kind === "Header" ? "header" : "environment variable"}
      </Button>
    </div>
  );
}
function pairsToObject(rows: Pair[]) {
  const seen = new Set<string>();
  const result: Record<string, string> = {};
  for (const row of rows) {
    const key = row.name.trim();
    if (!key || seen.has(key.toLowerCase()))
      throw Error("Use a unique name for each header or environment variable.");
    seen.add(key.toLowerCase());
    result[key] = row.value;
  }
  return result;
}
export function AdvancedMcpPage({ onLegacy }: { onLegacy: () => void }) {
  const paths = useManagePaths(),
    cache = useQueryClient();
  const plugins = useQuery(pluginsPageQueryOptions());
  const managed = useQuery({
    queryKey: LIST_KEY,
    queryFn: () => client<Managed[]>(`${API}/servers`, "servers"),
  });
  const [transport, setTransport] = useState("http"),
    [auth, setAuth] = useState("auto");
  const [id, setId] = useState(""),
    [title, setTitle] = useState(""),
    [url, setUrl] = useState(""),
    [token, setToken] = useState("");
  const [command, setCommand] = useState("npx"),
    [args, setArgs] = useState("[]");
  const [headers, setHeaders] = useState<Pair[]>([]),
    [env, setEnv] = useState<Pair[]>([]);
  const [clientId, setClientId] = useState(""),
    [clientSecret, setClientSecret] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(
      new URLSearchParams(location.search).get("oauth") === "failed"
        ? "Sign-in did not finish. Reconnect the server below to try again."
        : "",
    );
  const [selected, setSelected] = useState<Managed>(),
    [result, setResult] = useState<PluginServer>(),
    [remove, setRemove] = useState<Managed>();
  const initialized = useRef(false);
  const invalidate = () =>
    Promise.all([
      cache.invalidateQueries({ queryKey: ["plugins"] }),
      cache.invalidateQueries({ queryKey: LIST_KEY }),
    ]);
  async function credential(server: Managed) {
    if (server.credentialId) {
      const credentials = await client<McpCredential[]>(
        "/api/admin/credentials",
        "credentials",
      );
      if (
        credentials.some(
          (c) =>
            c.id === server.credentialId &&
            c.kind === "mcp" &&
            c.provider === server.id &&
            !c.revokedAt,
        )
      )
        return server.credentialId;
    }
    let registrationToken = server.registrationToken;
    if (!registrationToken) {
      const response = await client(
        `${API}/servers/${server.id}/registration-token`,
        { method: "POST", body: {} },
      );
      registrationToken = (await response.json()).registrationToken;
    }
    const saved = await client<{ id: string }>(
      "/api/admin/credentials",
      "credential",
      {
        method: "POST",
        body: {
          kind: "mcp",
          provider: server.id,
          keyId: `mcp-managed-${crypto.randomUUID()}`,
          metadata: { label: server.title, managed: true },
          plaintext: registrationToken,
        },
      },
    );
    await client(`${API}/servers/${server.id}/credential`, {
      method: "POST",
      body: { credentialId: saved.id },
    });
    server.credentialId = saved.id;
    delete server.registrationToken;
    return saved.id;
  }
  async function finish(server: Managed) {
    setSelected(server);
    const credentialId = await credential(server);
    if (server.status === "oauth_required" && server.authorizationUrl) {
      const destination = new URL(server.authorizationUrl);
      if (
        destination.protocol !== "https:" &&
        destination.origin !== location.origin
      )
        throw Error("The sign-in address must use HTTPS.");
      location.assign(destination.href);
      return;
    }
    if (server.status !== "connected")
      throw Error(
        server.lastError ??
          "The connection needs attention. Check its configuration and try again.",
      );
    const existing = plugins.data?.servers.find((s) => s.id === server.id);
    if (existing && existing.url !== `openbot-mcp://${server.id}`)
      throw new Error(
        "That ID belongs to another OpenBot connection. Choose a different server ID.",
      );
    setResult(
      await client<PluginServer>("/api/plugins/servers/custom", "server", {
        method: "POST",
        body: {
          id: server.id,
          title: server.title,
          url: `openbot-mcp://${server.id}`,
          credentialId,
        },
      }),
    );
    await invalidate();
  }
  const resumeOAuth = useEffectEvent((server: Managed) => {
    setBusy(true);
    finish(server)
      .catch((e) => setError(e.message))
      .finally(() => setBusy(false));
  });
  useEffect(() => {
    const id = new URLSearchParams(location.search).get("managed");
    if (!id || initialized.current || !managed.data || !plugins.data) return;
    const server = managed.data.find((s) => s.id === id);
    if (!server) return;
    initialized.current = true;
    resumeOAuth(server);
  }, [managed.data, plugins.data]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    let payload: Record<string, unknown>;
    try {
      const invalid = validateCustomMcp(
        {
          id: id.trim(),
          title: title.trim(),
          url: transport === "http" ? url.trim() : "https://example.com/mcp",
        },
        [
          ...(plugins.data?.servers ?? []).map((s) => s.id),
          ...(managed.data ?? []).map((s) => s.id),
        ],
      );
      if (invalid) throw Error(invalid);
      let argv: unknown = [];
      if (transport === "stdio") {
        try {
          argv = JSON.parse(args);
        } catch {
          throw Error("Arguments must be a JSON array of strings.");
        }
        if (!Array.isArray(argv) || argv.some((a) => typeof a !== "string"))
          throw Error("Arguments must be a JSON array of strings.");
      }
      payload = {
        id: id.trim(),
        title: title.trim(),
        transport,
        ...(transport === "http"
          ? {
              url: url.trim(),
              auth,
              headers: pairsToObject(headers),
              ...(token ? { token } : {}),
              ...(clientId ? { clientId, clientSecret } : {}),
            }
          : { command: command.trim(), args: argv, env: pairsToObject(env) }),
      };
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    setBusy(true);
    try {
      const server = await client<Managed>(`${API}/servers`, "server", {
        method: "POST",
        body: payload,
      });
      setToken("");
      setHeaders([]);
      setEnv([]);
      setClientSecret("");
      setSelected(server);
      await finish(server);
    } catch (e) {
      setError((e as Error).message);
      await invalidate();
    } finally {
      setBusy(false);
    }
  }
  async function reconnect(server: Managed, force = false) {
    setBusy(true);
    setError("");
    setResult(undefined);
    try {
      const view = await client<Managed>(
        `${API}/servers/${server.id}/${force ? "reauthorize" : "connect"}`,
        "server",
        { method: "POST", body: {} },
      );
      await finish(view);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      await invalidate();
    }
  }
  async function removeServer() {
    if (!remove) return;
    setBusy(true);
    setError("");
    try {
      if (plugins.data?.servers.some((s) => s.id === remove.id))
        await client(`/api/plugins/servers/${remove.id}`, { method: "DELETE" });
      else if (remove.credentialId)
        await client(`/api/admin/credentials/${remove.credentialId}/revoke`, {
          method: "POST",
        });
      await client(`${API}/servers/${remove.id}`, { method: "DELETE" });
      if (selected?.id === remove.id) {
        setSelected(undefined);
        setResult(undefined);
      }
      setRemove(undefined);
      await invalidate();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function preset(kind: string) {
    setTransport("http");
    setAuth("auto");
    setToken("");
    setHeaders([]);
    if (kind === "wordpress") {
      setTitle("WordPress.com");
      setId("wordpress-com");
      setUrl("https://public-api.wordpress.com/wpcom/v2/mcp/v1");
    } else {
      setTitle("n8n");
      setId("n8n");
      setUrl("https://n8n.example.com/mcp-server/http");
    }
  }
  return (
    <PageShell
      title="Add MCP server"
      description="Connect with browser sign-in, custom HTTP headers, or a STDIO process. Review its tools and access in OpenBot."
      backButton={{ label: paths.pluginsLabel, linkProps: paths.plugins() }}
    >
      {result ? (
        <PageSection title="Server connected">
          <p role="status" className="mt-4 text-sm">
            {result.title} · {result.tools.length} tools discovered
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button render={<Link {...paths.plugin(result.id)} />}>
              Review tools and access
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                setResult(undefined);
                setSelected(undefined);
                setId("");
                setTitle("");
              }}
            >
              Add another server
            </Button>
          </div>
        </PageSection>
      ) : (
        <form onSubmit={submit} aria-busy={busy}>
          <fieldset disabled={busy} className="min-w-0">
            <legend className="sr-only">MCP connection settings</legend>
            <PageSection title="Server details">
              <div className="mb-5 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => preset("n8n")}
                >
                  n8n example
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => preset("wordpress")}
                >
                  WordPress.com example
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onLegacy}
                >
                  Use a saved OpenBot credential
                </Button>
              </div>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="advanced-name">Display name</FieldLabel>
                  <Input
                    id="advanced-name"
                    required
                    maxLength={120}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="advanced-id">Server ID</FieldLabel>
                  <Input
                    id="advanced-id"
                    required
                    minLength={2}
                    maxLength={40}
                    pattern="[a-z0-9][a-z0-9-]{0,38}[a-z0-9]"
                    value={id}
                    onChange={(e) => setId(e.target.value)}
                  />
                  <FieldDescription>
                    A unique ID with lowercase letters, numbers and hyphens.
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="advanced-transport">
                    Connection type
                  </FieldLabel>
                  <Select
                    items={{ http: "Remote HTTP", stdio: "STDIO process" }}
                    value={transport}
                    onValueChange={(v) => setTransport(v ?? "http")}
                  >
                    <SelectTrigger id="advanced-transport" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="http">Remote HTTP</SelectItem>
                      <SelectItem value="stdio">STDIO process</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                {transport === "http" ? (
                  <Field>
                    <FieldLabel htmlFor="advanced-url">
                      MCP endpoint URL
                    </FieldLabel>
                    <Input
                      id="advanced-url"
                      type="url"
                      required
                      placeholder="https://mcp.example.com/mcp"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                    />
                    <FieldDescription>
                      Use the MCP endpoint. A normal REST API URL does not speak
                      MCP.
                    </FieldDescription>
                  </Field>
                ) : (
                  <>
                    <Field>
                      <FieldLabel htmlFor="advanced-command">
                        Command
                      </FieldLabel>
                      <Input
                        id="advanced-command"
                        required
                        value={command}
                        onChange={(e) => setCommand(e.target.value)}
                      />
                      <FieldDescription>
                        Runs inside the isolated runner on this OpenBot server.
                        Enter the executable only, such as npx, node, python3 or
                        uvx.
                      </FieldDescription>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="advanced-args">
                        Arguments (JSON array)
                      </FieldLabel>
                      <Textarea
                        id="advanced-args"
                        required
                        value={args}
                        onChange={(e) => setArgs(e.target.value)}
                        spellCheck={false}
                      />
                    </Field>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setTitle("STDIO demo");
                        setId("stdio-demo");
                        setCommand("node");
                        setArgs('["/app/fixtures/stdio-demo.mjs"]');
                      }}
                    >
                      Load STDIO example
                    </Button>
                  </>
                )}
              </FieldGroup>
            </PageSection>
            {transport === "http" ? (
              <PageSection
                title="Authentication"
                description="Sign-in and header secrets are encrypted on the server. They are never shown again."
              >
                <FieldGroup className="mt-5">
                  <Field>
                    <FieldLabel htmlFor="advanced-auth">
                      Authentication method
                    </FieldLabel>
                    <Select
                      items={{
                        auto: "Automatic (recommended)",
                        oauth: "OAuth sign-in",
                        none: "No authentication",
                        bearer: "Bearer token",
                        headers: "Custom headers",
                      }}
                      value={auth}
                      onValueChange={(v) => {
                        setAuth(v ?? "auto");
                        setToken("");
                      }}
                    >
                      <SelectTrigger id="advanced-auth" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">
                          Automatic (recommended)
                        </SelectItem>
                        <SelectItem value="oauth">OAuth sign-in</SelectItem>
                        <SelectItem value="none">No authentication</SelectItem>
                        <SelectItem value="bearer">Bearer token</SelectItem>
                        <SelectItem value="headers">Custom headers</SelectItem>
                      </SelectContent>
                    </Select>
                    <FieldDescription>
                      {["auto", "oauth"].includes(auth)
                        ? "OpenBot discovers the provider’s sign-in flow. You’ll approve access on the provider’s own page."
                        : "Headers are sent only to this MCP endpoint."}
                    </FieldDescription>
                  </Field>
                  {auth === "bearer" ? (
                    <Field>
                      <FieldLabel htmlFor="advanced-token">
                        Bearer token
                      </FieldLabel>
                      <Input
                        id="advanced-token"
                        type="password"
                        autoComplete="new-password"
                        required
                        value={token}
                        onChange={(e) => setToken(e.target.value)}
                      />
                    </Field>
                  ) : null}
                  <PairFields
                    kind="Header"
                    rows={headers}
                    setRows={setHeaders}
                  />
                  {["auto", "oauth"].includes(auth) ? (
                    <details className="text-sm">
                      <summary className="cursor-pointer font-medium">
                        Use an existing OAuth client (optional)
                      </summary>
                      <FieldGroup className="mt-4">
                        <Field>
                          <FieldLabel htmlFor="advanced-client">
                            Client ID
                          </FieldLabel>
                          <Input
                            id="advanced-client"
                            value={clientId}
                            onChange={(e) => setClientId(e.target.value)}
                          />
                        </Field>
                        <Field>
                          <FieldLabel htmlFor="advanced-client-secret">
                            Client secret
                          </FieldLabel>
                          <Input
                            id="advanced-client-secret"
                            type="password"
                            autoComplete="new-password"
                            value={clientSecret}
                            onChange={(e) => setClientSecret(e.target.value)}
                          />
                        </Field>
                      </FieldGroup>
                    </details>
                  ) : null}
                </FieldGroup>
              </PageSection>
            ) : (
              <PageSection
                title="Environment variables"
                description="Only these application variables are passed to the process. Values are encrypted and never shown again."
              >
                <div className="mt-5">
                  <PairFields kind="Environment" rows={env} setRows={setEnv} />
                </div>
              </PageSection>
            )}
            <div className="mt-8">
              <Button
                type="submit"
                disabled={!plugins.data || managed.isPending || !!managed.error}
              >
                {busy ? "Connecting…" : "Add and connect"}
              </Button>
            </div>
          </fieldset>
        </form>
      )}
      {error ? (
        <p role="alert" className="mt-5 break-words text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {managed.error ? (
        <p role="alert" className="mt-5 text-sm text-destructive">
          Could not load managed connections. Reload the page.
        </p>
      ) : null}
      {(managed.data?.length ?? 0) > 0 ? (
        <PageSection
          title="Managed connections"
          description="Test or reconnect a saved connection. Its original secret values are never returned."
        >
          <div className="mt-4 divide-y rounded-xl border px-4">
            {managed.data?.map((server) => (
              <div
                key={server.id}
                className="flex flex-wrap items-center justify-between gap-3 py-4"
              >
                <div className="min-w-0">
                  <p className="font-medium text-sm">{server.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {server.transport.toUpperCase()} ·{" "}
                    {server.status.replaceAll("_", " ")} · {server.toolsCount}{" "}
                    tools
                  </p>
                  {server.headerNames?.length ? (
                    <p className="text-xs text-muted-foreground">
                      Headers: {server.headerNames.join(", ")}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => reconnect(server)}
                  >
                    Test / connect
                  </Button>
                  {server.transport === "http" &&
                  ["auto", "oauth"].includes(server.auth ?? "") ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => reconnect(server, true)}
                    >
                      Sign in again
                    </Button>
                  ) : null}
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={busy}
                    onClick={() => setRemove(server)}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </PageSection>
      ) : null}
      <Dialog
        open={!!remove}
        onOpenChange={(open) => {
          if (!open) setRemove(undefined);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {remove?.title}?</DialogTitle>
            <DialogDescription>
              This removes the saved connection and its Bot access here. A
              provider’s own account settings may also offer revocation of OAuth
              access.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemove(undefined)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={removeServer}
            >
              Remove connection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
