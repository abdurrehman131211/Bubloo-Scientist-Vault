import { open } from './crypto.js';
import {toBase64,fromBase64,toBase64URL,deviceContext,deriveMaterial,importVaultKey,protectMaterial,recoverMaterial} from './device-crypto.js';
const $=id=>document.getElementById(id),random=()=>crypto.getRandomValues(new Uint8Array(32));
const PREFIX='bubloo-device-unlock-v1:';
export function looksMobile(){return navigator.userAgentData?.mobile===true||/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);}
export function setupDeviceUnlock({getSession,getConfig,isUnlocked,getEpoch,unlock,notify}){
 let supported=false,probing=false,busy=false;
 const owner=()=>getSession()?.user.id;
 const storageKey=()=>PREFIX+owner();
 function readRecord(){try{const data=JSON.parse(localStorage.getItem(storageKey()));return data?.v===1&&data.userId===owner()&&data.origin===location.origin&&data.vaultSalt===getConfig()?.salt?data:null;}catch{return null;}}
 function render(){const eligible=!!owner()&&!!getConfig()&&looksMobile();$('device-unlock-section').hidden=!eligible;$('device-manage').hidden=!eligible||!isUnlocked()||!readRecord();if(!eligible)return;const record=readRecord();$('device-unlock').hidden=!supported||!record;$('device-enable').hidden=!supported||!!record;$('device-remove').hidden=!record;$('device-status').textContent=record?'Device unlock is enabled in this browser. Your phone may use biometrics or its screen-lock PIN.':supported?'Optional: use your phone’s fingerprint, face recognition or screen lock. Setup checks secure passkey encryption support.':'Secure device unlock is unavailable in this browser. Use your master passphrase.';for(const id of ['device-unlock','device-enable','device-remove'])$(id).disabled=busy;}
 async function probe(){if(probing||supported||!looksMobile()||!window.isSecureContext||!window.PublicKeyCredential||!navigator.credentials){render();return;}probing=true;try{supported=await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();}catch{supported=false;}finally{probing=false;render();}}
 function active(user,epoch){if(owner()!==user||getEpoch()!==epoch||document.hidden)throw new Error('The session changed. Please try device unlock again.');}
 function friendly(error){if(error.name==='NotAllowedError'||error.name==='AbortError')return 'Device verification was cancelled or timed out. You can use your master passphrase.';if(error.name==='NotSupportedError')return 'This phone or passkey provider does not support secure device unlock. Use your master passphrase.';return error.message||'Device unlock failed. Use your master passphrase.';}
 async function getAssertion(record){
  const challenge=random();
  const assertion=await navigator.credentials.get({publicKey:{challenge,rpId:location.hostname,timeout:60000,allowCredentials:[{type:'public-key',id:fromBase64(record.credentialId),transports:['internal']}],userVerification:'required',extensions:{prf:{evalByCredential:{[toBase64URL(fromBase64(record.credentialId))]:{first:fromBase64(record.prfInput)}}}}}});
  if(!assertion||toBase64(assertion.rawId)!==record.credentialId)throw new Error('The selected passkey does not match this vault.');
  const client=JSON.parse(new TextDecoder().decode(assertion.response.clientDataJSON));
  if(client.type!=='webauthn.get'||client.challenge!==toBase64URL(challenge)||client.origin!==location.origin||client.crossOrigin===true)throw new Error('Device verification did not match this request.');
  const auth=new Uint8Array(assertion.response.authenticatorData),rpHash=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(location.hostname)));
  if(auth.length<37||(auth[32]&5)!==5||!rpHash.every((v,i)=>auth[i]===v))throw new Error('Device user verification is required.');
  const prf=assertion.getClientExtensionResults().prf?.results?.first;
  if(!prf)throw new Error('This passkey cannot encrypt the vault unlock key. Use your master passphrase.');return prf;
 }
 async function run(action){if(busy)return;busy=true;render();try{await action();}catch(e){notify(friendly(e),true);}finally{busy=false;render();}}
 $('device-enable').onclick=()=>{if(!supported||!owner())return;$('device-setup-form').reset();$('device-setup').showModal();};
 $('device-setup-close').onclick=()=>$('device-setup').close();
 $('device-setup').addEventListener('close',()=>{$('device-setup-form').reset();});
 $('device-setup-form').onsubmit=event=>{event.preventDefault();run(async()=>{
  const user=owner(),epoch=getEpoch(),config=getConfig();if(!user||!config||isUnlocked())throw new Error('Lock the vault, then set up device unlock.');
  const phrase=$('device-master').value;$('device-master').value='';let material,prf;
  try{
   material=await deriveMaterial(phrase,config.salt);const candidate=await importVaultKey(material);
   if(await open(candidate,config.verifier,user+':verifier')!=='bubloo-vault-v1')throw new Error('Master passphrase is incorrect.');active(user,epoch);
   const prfInput=random();const credential=await navigator.credentials.create({publicKey:{challenge:random(),rp:{name:'Bubloo Scientist Vault',id:location.hostname},user:{id:new TextEncoder().encode(user),name:getSession().user.email,displayName:'Bubloo Scientist Vault'},pubKeyCredParams:[{type:'public-key',alg:-7},{type:'public-key',alg:-257}],authenticatorSelection:{authenticatorAttachment:'platform',residentKey:'preferred',userVerification:'required'},attestation:'none',timeout:60000,extensions:{prf:{eval:{first:prfInput}}}}});
   active(user,epoch);if(!credential)throw new Error('No device passkey was created.');
   const record={v:1,userId:user,origin:location.origin,vaultSalt:config.salt,credentialId:toBase64(credential.rawId),prfInput:toBase64(prfInput)};
   // Always test an assertion before storing any encrypted key. Registration may not provide PRF output.
   prf=await getAssertion(record);active(user,epoch);
   const context=deviceContext(user,config.salt,location.origin);record.wrapped=await protectMaterial(material,prf,context);
   // Verify the wrapped key round trip before declaring enrollment successful.
   const check=await recoverMaterial(record.wrapped,prf,context);try{if(!material.every((v,i)=>check[i]===v))throw new Error('Device key verification failed.');}finally{check.fill(0);}
   active(user,epoch);localStorage.setItem(PREFIX+user,JSON.stringify(record));$('device-setup').close();notify('Device unlock enabled. Keep your master passphrase as your recovery method.');
  }catch(error){if(error.name==='OperationError')throw new Error('Master passphrase is incorrect or the vault record is invalid.');throw error;}finally{material?.fill(0);if(prf)new Uint8Array(prf).fill(0);}
 });};
 $('device-unlock').onclick=()=>run(async()=>{const record=readRecord(),user=owner(),epoch=getEpoch();if(!record)throw new Error('Set up device unlock in this browser first.');let material,prf;try{prf=await getAssertion(record);active(user,epoch);material=await recoverMaterial(record.wrapped,prf,deviceContext(user,record.vaultSalt,location.origin));const key=await importVaultKey(material);active(user,epoch);await unlock(key,epoch,user);}finally{material?.fill(0);if(prf)new Uint8Array(prf).fill(0);}});
 function remove(){if(!confirm('Disable device unlock in this browser? Your master passphrase will still work.'))return;localStorage.removeItem(storageKey());render();notify('Device unlock disabled here. You can also remove its passkey in your phone’s password settings.');}
 $('device-remove').onclick=remove;$('device-manage').onclick=remove;
 function onLock(){if($('device-setup').open)$('device-setup').close();$('device-setup-form').reset();}
 return {render,probe,onLock};
}
