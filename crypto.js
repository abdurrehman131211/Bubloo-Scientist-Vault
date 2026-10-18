export const ITERATIONS = 600000;
const enc = new TextEncoder();
const b64 = bytes => btoa(String.fromCharCode(...bytes));
const bytes = value => Uint8Array.from(atob(value), c => c.charCodeAt(0));
export function salt() { return b64(crypto.getRandomValues(new Uint8Array(32))); }
export async function derive(passphrase, saltValue) {
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt:bytes(saltValue),iterations:ITERATIONS,hash:'SHA-256'}, base, {name:'AES-GCM',length:256}, false, ['encrypt','decrypt']);
}
export async function seal(key, value, context) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode(context)},key,enc.encode(JSON.stringify(value)));
  return {v:1,iv:b64(iv),data:b64(new Uint8Array(ciphertext))};
}
export async function open(key, payload, context) {
  if (payload?.v !== 1) throw new Error('Unsupported vault format');
  const plaintext = await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(payload.iv),additionalData:enc.encode(context)},key,bytes(payload.data));
  return JSON.parse(new TextDecoder().decode(plaintext));
}
export function generatePassword(length=24) {
  if (!Number.isInteger(length) || length<16 || length>128) throw new Error('Choose 16–128 characters');
  const groups=['ABCDEFGHJKLMNPQRSTUVWXYZ','abcdefghijkmnopqrstuvwxyz','23456789','!@#$%^&*()-_=+'];
  const alphabet=groups.join('');
  function pick(chars) { let n; const limit=256-(256%chars.length); do { n=crypto.getRandomValues(new Uint8Array(1))[0]; } while(n>=limit); return chars[n%chars.length]; }
  let result; do { result=Array.from({length},()=>pick(alphabet)).join(''); } while (!groups.every(g=>[...result].some(c=>g.includes(c))));
  return result;
}
