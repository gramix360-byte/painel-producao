const PP_SUPABASE_URL='https://evyilktotmjivscrufug.supabase.co';
const PP_SUPABASE_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2eWlsa3RvdG1qaXZzY3J1ZnVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI2OTYxNTIsImV4cCI6MjA2ODI3MjE1Mn0.zVLxX_8BsacW6h6gA40z2k00XIyj65uF83Mp_wWvrb8';
const PP_SESSION_KEY='painel-producao-auth';
const nativeFetch=window.fetch.bind(window);

function readSession(){try{return JSON.parse(localStorage.getItem(PP_SESSION_KEY)||'null')}catch{return null}}
function saveSession(s){localStorage.setItem(PP_SESSION_KEY,JSON.stringify(s))}
function clearSession(){localStorage.removeItem(PP_SESSION_KEY)}

async function refreshSession(session){
  if(!session?.refresh_token)return null;
  const r=await nativeFetch(`${PP_SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,{method:'POST',headers:{apikey:PP_SUPABASE_KEY,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:session.refresh_token})});
  if(!r.ok){clearSession();return null}
  const data=await r.json();
  const next={...data,expires_at:Date.now()+(data.expires_in||3600)*1000};saveSession(next);return next;
}

async function getSession(){
  let s=readSession();
  if(!s)return null;
  if(!s.expires_at||s.expires_at<Date.now()+60000)s=await refreshSession(s);
  return s;
}

window.fetch=async function(input,init={}){
  const url=typeof input==='string'?input:input.url;
  if(url.startsWith(`${PP_SUPABASE_URL}/rest/v1/`)){
    const s=await getSession();
    if(!s){location.href=`./login.html?next=${encodeURIComponent(location.pathname.split('/').pop()||'index.html')}`;throw new Error('Sessão necessária')}
    const headers=new Headers(init.headers||(typeof input!=='string'?input.headers:undefined));headers.set('Authorization',`Bearer ${s.access_token}`);
    return nativeFetch(input,{...init,headers});
  }
  return nativeFetch(input,init);
};

async function requireAuth(){
  const s=await getSession();
  if(!s){location.replace(`./login.html?next=${encodeURIComponent(location.pathname.split('/').pop()||'index.html')}`);return null}
  return s;
}
async function logout(){clearSession();location.replace('./login.html')}
window.PPAuth={getSession,requireAuth,logout,clearSession,saveSession,sessionKey:PP_SESSION_KEY,url:PP_SUPABASE_URL,key:PP_SUPABASE_KEY};
