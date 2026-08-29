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

  // Carrega o sincronizador de estoque do Mercado Livre sem depender do HTML principal.
  if(!document.querySelector('script[data-ml-stock-sync]')){
    const s=document.createElement('script');
    s.src='./mercadolivre-stock-sync.js';
    s.dataset.mlStockSync='1';
    s.defer=true;
    document.head.appendChild(s);
  }
})();