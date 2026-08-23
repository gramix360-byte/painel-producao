const SUPABASE_URL='https://evyilktotmjivscrufug.supabase.co';
let knownDoing=new Set(),first=true,busy=false;
const $=s=>document.querySelector(s); const esc=(v='')=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function date(v){if(!v)return 'Sem prazo';const [y,m,d]=v.split('-');return `${d}/${m}/${y}`}
function card(o,type='doing'){return `<article class="tv-card ${type} ${o.priority==='urgente'?'urgent':''}"><div class="tv-card-top"><div><div class="tv-number">#${esc(o.order_number)}</div><div class="tv-customer">${esc(o.customer_name)}</div></div><div class="tv-meta">${o.priority==='urgente'?'<b>URGENTE</b>':''}<span>Prazo: ${date(o.due_date)}</span></div></div><div class="tv-items">${(o.order_items||[]).map(i=>`<div class="tv-item"><strong>${i.quantity}</strong><div><b>${esc(i.product_name)}</b>${i.personalization?`<small>${esc(i.personalization)}</small>`:''}</div></div>`).join('')}</div>${type==='waiting'?'<div class="tv-notes">Aguardando aprovação do cliente</div>':o.notes?`<div class="tv-notes">Obs.: ${esc(o.notes)}</div>`:''}</article>`}
function sort(a,b){if(a.priority!==b.priority)return a.priority==='urgente'?-1:1;return (a.due_date||'9999').localeCompare(b.due_date||'9999')||new Date(a.created_at)-new Date(b.created_at)}
async function load(){
  if(busy||!navigator.onLine){status();return}
  busy=true;
  try{
    const headers={apikey:window.PPAuth.key,'Content-Type':'application/json'};
    const base=`${SUPABASE_URL}/rest/v1/orders?select=*,order_items(*)&order=created_at.asc`;
    const [wr,dr]=await Promise.all([
      fetch(`${base}&phase=eq.aguardando_aprovacao`,{headers}),
      fetch(`${base}&phase=eq.em_producao&status=eq.em_producao`,{headers})
    ]);
    if(!wr.ok)throw new Error(await wr.text());
    if(!dr.ok)throw new Error(await dr.text());
    const waiting=(await wr.json()).sort(sort);
    const doing=(await dr.json()).sort(sort);
    const ids=new Set(doing.map(x=>x.id));
    if(!first&&doing.some(x=>!knownDoing.has(x.id)))notify();
    knownDoing=ids;first=false;
    $('#waiting-count').textContent=waiting.length;
    $('#doing-count').textContent=doing.length;
    $('#tv-waiting').innerHTML=waiting.length?waiting.map(o=>card(o,'waiting')).join(''):'<div class="tv-empty">Nenhum pedido aguardando aprovação</div>';
    $('#tv-doing').innerHTML=doing.length?doing.map(o=>card(o,'doing')).join(''):'<div class="tv-empty">Nenhum pedido em produção</div>';
    status(true);
  }catch(e){console.error(e);status(false)}finally{busy=false}
}
function status(ok=navigator.onLine){const e=$('#tv-status');e.textContent=!navigator.onLine?'Offline':ok?'Online':'Reconectando...';e.className=`connection ${!navigator.onLine?'offline':ok?'online':'syncing'}`}
function notify(){const t=$('#tv-toast');t.classList.add('show');setTimeout(()=>t.classList.remove('show'),4000);try{const a=new AudioContext(),o=a.createOscillator(),g=a.createGain();o.connect(g);g.connect(a.destination);o.frequency.value=880;g.gain.value=.06;o.start();o.stop(a.currentTime+.16)}catch{}}
function clock(){const d=new Date();$('#tv-clock').textContent=d.toLocaleString('pt-BR',{weekday:'long',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'})}
$('#tv-fullscreen').onclick=()=>document.documentElement.requestFullscreen?.();window.addEventListener('online',load);window.addEventListener('offline',()=>status(false));clock();setInterval(clock,1000);load();setInterval(load,3000);