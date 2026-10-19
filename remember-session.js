export const REMEMBER_KEY='bubloo-remembered-session-v1';
export function createRememberedSession({url,apiKey,storage,fetcher=fetch,onChange=()=>{},lock,now=()=>Date.now()}){
 let current=null,persistent=false,version=0,pending=null;
 const read=()=>{try{const r=JSON.parse(storage.getItem(REMEMBER_KEY));return r?.v===1&&typeof r.refresh_token==='string'&&typeof r.user_id==='string'?r:null;}catch{return null;}};
 function normalized(value){if(!value?.access_token||!value?.refresh_token||!value?.user?.id)throw new Error('Invalid sign-in response. Please sign in again.');return {...value,expires_at:Math.floor(now()/1000)+Number(value.expires_in||3600)};}
 function persist(){try{if(persistent&&current)storage.setItem(REMEMBER_KEY,JSON.stringify({v:1,user_id:current.user.id,refresh_token:current.refresh_token}));else storage.removeItem(REMEMBER_KEY);return true;}catch{persistent=false;return false;}}
 function set(value,remember){version++;current=normalized(value);persistent=!!remember;const stored=persist();onChange(current);return stored;}
 function clear({remove=true}={}){version++;current=null;persistent=false;if(remove)try{storage.removeItem(REMEMBER_KEY);}catch{}onChange(null);}
 async function refresh(saved){
  const v=version,owner=saved?.user_id||current?.user.id;if(!owner)return null;
  const action=async()=>{
   if(version!==v)return null;
   const fresh=persistent||saved?read():null;
   if((persistent||saved)&&(!fresh||fresh.user_id!==owner)){clear({remove:false});return null;}
   const token=fresh?.refresh_token||current?.refresh_token;if(!token)return null;
   const response=await fetcher(url+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:apiKey,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:token})});
   const body=await response.json().catch(()=>null);
   if(version!==v)return null;
   if(!response.ok){if(response.status===400||response.status===401||response.status===403)clear();throw new Error(response.status>=500?'Sign-in service is temporarily unavailable. Please try again.':'Your saved sign-in has expired. Please sign in again.');}
   const next=normalized(body);if(next.user.id!==owner){clear();throw new Error('The account changed. Please sign in again.');}
   // Sign out in another tab must win over a refresh that was already in flight.
   if(persistent||saved){const latest=read();if(!latest||latest.user_id!==owner){clear({remove:false});return null;}}
   current=next;persistent=persistent||!!saved;persist();onChange(current);return current;
  };
  return lock?lock(action):action();
 }
 async function ensureFresh(){if(!current)return null;if(current.expires_at*1000>now()+60000)return current;if(!pending){pending=refresh().finally(()=>{pending=null;});}return pending;}
 async function restore(){const saved=read();if(!saved)return null;if(pending)return pending;pending=refresh(saved).finally(()=>{pending=null;});return pending;}
 function storageChanged(){if(!persistent)return;const saved=read();if(!saved||saved.user_id!==current?.user.id)clear({remove:false});}
 return {set,clear,ensureFresh,restore,storageChanged,get:()=>current,isPersistent:()=>persistent};
}
