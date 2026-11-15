const ID=/^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$/;
const FORBIDDEN=new Set(['host','connection','content-length','transfer-encoding','upgrade','proxy-authorization','proxy-connection','accept','content-type','mcp-session-id','mcp-protocol-version','origin']);
export function validateConfig(input){
 if(!input||!ID.test(input.id)||typeof input.title!=='string'||!input.title.trim()||input.title.length>120)throw Error('Enter a name and a unique 2–40 character server ID.');
 const out={id:input.id,title:input.title.trim(),transport:input.transport};
 if(input.transport==='http'){
  const url=new URL(input.url);if(url.protocol!=='https:'||url.username||url.password||url.hash)throw Error('Use a public HTTPS MCP URL without credentials or fragments.');
  for(const name of url.searchParams.keys())if(/token|password|secret|api.?key|authorization/i.test(name))throw Error('Put secrets in headers, not the URL.');
  out.url=url.href;out.auth=input.auth??'auto';if(!['auto','none','bearer','headers','oauth'].includes(out.auth))throw Error('Choose an authentication method.');
  out.headers=stringMap(input.headers??{},'headers',24);const seen=new Set();for(const [key,value] of Object.entries(out.headers)){const lower=key.toLowerCase();if(!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(key)||FORBIDDEN.has(lower)||seen.has(lower)||/[\r\n\0]/.test(value)||(!['headers','bearer'].includes(out.auth)&&lower==='authorization'))throw Error('Use unique HTTP header names and single-line values. Protocol-owned headers cannot be overridden.');seen.add(lower);}
  if(input.token){if(typeof input.token!=='string'||/[\r\n\0]/.test(input.token)||input.token.length>8192)throw Error('Enter a valid token.');if(seen.has('authorization'))throw Error('Choose either a bearer token or an Authorization header.');out.headers.Authorization='Bearer '+input.token.trim();}
  if(out.auth==='bearer'&&!out.headers.Authorization)throw Error('Enter a bearer token.');
  if(input.clientId){if(typeof input.clientId!=='string'||input.clientId.length>1024)throw Error('Invalid OAuth client ID.');out.oauth={client:{client_id:input.clientId,...(input.clientSecret?{client_secret:input.clientSecret}:{})}};}
 }else if(input.transport==='stdio'){
  if(typeof input.command!=='string'||!/^[A-Za-z0-9_.+-]{1,80}$/.test(input.command))throw Error('Enter one executable name, with arguments separately.');
  if(!Array.isArray(input.args)||input.args.length>64||input.args.some(v=>typeof v!=='string'||v.length>8192||v.includes('\0')))throw Error('Arguments must be a JSON array of strings.');
  out.command=input.command;out.args=input.args;out.env=stringMap(input.env??{},'environment',32);
  for(const key of Object.keys(out.env))if(!/^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(key)||['PATH','HOME','TMPDIR','NODE_OPTIONS','NODE_PATH','LD_PRELOAD','LD_LIBRARY_PATH','PYTHONPATH','BASH_ENV','ENV'].includes(key))throw Error('Use application-specific environment variables; runtime environment overrides are not supported.');
 }else throw Error('Choose HTTP or STDIO.');return out;
}
function stringMap(value,label,max){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length>max||Object.entries(value).some(([k,v])=>!k||typeof v!=='string'||v.length>8192||v.includes('\0')))throw Error('Enter a JSON object of string '+label+'.');return {...value};}
export function publicView(server){return {id:server.id,title:server.title,transport:server.transport,url:server.url,command:server.command,argumentCount:server.args?.length,headerNames:Object.keys(server.headers??{}),environmentNames:Object.keys(server.env??{}),auth:server.auth,status:server.status??'saved',toolsCount:server.toolsCount??0,lastError:server.lastError??null,hasOAuthClient:!!server.oauth?.client,connected:!!server.oauth?.tokens};}
