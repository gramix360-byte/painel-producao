(()=>{
  const isStandalone=window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;
  if(isStandalone) document.documentElement.classList.add('standalone');

  // Mantém o app instalado sempre na versão mais recente.
  if('serviceWorker' in navigator){
    window.addEventListener('load',async()=>{
      try{
        const reg=await navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'});
        await reg.update();
        let reloading=false;
        navigator.serviceWorker.addEventListener('controllerchange',()=>{
          if(reloading)return;
          reloading=true;
          location.reload();
        });
        if(reg.waiting) reg.waiting.postMessage?.({type:'SKIP_WAITING'});
      }catch(err){console.error('Falha ao atualizar app',err)}
    });
  }

  let deferredPrompt=null;
  const button=document.getElementById('install-app');
  const tip=document.getElementById('ios-install-tip');
  const close=document.getElementById('ios-install-close');
  const isIOS=/iphone|ipad|ipod/i.test(navigator.userAgent);
  window.addEventListener('beforeinstallprompt',event=>{
    event.preventDefault();
    deferredPrompt=event;
    button?.classList.add('show');
  });
  button?.addEventListener('click',async()=>{
    if(deferredPrompt){
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt=null;
      button.classList.remove('show');
      return;
    }
    if(isIOS&&!isStandalone) tip?.classList.add('show');
  });
  if(isIOS&&!isStandalone) button?.classList.add('show');
  close?.addEventListener('click',()=>tip?.classList.remove('show'));
  window.addEventListener('appinstalled',()=>{
    deferredPrompt=null;
    button?.classList.remove('show');
    tip?.classList.remove('show');
  });

  // Sincronização automática de estoque: qualquer alteração de estoque em Produtos
  // chama o backend do Mercado Livre depois que o produto é salvo com sucesso.
  if(!window.__PP_ML_STOCK_SYNC__){
    window.__PP_ML_STOCK_SYNC__=true;
    const nativeFetch=window.fetch.bind(window);
    async function mlHeaders(){
      const s=await window.PPAuth.getSession();
      if(!s?.access_token) throw new Error('Sessão expirada');
      return {apikey:window.PPAuth.key,Authorization:`Bearer ${s.access_token}`,'Content-Type':'application/json'};
    }
    async function syncProduct(productId){
      if(!productId)return null;
      try{
        const r=await nativeFetch(`${window.PPAuth.url}/functions/v1/mercadolivre-sync-stock`,{
          method:'POST',headers:await mlHeaders(),body:JSON.stringify({product_id:productId})
        });
        const d=await r.json().catch(()=>({}));
        if(!r.ok||d.error) throw new Error(d.error||'Falha ao sincronizar estoque');
        const item=d.results?.[0];
        if(item&&!item.ok) console.warn('Mercado Livre: estoque não sincronizado',item.error);
        return item||d;
      }catch(e){
        console.warn('Mercado Livre: erro na sincronização automática de estoque',e);
        return null;
      }
    }
    window.fetch=async function(input,init={}){
      const response=await nativeFetch(input,init);
      try{
        const url=typeof input==='string'?input:input?.url||'';
        const method=String(init?.method||'GET').toUpperCase();
        if(response.ok&&url.includes('/rest/v1/products')&&(method==='POST'||method==='PATCH')){
          let body={};
          try{body=typeof init.body==='string'?JSON.parse(init.body):{}}catch{}
          if(!body.deleted_at&&body.stock!==undefined){
            let productId='';
            const m=url.match(/[?&]id=eq\.([^&]+)/);
            if(m) productId=decodeURIComponent(m[1]);
            else{
              try{const rows=await response.clone().json();productId=rows?.[0]?.id||''}catch{}
            }
            if(productId) setTimeout(()=>syncProduct(productId),250);
          }
        }
      }catch(e){console.warn('Mercado Livre: falha ao agendar estoque',e)}
      return response;
    };
    window.PPMercadoLivreStock={syncProduct};
  }
})();