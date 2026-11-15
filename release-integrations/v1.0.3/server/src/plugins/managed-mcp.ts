/** Optional private adapter for transports that this pinned backend release does not implement. */
type AdapterEnvironment = Record<string, string | undefined>;
const ID = /^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$/;
function adapterBase(env: AdapterEnvironment): URL | null {
  if (!env.MCP_ADAPTER_INTERNAL_URL || !env.MCP_ADAPTER_ADMIN_TOKEN)
    return null;
  const url = new URL(env.MCP_ADAPTER_INTERNAL_URL);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw new Error("Invalid private MCP adapter configuration.");
  return url;
}
export function managedMcpAllowed(
  raw: string,
  id: string,
  env: AdapterEnvironment = process.env,
): boolean {
  return (
    ID.test(id) && raw === `openbot-mcp://${id}` && adapterBase(env) !== null
  );
}
export function managedMcpEndpoint(
  raw: string,
  env: AdapterEnvironment = process.env,
): URL {
  if (!raw.startsWith("openbot-mcp:")) return new URL(raw);
  const id = raw.slice("openbot-mcp://".length);
  const base = adapterBase(env);
  if (!base || !managedMcpAllowed(raw, id, env))
    throw new Error("This managed MCP connection is unavailable.");
  return new URL(`/mcp/${id}`, base);
}
export async function proxyManagedMcp(
  request: Request,
  actor: string,
  env: AdapterEnvironment = process.env,
): Promise<Response> {
  const base = adapterBase(env);
  if (!base)
    return Response.json(
      { error: "Advanced MCP connections are not enabled." },
      { status: 404 },
    );
  const incoming = new URL(request.url);
  const suffix = incoming.pathname.replace(/^\/api\/plugins\/adapter\//, "");
  if (
    !/^(status|oauth\/callback|servers(?:\/[a-z0-9-]{2,40}(?:\/(?:connect|credential|registration-token|reauthorize))?)?)$/.test(
      suffix,
    )
  )
    return Response.json({ error: "Not found." }, { status: 404 });
  const target = new URL(`/admin/${suffix}`, base);
  target.search = incoming.search;
  const body = ["GET", "HEAD"].includes(request.method)
    ? undefined
    : await request.arrayBuffer();
  if (body && body.byteLength > 128 * 1024)
    return Response.json(
      { error: "MCP configuration is too large." },
      { status: 413 },
    );
  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers: {
        authorization: `Bearer ${env.MCP_ADAPTER_ADMIN_TOKEN}`,
        "x-openbot-actor": actor,
        "content-type": "application/json",
      },
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(90_000),
    });
    const headers = new Headers({
      "content-type":
        upstream.headers.get("content-type") ?? "application/json",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
    });
    const location = upstream.headers.get("location");
    if (
      location &&
      /^\/(?:admin\/plugins|connections)\/composio\/add-mcp-server(?:\?|$)/.test(location) &&
      !location.startsWith("//")
    )
      headers.set("location", location);
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch {
    return Response.json(
      {
        error: "The MCP connection service is unavailable. Try again shortly.",
      },
      { status: 502 },
    );
  }
}
