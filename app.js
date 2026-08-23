const SUPABASE_URL = 'https://evyilktotmjivscrufug.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2eWlsa3RvdG1qaXZzY3J1ZnVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI2OTYxNTIsImV4cCI6MjA2ODI3MjE1Mn0.zVLxX_8BsacW6h6gA40z2k00XIyj65uF83Mp_wWvrb8';
const DB_NAME = 'painel-producao-db';
const DB_VERSION = 1;
const CHANNEL = 'painel-producao-updates';

let db;
let currentView = 'dashboard';
let syncing = false;
let toastTimer;
const channel = 'BroadcastChannel' in window ? new BroadcastChannel(CHANNEL) : null;

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const nowIso = () => new Date().toISOString();

function openDB(){
  return new Promise((resolve,reject)=>{
    const req = indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=()=>{
      const d=req.result;
      if(!d.objectStoreNames.contains('orders')) d.createObjectStore('orders',{keyPath:'id'});
      if(!d.objectStoreNames.contains('outbox')) d.createObjectStore('outbox',{keyPath:'id'});
      if(!d.objectStoreNames.contains('meta')) d.createObjectStore('meta',{keyPath:'key'});
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}

function store(name,mode='readonly'){ return db.transaction(name,mode).objectStore(name); }
function reqPromise(req){ return new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);}); }
function getAll(name){ return reqPromise(store(name).getAll()); }
function getOne(name,key){ return reqPromise(store(name).get(key)); }
function put(name,value){ return reqPromise(store(name,'readwrite').put(value)); }
function del(name,key){ return reqPromise(store(name,'readwrite').delete(key)); }

async function saveLocal(order,queue=true){
  order.updated_at=nowIso();
  await put('orders',order);
  if(queue){
    await put('outbox',{id:uid(),orderId:order.id,createdAt:nowIso()});
  }
  broadcast();
}

function broadcast(){
  channel?.postMessage({type:'changed'});
  refreshAll();
}

async function pendingOrderIds(){
  return new Set((await getAll('outbox')).map(x=>x.orderId));
}

function apiHeaders(extra={}){
  return {apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`,'Content-Type':'application/json',...extra};
}

async function nextOrderNumber(){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/rpc/next_order_number`,{method:'POST',headers:apiHeaders(),body:'{}'});
  if(!r.ok) throw new Error(`Numeração: ${await r.text()}`);
  return await r.json();
}

async function remotePushOrder(order){
  if(String(order.order_number).startsWith('OFF-')){
    order.order_number=await nextOrderNumber();
    order.updated_at=nowIso();
    await put('orders',order);
  }
  const orderPayload={
    id:order.id,order_number:order.order_number,customer_name:order.customer_name,due_date:order.due_date||null,
    priority:order.priority,notes:order.notes||'',status:order.status,created_at:order.created_at,updated_at:order.updated_at,
    started_at:order.started_at||null,finished_at:order.finished_at||null
  };
  let r=await fetch(`${SUPABASE_URL}/rest/v1/orders?on_conflict=id`,{
    method:'POST',headers:apiHeaders({Prefer:'resolution=merge-duplicates,return=minimal'}),body:JSON.stringify(orderPayload)
  });
  if(!r.ok) throw new Error(`Pedido: ${await r.text()}`);
  r=await fetch(`${SUPABASE_URL}/rest/v1/order_items?order_id=eq.${encodeURIComponent(order.id)}`,{method:'DELETE',headers:apiHeaders()});
  if(!r.ok) throw new Error(`Itens: ${await r.text()}`);
  if(order.items?.length){
    const items=order.items.map(i=>({id:i.id,order_id:order.id,quantity:Number(i.quantity),product_name:i.product_name,personalization:i.personalization||''}));
    r=await fetch(`${SUPABASE_URL}/rest/v1/order_items`,{method:'POST',headers:apiHeaders({Prefer:'return=minimal'}),body:JSON.stringify(items)});
    if(!r.ok) throw new Error(`Itens: ${await r.text()}`);
  }
}

