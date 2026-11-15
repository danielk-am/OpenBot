import {timingSafeEqual} from 'node:crypto';
export function sameSecret(a,b){if(typeof a!=='string'||typeof b!=='string')return false;const left=Buffer.from(a),right=Buffer.from(b);return left.length===right.length&&timingSafeEqual(left,right);}
export async function readJson(req,limit=128*1024){let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>limit)throw Error('Configuration is too large.');chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString()||'{}');}
export function json(res,status,body){res.writeHead(status,{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(body));}
