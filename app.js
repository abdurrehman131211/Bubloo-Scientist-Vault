import { setupPlans } from './plans.js';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { derive, seal, open, salt, generatePassword } from './crypto.js';
// Email confirmation may return tokens; this app requires explicit sign-in.
if(location.hash) history.replaceState(null,'',location.pathname+location.search);
const $ = id => document.getElementById(id);
let session=null, config=null, key=null, items=[], signup=false, editing=null, epoch=0, lastActivity=Date.now();
const authForm=$('auth-form'), unlockForm=$('unlock-form'), itemForm=$('item-form');
function notify(message,error=false){ $('notice').textContent=message; $('notice').className=error?'error':''; $('notice').hidden=false; const dialogs=[...document.querySelectorAll('dialog[open]')];const active=dialogs[dialogs.length-1];if(active){let feedback=active.querySelector('.dialog-feedback');if(!feedback){feedback=document.createElement('p');feedback.className='dialog-feedback';feedback.setAttribute('role','status');active.querySelector('.dialog-heading').after(feedback);}feedback.textContent=message;} }
function clearNotice(){ $('notice').hidden=true;document.querySelectorAll('.dialog-feedback').forEach(n=>n.remove()); }
function lock(){ plans.onLock(); epoch++; key=null; items=[]; editing=null; itemForm.reset(); $('editor').close(); $('search').value=''; $('list').replaceChildren(); unlockForm.reset(); $('count').textContent='0'; $('item-total').textContent='0'; render(); }
function render(){ $('auth-panel').hidden=!!session; $('unlock-panel').hidden=!session||!!key; $('vault-panel').hidden=!session||!key; $('lock').hidden=!key; $('signout').hidden=!session; $('account-label').textContent=session?.user.email||'Private by design'; $('unlock-title').textContent=config?'Unlock your vault.':'Create your private vault.'; $('unlock-submit').textContent=config?'Unlock vault →':'Create encrypted vault →'; $('confirm-label').hidden=!!config; unlockForm.elements.confirm.required=!config; $('unlock-help').textContent=config?'Enter your master passphrase to decrypt your passwords on this device.':'Choose a master passphrase. Only you will know it.'; plans.render(); if(key) renderItems(); }
async function api(path,{method='GET',body,auth=true}={}){
  if(auth&&!session) throw new Error('Please sign in again.');
  const response=await fetch(SUPABASE_URL+path,{method,headers:{apikey:SUPABASE_KEY,'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+session.access_token}:{}),...(path.startsWith('/rest/')?{Prefer:'return=representation'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const data=await response.json().catch(()=>null);
  if(!response.ok){ if(auth&&response.status===401){session=null;config=null;lock();} throw new Error(data?.msg||data?.message||data?.error_description||'Request failed. Please try again.'); }
  return data;
}
async function run(form,fn){ const buttons=[...form.querySelectorAll('button')]; buttons.forEach(b=>b.disabled=true); clearNotice(); try{await fn();}catch(error){notify(error.message||'Something went wrong.',true);}finally{buttons.forEach(b=>b.disabled=false);} }
$('toggle-auth').onclick=()=>{signup=!signup; $('auth-title').textContent=signup?'A fresh start for your secrets.':'Make yourself at home.'; $('auth-submit').textContent=signup?'Create account →':'Sign in →'; $('toggle-auth').textContent=signup?'Already have an account? Sign in':'New here? Create an account'; authForm.elements.password.autocomplete=signup?'new-password':'current-password';};
authForm.onsubmit=event=>{event.preventDefault();run(authForm,async()=>{
  const email=authForm.elements.email.value.trim(), password=authForm.elements.password.value;
  const result=await api(signup?'/auth/v1/signup':'/auth/v1/token?grant_type=password',{method:'POST',auth:false,body:{email,password}});
  authForm.elements.password.value='';
  if(!result.access_token){notify('Check your email to confirm your account, then sign in.');return;}
  session=result; lock();
  try{ const rows=await api('/rest/v1/vault_config?select=*'); config=rows[0]||null; await plans.refresh(); render(); }catch(error){session=null;config=null;lock();throw error;}
});};
unlockForm.onsubmit=event=>{event.preventDefault();run(unlockForm,async()=>{
  const currentEpoch=epoch, owner=session.user.id, phrase=unlockForm.elements.master.value;
  if(phrase.length<16) throw new Error('Use a master passphrase with at least 16 characters.');
  if(!config&&phrase!==unlockForm.elements.confirm.value) throw new Error('The master passphrases do not match.');
  const saltValue=config?.salt||salt(), candidate=await derive(phrase,saltValue);
  if(config){ try{ const check=await open(candidate,config.verifier,owner+':verifier'); if(check!=='bubloo-vault-v1') throw new Error(); }catch{throw new Error('Unable to unlock. Check your master passphrase.');} }
  else {const verifier=await seal(candidate,'bubloo-vault-v1',owner+':verifier'); if(currentEpoch!==epoch)return; const rows=await api('/rest/v1/vault_config',{method:'POST',body:{user_id:owner,salt:saltValue,verifier}}); config=rows[0];}
  await plans.refresh();
  const encrypted=await fetchEncrypted();
  const decrypted=await Promise.all(encrypted.map(async row=>({id:row.id,...await open(candidate,row.payload,owner+':'+row.id)})));
  if(currentEpoch!==epoch)return; key=candidate;items=decrypted;lastActivity=Date.now();unlockForm.reset();render();notify('Your vault is unlocked. Welcome back.');
});};
$('lock').onclick=()=>{lock();notify('Vault locked.');};
$('signout').onclick=async()=>{const token=session?.access_token;session=null;config=null;lock();notify('Signed out on this device.');if(token)await fetch(SUPABASE_URL+'/auth/v1/logout?scope=local',{method:'POST',headers:{apikey:SUPABASE_KEY,Authorization:'Bearer '+token}}).catch(()=>{});};
for(const event of ['pointerdown','keydown','scroll','touchstart'])window.addEventListener(event,()=>{lastActivity=Date.now();},{passive:true});
setInterval(()=>{if(key&&Date.now()-lastActivity>=300000){lock();notify('Vault locked after 5 minutes of inactivity.');}},1000);
document.addEventListener('visibilitychange',()=>{if(document.hidden&&key){lock();notify('Vault locked while you were away.');}});
window.addEventListener('pagehide',()=>lock());
function element(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}
function renderItems(){
 const list=$('list');list.replaceChildren();$('count').textContent=items.length;$('item-total').textContent=items.length;
 const query=$('search').value.toLowerCase();const visible=items.filter(item=>[item.title,item.username,item.website,item.notes].some(v=>(v||'').toLowerCase().includes(query)));
 if(!visible.length){const empty=element('div','empty');empty.append(element('div','empty-icon','⌑'),element('h3','',items.length?'No matches this time.':'Your vault is a blank canvas.'),element('p','',items.length?'Try another name, website, or username.':'Add your first password. Give your memory a little room to breathe.'));list.append(empty);return;}
 for(const item of visible){const row=element('article','item'), info=element('div','item-info'), copy=element('button','','Copy'),edit=element('button','','Edit');info.append(element('h3','',item.title),element('p','',[item.username,item.website].filter(Boolean).join(' · ')));copy.ariaLabel='Copy password for '+item.title;copy.onclick=async()=>{try{await navigator.clipboard.writeText(item.secret);notify('Password copied. Clear your clipboard after pasting.');}catch{notify('Clipboard access is unavailable. Use Show in the editor.',true);}};edit.ariaLabel='Edit '+item.title;edit.onclick=()=>showEditor(item);row.append(element('div','item-icon',item.title.slice(0,1).toUpperCase()),info,element('span','secret-dots','••••••••••'),copy,edit);const visit=element('button','',item.website?'Open in-app browser':'Add website URL');visit.ariaLabel=item.website?'Open '+item.title+' in the in-app browser':'Add a website URL for '+item.title;visit.onclick=()=>item.website?plans.showBrowser(item):showEditor(item);row.append(visit);list.append(row);}
}
$('search').oninput=renderItems;$('all-items').onclick=()=>{if(key){$('search').value='';renderItems();}};
function showEditor(item){ editing=item?.id||null;itemForm.reset(); for(const field of ['title','website','username','secret','notes'])itemForm.elements[field].value=item?.[field]||''; itemForm.elements.secret.type='password';$('reveal').textContent='Show';$('editor-title').textContent=item?'Edit password':'Add a password';$('delete').hidden=!item;$('editor').showModal(); }
$('add').onclick=()=>run($('vault-panel'),async()=>{await plans.refresh();if(plans.canAdd())showEditor();});$('cancel').onclick=()=>$('editor').close();$('editor').addEventListener('close',()=>{itemForm.reset();editing=null;});
$('generate').onclick=()=>{try{itemForm.elements.secret.value=generatePassword(Number($('length').value));}catch(error){notify(error.message,true);}};
$('reveal').onclick=()=>{const field=itemForm.elements.secret;field.type=field.type==='password'?'text':'password';$('reveal').textContent=field.type==='password'?'Show':'Hide';};
itemForm.onsubmit=event=>{event.preventDefault();run(itemForm,async()=>{
 const currentEpoch=epoch,owner=session.user.id,id=editing||crypto.randomUUID(),existing=!!editing;
 if(!existing){await plans.refresh();if(currentEpoch!==epoch||!plans.canAdd())return;}
 const data=Object.fromEntries(['title','website','username','secret','notes'].map(f=>[f,itemForm.elements[f].value]));data.title=data.title.trim();if(!data.title)throw new Error('Please enter a title.');
 if(data.website&&!['http:','https:'].includes(new URL(data.website).protocol))throw new Error('Use an http or https website address.');
 const payload=await seal(key,data,owner+':'+id);if(currentEpoch!==epoch)return;
 const rows=await api('/rest/v1/vault_items'+(existing?'?id=eq.'+id:''),{method:existing?'PATCH':'POST',body:{id,user_id:owner,payload,updated_at:new Date().toISOString()}});
 if(!rows?.length)throw new Error('The item could not be saved. Reload and try again.');if(currentEpoch!==epoch)return;
 items=items.filter(item=>item.id!==id);items.unshift({id,...data});$('editor').close();renderItems();notify('Password saved and encrypted.');await plans.refresh();
});};
$('delete').onclick=()=>{if(!confirm('Delete this password permanently?'))return;run(itemForm,async()=>{const currentEpoch=epoch,id=editing;const rows=await api('/rest/v1/vault_items?id=eq.'+id,{method:'DELETE'});if(!rows?.length)throw new Error('The item could not be deleted.');if(currentEpoch!==epoch)return;items=items.filter(item=>item.id!==id);$('editor').close();renderItems();notify('Password deleted.');await plans.refresh();});};
$('backup').onclick=()=>run($('vault-panel'),async()=>{const currentEpoch=epoch;const rows=await fetchEncrypted();if(currentEpoch!==epoch)return;const blob=new Blob([JSON.stringify({format:'bubloo-vault-backup-v1',config,items:rows},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='bubloo-vault-encrypted-'+new Date().toISOString().slice(0,10)+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('Encrypted backup exported. Keep it with your master passphrase stored separately.');});
$('restore').onclick=()=>$('restore-file').click();
$('restore-file').onchange=event=>{const file=event.target.files[0];event.target.value='';if(!file)return;run($('vault-panel'),async()=>{const currentEpoch=epoch;if(file.size>10000000)throw new Error('Backup is too large (maximum 10 MB).');const backup=JSON.parse(await file.text());if(backup.format!=='bubloo-vault-backup-v1'||backup.config?.user_id!==session.user.id||backup.config?.salt!==config.salt||!Array.isArray(backup.items)||backup.items.length>10000)throw new Error('This backup does not belong to your current vault.');const restored=await Promise.all(backup.items.map(async row=>{if(!/^[0-9a-f-]{36}$/i.test(row.id))throw new Error('Invalid item ID.');const value=await open(key,row.payload,session.user.id+':'+row.id);if(!['title','website','username','secret','notes'].every(f=>typeof value[f]==='string'))throw new Error('Invalid backup item.');return {id:row.id,value,payload:row.payload};}));if(currentEpoch!==epoch)return;const missing=restored.filter(row=>!items.some(item=>item.id===row.id));if(!missing.length){notify('Nothing to restore. All backup items already exist.');return;}await plans.refresh();if(currentEpoch!==epoch||!plans.canAdd(missing.length))return;await api('/rest/v1/vault_items',{method:'POST',body:missing.map(row=>({id:row.id,user_id:session.user.id,payload:row.payload}))});if(currentEpoch!==epoch)return;items.push(...missing.map(row=>({id:row.id,...row.value})));renderItems();notify(missing.length+' missing passwords restored. Existing items were preserved.');await plans.refresh();});};
async function fetchEncrypted(){const rows=[];for(let offset=0;;offset+=500){const page=await api('/rest/v1/vault_items?select=*&order=id.asc&limit=500&offset='+offset);rows.push(...page);if(page.length<500)return rows;}}
const plans=setupPlans({api,notify,getSession:()=>session,isUnlocked:()=>!!key});
render();