async function pullRemote(){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/orders?select=*,order_items(*)&order=created_at.desc`,{headers:apiHeaders()});
  if(!r.ok) throw new Error(await r.text());
  const rows=await r.json();
  const pending=await pendingOrderIds();
  for(const row of rows){
    if(pending.has(row.id)) continue;
    const local=await getOne('orders',row.id);
    if(!local || new Date(row.updated_at)>=new Date(local.updated_at||0)){
      await put('orders',{
        id:row.id,order_number:row.order_number,customer_name:row.customer_name,due_date:row.due_date||'',priority:row.priority,
        notes:row.notes||'',status:row.status,created_at:row.created_at,updated_at:row.updated_at,started_at:row.started_at,finished_at:row.finished_at,
        items:(row.order_items||[]).map(i=>({id:i.id,quantity:i.quantity,product_name:i.product_name,personalization:i.personalization||''}))
      });
    }
  }
}

async function syncNow(manual=false){
  if(syncing) return;
  if(!navigator.onLine){ if(manual) toast('Sem internet. As alterações continuam salvas neste dispositivo.'); updateConnection(); return; }
  syncing=true;updateConnection();
  try{
    const outbox=await getAll('outbox');
    const ids=[...new Set(outbox.map(x=>x.orderId))];
    for(const orderId of ids){
      const order=await getOne('orders',orderId);
      if(order){
        await remotePushOrder(order);
        for(const entry of outbox.filter(x=>x.orderId===orderId)) await del('outbox',entry.id);
      }
    }
    await pullRemote();
    await put('meta',{key:'lastSync',value:nowIso()});
    if(manual) toast('Sincronização concluída.');
  }catch(err){
    console.error(err);
    if(manual) toast('Não foi possível sincronizar agora. Nada foi perdido.');
  }finally{
    syncing=false;updateConnection();refreshAll();
  }
}

function formatDate(v){ if(!v) return 'Sem prazo'; const [y,m,d]=v.split('-'); return `${d}/${m}/${y}`; }
function statusLabel(v){ return ({aguardando:'Aguardando',em_producao:'Em produção',finalizado:'Finalizado'})[v]||v; }
function escapeHtml(v=''){ return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt',"'":'&#39;','"':'&quot;'}[c])); }

async function updateConnection(){
  const badge=$('#connection-badge');
  const banner=$('#offline-banner');
  const pending=(await getAll('outbox')).length;
  $('#pending-badge').textContent=`${pending} pendente${pending===1?'':'s'}`;
  $('#pending-badge').classList.toggle('hidden',pending===0);
  if(syncing){badge.textContent='Sincronizando...';badge.className='connection syncing';}
  else if(navigator.onLine){badge.textContent='Online';badge.className='connection online';}
  else{badge.textContent='Offline';badge.className='connection offline';}
  banner.classList.toggle('hidden',navigator.onLine);
}

function orderCard(order,pending=false){
  const action=order.status==='aguardando'
    ? `<button class="button warning status-action" data-id="${order.id}" data-status="em_producao">Iniciar produção</button>`
    : order.status==='em_producao'
      ? `<button class="button success status-action" data-id="${order.id}" data-status="finalizado">Finalizar pedido</button>`:'';
  return `<article class="order-card ${order.priority==='urgente'?'urgent':''} ${order.status==='em_producao'?'in-production':''}">
    <div class="order-card-head"><div><div class="order-number">#${escapeHtml(order.order_number)}</div><div class="customer">${escapeHtml(order.customer_name)}</div></div>
    <div class="meta"><span class="badge ${order.priority}">${order.priority==='urgente'?'URGENTE':'Normal'}</span>${pending?'<span class="badge pending">Pendente de sync</span>':''}<div>Prazo: ${formatDate(order.due_date)}</div></div></div>
    <ul class="order-items">${order.items.map(i=>`<li><span class="qty">${i.quantity}</span><div><div class="item-name">${escapeHtml(i.product_name)}</div>${i.personalization?`<div class="personalization">${escapeHtml(i.personalization)}</div>`:''}</div></li>`).join('')}</ul>
    ${order.notes?`<div class="order-notes"><strong>Obs.:</strong> ${escapeHtml(order.notes)}</div>`:''}
    ${action?`<div class="order-actions">${action}</div>`:''}
  </article>`;
}

async function renderDashboard(orders,pending){
  const today=new Date().toISOString().slice(0,10);
  const finishedToday=orders.filter(o=>o.status==='finalizado'&&o.finished_at?.slice(0,10)===today).length;
  const active=orders.filter(o=>o.status!=='finalizado').sort((a,b)=>(a.priority==='urgente'?-1:1)-(b.priority==='urgente'?-1:1)).slice(0,5);
  $('#view-dashboard').innerHTML=`<div class="stats">
    <div class="stat"><span>Aguardando</span><strong>${orders.filter(o=>o.status==='aguardando').length}</strong></div>
    <div class="stat"><span>Em produção</span><strong>${orders.filter(o=>o.status==='em_producao').length}</strong></div>
    <div class="stat"><span>Finalizados hoje</span><strong>${finishedToday}</strong></div>
    <div class="stat"><span>Urgentes</span><strong>${orders.filter(o=>o.priority==='urgente'&&o.status!=='finalizado').length}</strong></div>
  </div><div class="panel"><div class="section-head"><h2>Fila atual</h2><span>${active.length} pedido(s)</span></div>
  ${active.length?active.map(o=>`<div class="order-list-row"><div class="order-number">#${escapeHtml(o.order_number)}</div><div class="order-list-main"><strong>${escapeHtml(o.customer_name)}</strong><div>${o.items.length} item(ns) · ${formatDate(o.due_date)}</div></div><span class="badge ${o.status}">${statusLabel(o.status)}</span>${pending.has(o.id)?'<span class="badge pending">Pendente</span>':''}</div>`).join(''):'<div class="empty">Nenhum pedido na fila.</div>'}</div>`;
}

async function renderProduction(orders,pending){
  const sort=(a,b)=>{if(a.priority!==b.priority)return a.priority==='urgente'?-1:1;return (a.due_date||'9999').localeCompare(b.due_date||'9999');};
  const waiting=orders.filter(o=>o.status==='aguardando').sort(sort);
  const doing=orders.filter(o=>o.status==='em_producao').sort(sort);
  $('#view-producao').innerHTML=`<div class="production-columns">
    <div><div class="column-title"><h2>Aguardando</h2><strong>${waiting.length}</strong></div>${waiting.length?waiting.map(o=>orderCard(o,pending.has(o.id))).join(''):'<div class="empty">Nenhum pedido aguardando.</div>'}</div>
    <div><div class="column-title production"><h2>Em produção</h2><strong>${doing.length}</strong></div>${doing.length?doing.map(o=>orderCard(o,pending.has(o.id))).join(''):'<div class="empty">Nenhum pedido em produção.</div>'}</div>
  </div>`;
  bindStatusActions();
}

async function renderOrders(orders,pending){
  $('#view-pedidos').innerHTML=`<div class="panel"><div class="list-tools"><input id="search-orders" placeholder="Buscar por pedido ou cliente"/><select id="filter-status"><option value="todos">Todos os status</option><option value="aguardando">Aguardando</option><option value="em_producao">Em produção</option><option value="finalizado">Finalizado</option></select><select id="filter-priority"><option value="todas">Todas prioridades</option><option value="normal">Normal</option><option value="urgente">Urgente</option></select></div><div id="orders-results"></div></div>`;
  const render=()=>{
    const q=$('#search-orders').value.trim().toLowerCase(),s=$('#filter-status').value,p=$('#filter-priority').value;
    const list=orders.filter(o=>(!q||o.order_number.toLowerCase().includes(q)||o.customer_name.toLowerCase().includes(q))&&(s==='todos'||o.status===s)&&(p==='todas'||o.priority===p));
    $('#orders-results').innerHTML=list.length?list.map(o=>`<div class="order-list-row"><div class="order-number">#${escapeHtml(o.order_number)}</div><div class="order-list-main"><strong>${escapeHtml(o.customer_name)}</strong><div>${o.items.length} item(ns) · ${formatDate(o.due_date)}</div></div><span class="badge ${o.priority}">${o.priority}</span><span class="badge ${o.status}">${statusLabel(o.status)}</span>${pending.has(o.id)?'<span class="badge pending">Pendente</span>':''}</div>`).join(''):'<div class="empty">Nenhum pedido encontrado.</div>';
  };
  ['#search-orders','#filter-status','#filter-priority'].forEach(s=>$(s).addEventListener('input',render));render();
}

