document.addEventListener('click',(event)=>{
  const button=event.target.closest('.nav-item[data-view="producao"]');
  if(!button)return;

  const isMobile=window.matchMedia('(max-width: 760px)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if(isMobile){
    return;
  }

  // Não bloqueia o clique do menu: o app.js continua abrindo a view Produção
  // dentro do próprio sistema. Em paralelo, abre/foca a janela para a 2ª tela.
  setTimeout(()=>{
    const win=window.open('./producao.html','painelProducao','popup=yes,width=1400,height=900,resizable=yes,scrollbars=yes');
    if(win){
      win.focus();
    }else{
      alert('O navegador bloqueou a janela da Produção. Permita pop-ups para este site e tente novamente.');
    }
  },0);
},true);
