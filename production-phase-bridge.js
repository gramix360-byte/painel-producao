(()=>{
  const esc=(v='')=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=v=>{if(!v)return 'Sem prazo';const [y,m,d]=v.split('-');return `${d}/${m}/${y}`};

  async function patchPhaseToFinalized(orderId){
    try{
      const session=await window.PPAuth?.getSession();
      if(!session?.access_token)return;
      const now=new Date().toISOString();
      await fetch(`${window.PPAuth.url}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}`,{
        method:'PATCH',
        headers:{apikey:window.PPAuth.key,Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json',Prefer:'return=minimal'},
        body:JSON.stringify({phase:'finalizado',status:'finalizado',finished_at:now,updated_at:now})
      });
      try{
        const req=indexedDB.open('painel-producao-db',1);
        await new Promise((resolve,reject)=>{req.onsuccess=resolve;req.onerror=()=>reject(req.error)});
        const db=req.result,tx=db.transaction('orders','readwrite'),st=tx.objectStore('orders'),g=st.get(orderId);
        await new Promise((resolve,reject)=>{g.onsuccess=resolve;g.onerror=()=>reject(g.error)});
        if(g.result){const o=g.result;o.phase='finalizado';o.status='finalizado';o.finished_at=now;o.updated_at=now;st.put(o)}
        await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});
        db.close();
      }catch(e){console.warn('Não foi possível atualizar a fase local',e)}
      if('BroadcastChannel'in window){const ch=new BroadcastChannel('painel-producao-updates');ch.postMessage({type:'changed'});ch.close()}
      window.PPPhases?.refresh?.();
    }catch(e){console.error('Falha ao avançar fase após produção',e)}
  }

  function waitingCard(o){
    const items=(o.order_items||[]).map(i=>`<li><span class="qty">${esc(i.quantity)}</span><div><div class="item-name">${esc(i.product_name)}</div>${i.personalization?`<div class="personalization">${esc(i.personalization)}</div>`:''}</div></li>`).join('');
    return `<article class="order-card ${o.priority==='urgente'?'urgent':''}"><div class="order-card-head"><div><div class="order-number">#${esc(o.order_number)}</div><div class="customer">${esc(o.customer_name)}</div></div><div class="meta"><span class="badge ${esc(o.priority)}">${o.priority==='urgente'?'URGENTE':'Normal'}</span><div>Prazo: ${fmt(o.due_date)}</div></div></div><ul class="order-items">${items}</ul>${o.notes?`<div class="order-notes"><strong>Obs.:</strong> ${esc(o.notes)}</div>`:''}<div class="approval-note">Aguardando aprovação do cliente</div></article>`;
  }

  async function renderWaitingApproval(){
    const view=document.getElementById('view-producao');
    if(!view?.classList.contains('active'))return;
    const columns=view.querySelector('.production-columns');
    if(!columns)return;
    const first=columns.children[0];
    if(!first)return;
    try{
      const session=await window.PPAuth?.getSession();
      if(!session?.access_token)return;
      const r=await fetch(`${window.PPAuth.url}/rest/v1/orders?select=*,order_items(*)&phase=eq.aguardando_aprovacao&order=created_at.asc`,{headers:{apikey:window.PPAuth.key,Authorization:`Bearer ${session.access_token}`}});
      if(!r.ok)throw new Error(await r.text());
      const rows=await r.json();
      rows.sort((a,b)=>{if(a.priority!==b.priority)return a.priority==='urgente'?-1:1;return(a.due_date||'9999').localeCompare(b.due_date||'9999')});
      first.innerHTML=`<div class="column-title"><h2>Aguardando</h2><strong>${rows.length}</strong></div>${rows.length?rows.map(waitingCard).join(''):'<div class="empty">Nenhum pedido aguardando aprovação.</div>'}`;
    }catch(e){console.error('Falha ao carregar aguardando aprovação',e)}
  }

  document.addEventListener('click',event=>{
    const btn=event.target.closest('.status-action[data-status="finalizado"]');
    if(btn)setTimeout(()=>patchPhaseToFinalized(btn.dataset.id),250);
    if(event.target.closest('.nav-item[data-view="producao"]'))setTimeout(renderWaitingApproval,250);
  },true);

  const observer=new MutationObserver(()=>setTimeout(renderWaitingApproval,80));
  document.addEventListener('DOMContentLoaded',()=>{
    const view=document.getElementById('view-producao');
    if(view)observer.observe(view,{childList:true,subtree:false});
    setInterval(renderWaitingApproval,4000);
  });
})();