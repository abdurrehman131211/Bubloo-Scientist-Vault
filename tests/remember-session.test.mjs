import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRememberedSession,REMEMBER_KEY} from '../remember-session.js';
const storage=()=>{const values=new Map();return {getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};};
const session=(token='refresh-1')=>({access_token:'access-1',refresh_token:token,expires_in:3600,user:{id:'owner',email:'user@example.com'}});
const response=(body,status=200)=>({ok:status===200,status,json:async()=>body});
const setup=(s,extra={})=>createRememberedSession({url:'https://example.supabase.co',apiKey:'public',storage:s,...extra});
test('unchecked sign-in stays in memory; remembered sign-in stores only a refresh credential',()=>{
 const s=storage(),manager=setup(s);manager.set(session(),false);assert.equal(s.getItem(REMEMBER_KEY),null);assert.equal(manager.get().user.id,'owner');
 manager.set({...session(),master:'never-store-this',password:'never-store-password'},true);const saved=JSON.parse(s.getItem(REMEMBER_KEY));assert.deepEqual(Object.keys(saved).sort(),['refresh_token','user_id','v']);assert.equal(JSON.stringify(saved).includes('never-store'),false);manager.clear();assert.equal(s.getItem(REMEMBER_KEY),null);
});
test('restore validates with the server and saves rotated refresh token',async()=>{
 const s=storage();setup(s).set(session(),true);let sent;
 const manager=setup(s,{fetcher:async(url,options)=>{sent={url,body:JSON.parse(options.body)};return response(session('rotated'));}});
 const restored=await manager.restore();assert.equal(restored.user.id,'owner');assert.match(sent.url,/grant_type=refresh_token$/);assert.equal(sent.body.refresh_token,'refresh-1');assert.equal(JSON.parse(s.getItem(REMEMBER_KEY)).refresh_token,'rotated');
});
test('parallel requests share one refresh and sign out cannot resurrect an in-flight session',async()=>{
 const s=storage();let time=0,calls=0,finish;
 const manager=setup(s,{now:()=>time,fetcher:()=>{calls++;return new Promise(r=>finish=r);}});manager.set(session(),true);time=3600000;
 const a=manager.ensureFresh(),b=manager.ensureFresh();assert.equal(calls,1);manager.clear();finish(response(session('rotated')));await Promise.all([a,b]);assert.equal(manager.get(),null);assert.equal(s.getItem(REMEMBER_KEY),null);
});
test('invalid refresh clears remembered sign-in; temporary network failure preserves it',async()=>{
 const s=storage();setup(s).set(session(),true);await assert.rejects(()=>setup(s,{fetcher:async()=>response({},400)}).restore());assert.equal(s.getItem(REMEMBER_KEY),null);
 setup(s).set(session(),true);await assert.rejects(()=>setup(s,{fetcher:async()=>{throw new TypeError('offline');}}).restore());assert.ok(s.getItem(REMEMBER_KEY));
});
test('another tab signing out clears current remembered account',()=>{
 const s=storage(),manager=setup(s);manager.set(session(),true);s.removeItem(REMEMBER_KEY);manager.storageChanged();assert.equal(manager.get(),null);
});
