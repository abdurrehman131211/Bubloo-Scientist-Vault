export function websiteURL(value,ownOrigin){
 const input=value.trim();if(!input)throw new Error('Enter a website address.');
 const url=new URL(/^[a-z][a-z0-9+.-]*:/i.test(input)?input:'https://'+input);
 if(url.protocol!=='https:')throw new Error('The built-in viewer accepts HTTPS websites only.');
 if(url.username||url.password)throw new Error('Do not put login credentials in website addresses.');
 if(url.origin===ownOrigin)throw new Error('Open external websites here, not the vault itself.');
 if(url.hostname==='localhost'||url.hostname==='127.0.0.1'||url.hostname==='[::1]')throw new Error('Local addresses cannot be opened in the viewer.');
 return url.href;
}
