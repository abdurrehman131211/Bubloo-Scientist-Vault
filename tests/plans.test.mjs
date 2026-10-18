import {test} from 'node:test';
import assert from 'node:assert/strict';
import {websiteURL} from '../website.js';
test('website viewer accepts external HTTPS and rejects unsafe addresses',()=>{
 assert.equal(websiteURL('example.com','https://vault.example'),'https://example.com/');
 assert.equal(websiteURL('https://example.com/login?q=1','https://vault.example'),'https://example.com/login?q=1');
 for(const value of ['javascript:alert(1)','data:text/html,bad','http://example.com','https://vault.example','https://user:secret@example.com','https://localhost',''])assert.throws(()=>websiteURL(value,'https://vault.example'));
});
