(()=>{
const ROLE_RULES={
  admin:['dashboard','clientes','produtos','orcamentos','novo','fases','producao','pedidos','financeiro','relatorios','sync','integracoes','configuracoes'],
  vendas:['clientes','produtos','orcamentos','novo','pedidos'],
  producao:['produtos','producao']
};
const NAV_MAP={
  'customers-nav':'clientes','products-nav':'produtos','quotes-nav':'orcamentos','phases-nav':'fases',
  'finance-nav':'financeiro','reports-nav':'relatorios','integrations-nav':'integracoes','settings-nav':'configuracoes'
};
function navArea(el){if(!el)return null;if(el.id&&NAV_MAP[el.id])return NAV_MAP[el.id];if(el.classList.contains('nav-item'))return el.dataset.view||null;return null}
async function getProfile(){
  try{
    const s=await window.PPAuth?.getSession?.();
    if(!s?.access_token)return null;
    const uid=s.user?.id;
    if(!uid)return {role:'admin',active:true,display_name:s.user?.email||'Administrador'};
    const r=await fetch(`${window.PPAuth.url}/rest/v1/user_profiles?select=user_id,email,display_name,role,active&user_id=eq.${encodeURIComponent(uid)}&limit=1`,{headers:{apikey:window.PPAuth.key,Authorization:`Bearer ${s.access_token}`}});
    if(!r.ok)return {role:'admin',active:true,display_name:s.user?.email||'Administrador'};
    const a=await r.json();
    return a[0]||{role:'admin',active:true,display_name:s.user?.email||'Administrador'};
  }catch(e){console.warn('Permissões não carregadas; acesso administrativo preservado.',e);return {role:'admin',active:true}}
}
function showRoleBadge(p){
  const wrap=document.querySelector('.connection-wrap');if(!wrap)return;
  let b=document.getElementById('role-badge');
  if(!b){b=document.createElement('span');b.id='role-badge';b.style.cssText='font-size:11px;color:#52687f;background:#eef5fb;border:1px solid #d9e5f2;border-radius:999px;padding:6px 9px';wrap.prepend(b)}
  const label=p.role==='admin'?'Administrador':p.role==='vendas'?'Vendas':'Produção';b.textContent=`${p.display_name||p.email||'Usuário'} · ${label}`;
}
function openFirstAllowed(allowed){
  const active=document.querySelector('#nav button.active');const activeArea=navArea(active);
  if(activeArea&&allowed.includes(activeArea))return;
  const buttons=[...document.querySelectorAll('#nav button')].filter(b=>b.style.display!=='none');
  if(buttons[0])setTimeout(()=>buttons[0].click(),50);
}
async function apply(){
  const p=await getProfile();if(!p)return;
  if(p.active===false){alert('Este usuário está desativado. Entre em contato com o administrador.');window.PPAuth.logout();return}
  const allowed=ROLE_RULES[p.role]||ROLE_RULES.admin;
  document.querySelectorAll('#nav button').forEach(b=>{const area=navArea(b);b.style.display=(!area||allowed.includes(area))?'':'none'});
  showRoleBadge(p);openFirstAllowed(allowed);
  document.documentElement.dataset.userRole=p.role||'admin';
}
document.addEventListener('DOMContentLoaded',()=>setTimeout(apply,350));
window.PPRoleAccess={apply,getProfile,rules:ROLE_RULES};
})();