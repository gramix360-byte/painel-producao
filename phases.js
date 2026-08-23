(()=>{
  const PHASES=[
    ['pedido_recebido','Pedido recebido'],
    ['aguardando_arte','Aguardando arte'],
    ['arte_em_criacao','Arte em criação'],
    ['aguardando_aprovacao','Aguardando aprovação'],
    ['arte_aprovada','Arte aprovada'],
    ['em_producao','Em produção'],
    ['finalizado','Finalizado'],
    ['embalagem','Embalagem'],
    ['pronto_entrega','Pronto p/ entrega'],
    ['entregue','Entregue']
  ];
  const phaseMap=Object.fromEntries(PHASES);
  const $=s=>document.querySelector(s);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=v=>{if(!v)return 'Sem prazo';const [y,m,d]=v.split('-');return `${d}/${m}/${y}`};
  let loading=false;

  async function sessionHeaders(){
    const session=await window.PPAuth?.getSession();
    if(!session?.access_token) throw new Error('Sessão expirada');
    return {apikey:window.PPAuth.key,Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'};
  }

  async function fetchOrders(){
    const h=await sessionHeaders();
    const r=await fetch(`${window.PPAuth.url}/rest/v1/orders?select=id,order_number,customer_name,due_date,priority,phase,status,created_at,order_items(quantity,product_name)&order=created_at.desc`,{headers:h});
    if(!r.ok) throw new Error(await r.text());
    return r.json();
  }

  function statusForPhase(phase){
    if(phase==='em_producao') return 'em_producao';
    if(['finalizado','embalagem','pronto_entrega','entregue'].includes(phase)) return 'finalizado';
    return 'aguardando';
  }

  async function updateLocal(orderId,phase,status){
    try{
      const req=indexedDB.open('painel-producao-db',1);
      await new Promise((resolve,reject)=>{req.onsuccess=resolve;req.onerror=()=>reject(req.error)});
      const db=req.result;
      const tx=db.transaction('orders','readwrite');
      const st=tx.objectStore('orders');
      const get=st.get(orderId);
      await new Promise((resolve,reject)=>{get.onsuccess=resolve;get.onerror=()=>reject(get.error)});
      if(get.result){
        const o=get.result;
        o.phase=phase;
        o.status=status;
        o.updated_at=new Date().toISOString();
        if(status==='em_producao'&&!o.started_at)o.started_at=o.updated_at;
        if(status==='finalizado'&&!o.finished_at)o.finished_at=o.updated_at;
        st.put(o);
      }
      await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});
      db.close();
      if('BroadcastChannel' in window){const ch=new BroadcastChannel('painel-producao-updates');ch.postMessage({type:'changed'});ch.close()}
    }catch(e){console.warn('Fase local não atualizada',e)}
  }

  async function setPhase(orderId,phase){
    const h=await sessionHeaders();
    const status=statusForPhase(phase);
    const now=new Date().toISOString();
    const patch={phase,status,updated_at:now};
    if(status==='em_producao')patch.started_at=now;
    if(status==='finalizado')patch.finished_at=now;
    const r=await fetch(`${window.PPAuth.url}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}`,{method:'PATCH',headers:{...h,Prefer:'return=minimal'},body:JSON.stringify(patch)});
    if(!r.ok) throw new Error(await r.text());
    await updateLocal(orderId,phase,status);
  }

  function card(o){
    const items=(o.order_items||[]).slice(0,2).map(i=>`<div class="phase-item">${esc(i.quantity)}× ${esc(i.product_name)}</div>`).join('');
    const more=(o.order_items||[]).length>2?`<small>+ ${(o.order_items||[]).length-2} item(ns)</small>`:'';
    const options=PHASES.map(([v,l])=>`<option value="${v}" ${v===(o.phase||'pedido_recebido')?'selected':''}>${l}</option>`).join('');
    return `<article class="phase-card ${o.priority==='urgente'?'urgent':''}"><div class="phase-card-top"><strong>#${esc(o.order_number)}</strong><span>${o.priority==='urgente'?'URGENTE':'Normal'}</span></div><h3>${esc(o.customer_name)}</h3><div class="phase-due">Prazo: ${fmt(o.due_date)}</div><div class="phase-items">${items}${more}</div><label>Alterar fase<select class="phase-select" data-id="${esc(o.id)}">${options}</select></label></article>`;
  }

  async function render(){
    const host=$('#view-fases');
    if(!host||loading)return;
    loading=true;
    host.innerHTML='<div class="phase-loading">Carregando fases...</div>';
    try{
      const orders=await fetchOrders();
      const active=orders.filter(o=>(o.phase||'pedido_recebido')!=='entregue');
      host.innerHTML=`<div class="phase-toolbar"><div><strong>Fluxo dos pedidos</strong><span>${active.length} pedido(s) em andamento</span></div><button id="refresh-phases" class="button secondary" type="button">Atualizar</button></div><div class="phase-board">${PHASES.map(([key,label])=>{const list=orders.filter(o=>(o.phase||'pedido_recebido')===key);return `<section class="phase-column" data-phase="${key}"><header><span>${label}</span><b>${list.length}</b></header><div class="phase-column-body">${list.length?list.map(card).join(''):'<div class="phase-empty">Nenhum pedido</div>'}</div></section>`}).join('')}</div>`;
      $('#refresh-phases')?.addEventListener('click',render);
      host.querySelectorAll('.phase-select').forEach(sel=>sel.addEventListener('change',async()=>{
        const old=sel.dataset.old||'';sel.disabled=true;
        try{await setPhase(sel.dataset.id,sel.value);sel.dataset.old=sel.value;await render()}catch(e){console.error(e);if(old)sel.value=old;alert('Não foi possível alterar a fase agora.')}finally{sel.disabled=false}
      }));
      host.querySelectorAll('.phase-select').forEach(sel=>sel.dataset.old=sel.value);
    }catch(e){console.error(e);host.innerHTML='<div class="phase-error">Não foi possível carregar as fases. Verifique a conexão e tente novamente.</div>'}
    finally{loading=false}
  }

  function openPhases(){
    document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
    $('#view-fases')?.classList.add('active');
    document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'));
    $('#phases-nav')?.classList.add('active');
    if($('#page-title'))$('#page-title').textContent='Fases';
    if($('#page-subtitle'))$('#page-subtitle').textContent='Acompanhe cada pedido da entrada até a entrega';
    render();
  }

  document.addEventListener('DOMContentLoaded',()=>{
    $('#phases-nav')?.addEventListener('click',openPhases);
    document.querySelectorAll('.nav-item').forEach(btn=>btn.addEventListener('click',()=>$('#phases-nav')?.classList.remove('active')));
  });
  window.PPPhases={open:openPhases,refresh:render,labels:phaseMap};
})();