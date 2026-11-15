import { expect, test } from "bun:test";
import {
  managedMcpAllowed,
  managedMcpEndpoint,
  proxyManagedMcp,
} from "../src/plugins/managed-mcp";

const env = {
  MCP_ADAPTER_INTERNAL_URL: "http://mcp-adapter:3330",
  MCP_ADAPTER_ADMIN_TOKEN: "a".repeat(40),
};
test("managed MCP URI requires explicit configuration and the exact server ID", () => {
  expect(
    managedMcpAllowed("openbot-mcp://demo-server", "demo-server", env),
  ).toBe(true);
  for (const raw of [
    "openbot-mcp://other-server",
    "openbot-mcp://demo-server/elsewhere",
    "openbot-mcp://demo-server?secret=x",
  ])
    expect(managedMcpAllowed(raw, "demo-server", env)).toBe(false);
  expect(
    managedMcpAllowed("openbot-mcp://demo-server", "demo-server", {}),
  ).toBe(false);
  expect(managedMcpEndpoint("openbot-mcp://demo-server", env).href).toBe(
    "http://mcp-adapter:3330/mcp/demo-server",
  );
  expect(managedMcpEndpoint("https://example.com/mcp", env).href).toBe(
    "https://example.com/mcp",
  );
});
test("admin proxy is unavailable when not configured", async () => {
  const response = await proxyManagedMcp(
    new Request("http://localhost/api/plugins/adapter/status"),
    "admin",
    {},
  );
  expect(response.status).toBe(404);
});
test('OAuth proxy preserves exact local and hosted landing routes, but no external redirect', async()=>{
  const original=global.fetch;
  try{
    for(const location of ['/admin/plugins/composio/add-mcp-server?managed=demo','/connections/composio/add-mcp-server?managed=demo','https://evil.example/']){
      global.fetch=(async()=>new Response(null,{status:303,headers:{location}})) as typeof fetch;
      const response=await proxyManagedMcp(new Request('http://localhost/api/plugins/adapter/oauth/callback?state=test'),'admin',env);
      expect(response.headers.get('location')).toBe(location.startsWith('https:')?null:location);
    }
  }finally{global.fetch=original;}
});
