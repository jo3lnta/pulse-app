import {test} from 'node:test';
import assert from 'node:assert/strict';
import {handleRequest} from '../supabase/functions/pulse-delete-account/index.ts';
const env={get:n=>n==='SUPABASE_URL'?'https://example.supabase.co':'server-only-key'};
const request=(body={confirmation:'DELETE'},auth='Bearer user-jwt')=>new Request('https://example.test',{method:'POST',headers:{Authorization:auth,'Content-Type':'application/json'},body:JSON.stringify(body)});
test('anonymous or unconfirmed deletion never calls admin API',async()=>{
 const noFetch=()=>{throw Error('must not fetch')};
 assert.equal((await handleRequest(request({},''),env,noFetch)).status,401);
 assert.equal((await handleRequest(request({}),env,noFetch)).status,400);
});
test('unverified tokens cannot delete accounts',async()=>{
 let calls=0;
 const res=await handleRequest(request(),env,async()=>{calls++;return new Response('{}',{status:401})});
 assert.equal(res.status,401);assert.equal(calls,1);
});
test('deletion uses verified identity and revokes sessions first',async()=>{
 const urls=[];
 const res=await handleRequest(request({confirmation:'DELETE',user_id:'someone-else'}),env,async(url,init)=>{
  urls.push(url);
  if(url.endsWith('/user'))return Response.json({id:'10000000-0000-4000-8000-000000000001'});
  if(url.includes('/logout'))return new Response(null,{status:204});
  assert.equal(init.method,'DELETE');return Response.json({});
 });
 assert.equal(res.status,200);assert.match(urls[1],/logout/);assert.match(urls[2],/10000000-0000-4000-8000-000000000001$/);
});
test('failed revocation prevents deletion',async()=>{
 let calls=0;
 const res=await handleRequest(request(),env,async()=>++calls===1?Response.json({id:'10000000-0000-4000-8000-000000000001'}):new Response('{}',{status:500}));
 assert.equal(res.status,503);assert.equal(calls,2);
});
