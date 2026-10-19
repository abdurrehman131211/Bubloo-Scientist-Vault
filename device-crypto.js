import { ITERATIONS, seal, open } from './crypto.js';
const enc=new TextEncoder();
export const toBase64=value=>btoa(String.fromCharCode(...new Uint8Array(value)));
export const fromBase64=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
export const toBase64URL=value=>toBase64(value).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
export const deviceContext=(userId,vaultSalt,origin)=>JSON.stringify(['bubloo-device-unlock-v1',origin,userId,vaultSalt]);
export async function deriveMaterial(passphrase,vaultSalt){
 const base=await crypto.subtle.importKey('raw',enc.encode(passphrase),'PBKDF2',false,['deriveBits']);
 return new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt:fromBase64(vaultSalt),iterations:ITERATIONS,hash:'SHA-256'},base,256));
}
export const importVaultKey=material=>crypto.subtle.importKey('raw',material,{name:'AES-GCM'},false,['encrypt','decrypt']);
async function wrappingKey(prf,context){
 if(!prf||new Uint8Array(prf).byteLength!==32)throw new Error('Secure passkey encryption is unavailable. Use your master passphrase.');
 const base=await crypto.subtle.importKey('raw',prf,'HKDF',false,['deriveKey']);
 return crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:enc.encode(context),info:enc.encode('Bubloo Scientist device key wrapping')},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
export async function protectMaterial(material,prf,context){return seal(await wrappingKey(prf,context),toBase64(material),context);}
export async function recoverMaterial(payload,prf,context){
 const raw=fromBase64(await open(await wrappingKey(prf,context),payload,context));
 if(raw.length!==32){raw.fill(0);throw new Error('Invalid device unlock record. Use your master passphrase.');}
 return raw;
}
