import {test} from 'node:test';
import assert from 'node:assert/strict';
import {salt,derive,seal,open} from '../crypto.js';
import {deriveMaterial,importVaultKey,protectMaterial,recoverMaterial,deviceContext} from '../device-crypto.js';
test('device enrollment derives the existing vault key without changing encrypted entries',async()=>{
 const vaultSalt=salt(),phrase='a long unique master passphrase';
 const existing=await derive(phrase,vaultSalt),raw=await deriveMaterial(phrase,vaultSalt);
 try{const candidate=await importVaultKey(raw);assert.equal(candidate.extractable,false);const payload=await seal(existing,{secret:'test-secret'},'owner:item');assert.deepEqual(await open(candidate,payload,'owner:item'),{secret:'test-secret'});}finally{raw.fill(0);}
});
test('wrapped device key needs correct PRF and is bound to user, origin and vault salt',async()=>{
 const raw=crypto.getRandomValues(new Uint8Array(32)),prf=crypto.getRandomValues(new Uint8Array(32));
 const context=deviceContext('owner','salt','https://vault.example'),payload=await protectMaterial(raw,prf,context);
 const recovered=await recoverMaterial(payload,prf,context);assert.deepEqual(recovered,raw);
 await assert.rejects(()=>recoverMaterial(payload,crypto.getRandomValues(new Uint8Array(32)),context));
 for(const other of [deviceContext('other','salt','https://vault.example'),deviceContext('owner','other','https://vault.example'),deviceContext('owner','salt','https://other.example')])await assert.rejects(()=>recoverMaterial(payload,prf,other));
 assert.equal(JSON.stringify(payload).includes('test-secret'),false);raw.fill(0);recovered.fill(0);prf.fill(0);
});
test('missing secure PRF never falls back to a locally generated wrapping key',async()=>{
 const raw=new Uint8Array(32);await assert.rejects(()=>protectMaterial(raw,null,'context'));
 await assert.rejects(()=>protectMaterial(raw,new Uint8Array(16),'context'));
});