async function renderSync(){
  const pending=(await getAll('outbox')).length;
  const last=await getOne('meta','lastSync');
  $('#view-sync').innerHTML=`<div class="panel"><div class="section-head"><h2>Sincronização</h2><button id="sync-now" class="button primary">Tentar sincronizar agora</button></div><div class="sync-grid">
    <div class="sync-card"><span>Conexão</span><strong>${navigator.onLine?'Online':'Offline'}</strong></div>
    <div class="sync-card"><span>Alterações pendentes</span><strong>${pending}</strong></div>
    <div class="sync-card"><span>Última sincronização</span><strong>${last?.value?new Date(last.value).toLocaleString('pt-BR'):'Ainda não realizada'}</strong></div>
    <div class="sync-card"><span>Modo offline</span><strong>Ativo</strong></div>
  </div><p>Os pedidos ficam salvos neste dispositivo usando IndexedDB. Quando a internet volta, as alterações pendentes são enviadas automaticamente ao Supabase.</p></div>`;
  $('#sync-now').addEventListener('click',()=>syncNow(true));
}

async function refreshAll(){
  if(!db)return;
  const orders=(await getAll('orders')).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
  const pending=await pendingOrderIds();
  await updateConnection();
  if(currentView==='dashboard') await renderDashboard(orders,pending);
  if(currentView==='producao') await renderProduction(orders,pending);
  if(currentView==='pedidos') await renderOrders(orders,pending);
  if(currentView==='sync') await renderSync();
}

