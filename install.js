const $=id=>document.getElementById(id);
let promptEvent=null;
const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
function render(){ $('install-app').hidden=standalone(); }
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();promptEvent=event;render();});
window.addEventListener('appinstalled',()=>{promptEvent=null;render();});
$('install-app').onclick=async()=>{if(promptEvent){const event=promptEvent;promptEvent=null;await event.prompt();await event.userChoice;render();}else{$('install-help').showModal();}};
$('install-help-close').onclick=()=>$('install-help').close();
render();
// No offline vault or cached credentials: this worker deliberately stores no data.
if('serviceWorker' in navigator&&window.isSecureContext)navigator.serviceWorker.register('./sw.js').catch(()=>{});
