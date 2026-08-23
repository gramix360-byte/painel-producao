(()=>{
  const isStandalone=window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;
  if(isStandalone) document.documentElement.classList.add('standalone');
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
})();