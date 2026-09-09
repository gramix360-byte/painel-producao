(()=>{
  const KEY='koda-theme-v1';
  const media=window.matchMedia('(prefers-color-scheme: dark)');
  const valid=new Set(['light','dark','system']);

  function choice(){
    const saved=localStorage.getItem(KEY);
    return valid.has(saved)?saved:'system';
  }

  function resolved(value=choice()){
    return value==='system'?(media.matches?'dark':'light'):value;
  }

  function apply(value=choice()){
    const selected=valid.has(value)?value:'system';
    document.documentElement.dataset.theme=selected;
    document.documentElement.dataset.themeResolved=resolved(selected);
    document.querySelectorAll('[data-theme-option]').forEach(button=>{
      const active=button.dataset.themeOption===selected;
      button.classList.toggle('active',active);
      button.setAttribute('aria-pressed',String(active));
    });
  }

  function select(value){
    localStorage.setItem(KEY,value);
    apply(value);
  }

  function mount(){
    const wrap=document.querySelector('#view-configuracoes .settings-wrap');
    if(!wrap||document.querySelector('#koda-theme-card'))return;
    const card=document.createElement('section');
    card.id='koda-theme-card';
    card.className='settings-card koda-theme-card';
    card.innerHTML=`
      <div>
        <h2>Tema</h2>
        <p>Escolha a aparência do KODA neste aparelho.</p>
      </div>
      <div class="koda-theme-options" role="group" aria-label="Tema do KODA">
        <button type="button" data-theme-option="light">
          <span class="theme-preview light"><i></i><i></i><i></i></span>
          <strong>Claro</strong>
          <small>Fundo claro</small>
        </button>
        <button type="button" data-theme-option="dark">
          <span class="theme-preview dark"><i></i><i></i><i></i></span>
          <strong>Escuro</strong>
          <small>Mais confortável à noite</small>
        </button>
        <button type="button" data-theme-option="system">
          <span class="theme-preview system"><i></i><i></i><i></i></span>
          <strong>Automático</strong>
          <small>Segue o celular ou computador</small>
        </button>
      </div>`;
    wrap.prepend(card);
    card.querySelectorAll('[data-theme-option]').forEach(button=>{
      button.addEventListener('click',()=>select(button.dataset.themeOption));
    });
    apply();
  }

  apply();
  media.addEventListener?.('change',()=>{if(choice()==='system')apply('system')});
  document.addEventListener('DOMContentLoaded',()=>{
    document.querySelector('#settings-nav')?.addEventListener('click',()=>setTimeout(mount,120));
    const observer=new MutationObserver(mount);
    observer.observe(document.body,{childList:true,subtree:true});
    setTimeout(mount,500);
  });
  window.KodaTheme={apply,select,current:choice};
})();
