import http from 'node:http';import {randomBytes} from 'node:crypto';import {pathToFileURL} from 'node:url';import {Server} from '@modelcontextprotocol/sdk/server/index.js';import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';import {ListToolsRequestSchema,CallToolRequestSchema} from '@modelcontextprotocol/sdk/types.js';import {Vault} from './vault.mjs';import {Upstreams} from './upstreams.mjs';import {validateConfig,publicView} from './config.mjs';import {readJson,json,sameSecret} from './http.mjs';
export async function createAdapter({stateDir,adminToken,publicUrl,runnerUrl,runnerToken,landingPath="/admin/plugins/composio/add-mcp-server",upstreamOptions={}}={}){
 if(!adminToken||adminToken.length<32)throw Error('Adapter token missing.');if(!['/admin/plugins/composio/add-mcp-server','/connections/composio/add-mcp-server'].includes(landingPath))throw Error('Invalid MCP landing path.');const origin=new URL(publicUrl);if(origin.pathname!=='/'||origin.username||origin.password)throw Error('Configure the OpenBot public origin.');
 const vault=await Vault.open(stateDir);const upstream=new Upstreams({vault,publicUrl:origin.origin,runnerUrl,runnerToken,...upstreamOptions});
 const server=http.createServer(async(req,res)=>{const url=new URL(req.url,'http://adapter');
 if(url.pathname==='/health'){json(res,200,{ok:true});return;}
 if(url.pathname.startsWith('/mcp/')){const id=url.pathname.slice(5);const config=vault.data.servers[id];if(!config||!sameSecret(req.headers.authorization,'Bearer '+config.bridgeToken)){json(res,401,{error:'Unauthorized.'});return;}
  const mcp=new Server({name:'OpenBot MCP adapter',version:'0.1.0'},{capabilities:{tools:{}}});mcp.setRequestHandler(ListToolsRequestSchema,async r=>{try{return await upstream.rpc(config,'tools/list',r.params??{});}catch{throw Error('Could not discover MCP tools. Reconnect or check the connection in Plugins.');}});mcp.setRequestHandler(CallToolRequestSchema,async r=>{try{return await upstream.rpc(config,'tools/call',r.params);}catch{return {isError:true,content:[{type:'text',text:'The MCP server could not complete this call. Reconnect or check its configuration in Plugins.'}]};}});const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined});res.on('close',()=>{void transport.close();void mcp.close();});try{await mcp.connect(transport);await transport.handleRequest(req,res,req.method==='POST'?await readJson(req):undefined);}catch{if(!res.headersSent)json(res,502,{error:'MCP connection failed. Check its configuration in Plugins.'});else res.end();}return;
 }
 const actor=req.headers['x-openbot-actor'];if(!sameSecret(req.headers.authorization,'Bearer '+adminToken)||typeof actor!=='string'||!actor){json(res,401,{error:'Unauthorized.'});return;}
 if(url.pathname==='/admin/status'){json(res,200,{enabled:true,transports:['http','stdio'],authentication:['auto','oauth','none','bearer','headers'],callbackUrl:origin.origin+'/api/plugins/adapter/oauth/callback'});return;}
 if(url.pathname==='/admin/oauth/callback'){
  let id='';try{const view=await upstream.finish(url.searchParams,actor);id=view.id;}catch{}
  // Fixed same-origin landing page; neither the code nor an upstream error is copied into the URL.
  const target=landingPath+(id?'?managed='+encodeURIComponent(id):'?oauth=failed');res.writeHead(303,{location:target,'cache-control':'no-store','referrer-policy':'no-referrer'});res.end();return;
 }
 if(url.pathname==='/admin/servers'&&req.method==='GET'){json(res,200,{servers:Object.values(vault.data.servers).map(s=>({...publicView(s),credentialId:s.credentialId}))});return;}
 if(url.pathname==='/admin/servers'&&req.method==='POST'){
  let config;try{config=validateConfig(await readJson(req));}catch(e){json(res,400,{error:e.message});return;}
  if(vault.data.servers[config.id]){json(res,409,{error:'That managed server ID already exists. Reconnect or remove it below.'});return;}
  config.bridgeToken=randomBytes(32).toString('base64url');config.owner=actor;vault.data.servers[config.id]=config;await vault.save();let view;try{view=await upstream.discover(config,actor);}catch{view=publicView(config);}json(res,201,{server:{...view,registrationToken:config.bridgeToken}});return;
 }
 const match=url.pathname.match(/^\/admin\/servers\/([a-z0-9-]{2,40})(?:\/(connect|credential|registration-token|reauthorize))?$/);if(!match){json(res,404,{error:'Not found.'});return;}const config=vault.data.servers[match[1]];if(!config){json(res,404,{error:'That managed server does not exist.'});return;}
 if(config.owner!==actor){json(res,403,{error:'Only the administrator who added this shared connection can reconnect it.'});return;}
 try{
  if(req.method==='DELETE'){await upstream.remove(config);json(res,200,{ok:true});return;}
  if(req.method==='GET'){json(res,200,{server:{...publicView(config),credentialId:config.credentialId}});return;}
  if(req.method==='POST'&&match[2]==='credential'){const body=await readJson(req);if(typeof body.credentialId!=='string'||body.credentialId.length>100)throw Error();config.credentialId=body.credentialId;await vault.save();json(res,200,{ok:true});return;}
  if(req.method==='POST'&&match[2]==='registration-token'){config.bridgeToken=randomBytes(32).toString('base64url');await vault.save();json(res,200,{registrationToken:config.bridgeToken});return;}
  if(req.method==='POST'&&['connect','reauthorize'].includes(match[2])){if(match[2]==='reauthorize'&&config.oauth){delete config.oauth.tokens;delete config.oauth.pending;delete config.oauth.authorizationUrl;delete config.oauth.verifier;await vault.save();}let view;try{view=await upstream.discover(config,actor);}catch{view=publicView(config);}json(res,200,{server:{...view,credentialId:config.credentialId}});return;}
  json(res,405,{error:'Method not allowed.'});
 }catch{json(res,400,{error:'Could not update the MCP connection. Try again.'});}
 });server.requestTimeout=90000;return {server,vault,upstream};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const {server}=await createAdapter({stateDir:process.env.STATE_DIR??'/state',adminToken:process.env.MCP_ADAPTER_ADMIN_TOKEN,publicUrl:process.env.OPENBOT_MCP_PUBLIC_URL,runnerUrl:process.env.MCP_RUNNER_URL??'http://mcp-runner:3331',runnerToken:process.env.MCP_RUNNER_TOKEN,landingPath:process.env.MCP_LANDING_PATH??"/admin/plugins/composio/add-mcp-server"});server.listen(Number(process.env.PORT??3330),'0.0.0.0');for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));}
