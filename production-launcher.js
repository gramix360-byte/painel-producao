document.addEventListener('click',(event)=>{
  const button=event.target.closest('.nav-item[data-view="producao"]');
  if(!button)return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const win=window.open('./producao.html','painelProducao','popup=yes,width=1400,height=900,resizable=yes,scrollbars=yes');
  if(win){win.focus();}
  else{alert('O navegador bloqueou a janela da Produção. Permita pop-ups para este site e tente novamente.');}
},true);
