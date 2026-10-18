import {test} from 'node:test';
import assert from 'node:assert/strict';
import {salt,derive,seal,open,generatePassword} from '../crypto.js';
test('encrypted entries authenticate owner and item; reject wrong key and tampering',async()=>{
 const s=salt(),key=await derive('a long unique master passphrase',s),other=await derive('a different long master passphrase',s);
 const record={title:'Example',secret:'private-value'},payload=await seal(key,record,'owner:item');
 assert.deepEqual(await open(key,payload,'owner:item'),record);
 assert.equal(JSON.stringify(payload).includes('private-value'),false);
 await assert.rejects(()=>open(other,payload,'owner:item'));
 await assert.rejects(()=>open(key,payload,'other:item'));
 const modified={...payload,data:(payload.data[0]==='A'?'B':'A')+payload.data.slice(1)};
 await assert.rejects(()=>open(key,modified,'owner:item'));
 assert.notEqual((await seal(key,record,'owner:item')).iv,payload.iv);
 assert.equal(key.extractable,false);
});
test('generator produces requested length and all character groups',()=>{
 for(let i=0;i<100;i++){const p=generatePassword(24);assert.equal(p.length,24);assert.match(p,/[A-Z]/);assert.match(p,/[a-z]/);assert.match(p,/[0-9]/);assert.match(p,/[!@#$%^&*()_+=-]/);}
 assert.throws(()=>generatePassword(4));assert.throws(()=>generatePassword(129));
});