function bindStatusActions(){
  $$('.status-action').forEach(btn=>btn.addEventListener('click',async()=>{
    const order=await getOne('orders',btn.dataset.id);if(!order)return;
    order.status=btn.dataset.status;
    if(order.status==='em_producao') order.started_at=nowIso();
    if(order.status==='finalizado') order.finished_at=nowIso();
    await saveLocal(order,true);
    toast(navigator.onLine?'Status atualizado.':'Status salvo offline. Será sincronizado depois.');
    if(navigator.onLine) syncNow();
  }));
}

function addItemRow(data={}){
  const id=uid();
  const row=document.createElement('div');row.className='item-row';row.dataset.row=id;
  row.innerHTML=`<label>Quantidade<input class="item-qty" type="number" min="1" value="${data.quantity||''}" required /></label><label>Produto<input class="item-product" value="${escapeHtml(data.product_name||'')}" placeholder="Ex.: Chaveiro MDF" required /></label><label>Personalização<input class="item-personalization" value="${escapeHtml(data.personalization||'')}" placeholder="Ex.: Logo do cliente" /></label><button type="button" class="remove-item" title="Remover">×</button>`;
  row.querySelector('.remove-item').addEventListener('click',()=>{if($$('#items-list .item-row').length>1)row.remove();});
  $('#items-list').appendChild(row);
}

async function createOrderFromForm(e){
  e.preventDefault();
  const items=$$('#items-list .item-row').map(row=>({id:uid(),quantity:Number(row.querySelector('.item-qty').value),product_name:row.querySelector('.item-product').value.trim(),personalization:row.querySelector('.item-personalization').value.trim()})).filter(i=>i.quantity>0&&i.product_name);
  if(!items.length){toast('Adicione pelo menos um item.');return;}
  let orderNumber;
  try{
    orderNumber=navigator.onLine?await nextOrderNumber():`OFF-${Date.now().toString().slice(-6)}`;
  }catch(err){
    console.error(err);toast('Não foi possível gerar o número do pedido. Tente novamente.');return;
  }
  const t=nowIso();
  const order={id:uid(),order_number:orderNumber,customer_name:$('#customer-name').value.trim(),due_date:$('#due-date').value,priority:$('#priority').value,notes:$('#notes').value.trim(),status:'aguardando',created_at:t,updated_at:t,started_at:null,finished_at:null,items};
  await saveLocal(order,true);
  const generated=orderNumber.startsWith('OFF-')?'número será gerado quando sincronizar':`pedido #${orderNumber}`;
  e.target.reset();$('#items-list').innerHTML='';addItemRow();
  toast(navigator.onLine?`Cadastrado ${generated}. Sincronizando...`:`Pedido salvo offline; o ${generated}.`);
  switchView('producao');
  if(navigator.onLine) syncNow();
}

function switchView(view){
  currentView=view;
  $$('.view').forEach(v=>v.classList.remove('active'));$(`#view-${view}`).classList.add('active');
  $$('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  const meta={dashboard:['Dashboard','Visão geral da produção'],novo:['Novo Pedido','Cadastre um pedido para a fila'],producao:['Painel de Produção','Tela para TV e equipe de produção'],pedidos:['Pedidos','Histórico e pesquisa'],sync:['Sincronização','Online + offline']}[view];
  $('#page-title').textContent=meta[0];$('#page-subtitle').textContent=meta[1];refreshAll();
}

function toast(msg){const el=$('#toast');el.textContent=msg;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),3200);}

async function init(){
  db=await openDB();
  addItemRow();
  $$('.nav-item').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.view)));
  $('#add-item').addEventListener('click',()=>addItemRow());
  $('#order-form').addEventListener('submit',createOrderFromForm);
  window.addEventListener('online',()=>{updateConnection();syncNow();toast('Internet voltou. Sincronizando pedidos...');});
  window.addEventListener('offline',()=>{updateConnection();toast('Sem internet. Você pode continuar trabalhando normalmente.');});
  channel?.addEventListener('message',()=>refreshAll());
  if('serviceWorker' in navigator){try{await navigator.serviceWorker.register('./sw.js');}catch(e){console.warn('Service worker',e);}}
  await refreshAll();
  if(navigator.onLine) syncNow();
  setInterval(()=>{if(navigator.onLine&&!syncing)syncNow();},8000);
}

init().catch(err=>{console.error(err);toast('Não foi possível iniciar o sistema. Recarregue a página.');});