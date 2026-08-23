(()=>{
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
        const db=req.result;
        const tx=db.transaction('orders','readwrite');
        const st=tx.objectStore('orders');
        const g=st.get(orderId);
        await new Promise((resolve,reject)=>{g.onsuccess=resolve;g.onerror=()=>reject(g.error)});
        if(g.result){const o=g.result;o.phase='finalizado';o.status='finalizado';o.finished_at=now;o.updated_at=now;st.put(o)}
        await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});
        db.close();
      }catch(e){console.warn('Não foi possível atualizar a fase local',e)}
      if('BroadcastChannel'in window){const ch=new BroadcastChannel('painel-producao-updates');ch.postMessage({type:'changed'});ch.close()}
      window.PPPhases?.refresh?.();
    }catch(e){console.error('Falha ao avançar fase após produção',e)}
  }

  document.addEventListener('click',event=>{
    const btn=event.target.closest('.status-action[data-status="finalizado"]');
    if(!btn)return;
    setTimeout(()=>patchPhaseToFinalized(btn.dataset.id),250);
  },true);
})();