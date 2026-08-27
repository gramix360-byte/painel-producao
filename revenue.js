(()=>{
  const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const isoLocal=d=>{const x=new Date(d);const y=x.getFullYear(),m=String(x.getMonth()+1).padStart(2,'0'),day=String(x.getDate()).padStart(2,'0');return `${y}-${m}-${day}`};
  let currentOrderValue=0;

  function addValueField(){
    const form=document.getElementById('order-form');
    const grid=form?.querySelector('.form-grid');
    if(!grid||document.getElementById('order-total-amount'))return;
    const label=document.createElement('label');
    label.innerHTML='Valor do pedido (R$)<input id="order-total-amount" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0,00" />';
    grid.appendChild(label);
    form.addEventListener('submit',()=>{currentOrderValue=Number(document.getElementById('order-total-amount')?.value||0)},true);
  }

  const nativeFetch=window.fetch.bind(window);
  window.fetch=async function(input,init={}){
    const url=typeof input==='string'?input:input.url;
    if(url.includes('/rest/v1/orders')&&init?.method==='POST'&&init.body){
      try{
        const body=JSON.parse(init.body);
        const inject=o=>({...o,total_amount:Number(o.total_amount??currentOrderValue??0)});
        init={...init,body:JSON.stringify(Array.isArray(body)?body.map(inject):inject(body))};
      }catch{}
    }
    return nativeFetch(input,init);
  };

  async function fetchRevenue(){
    try{
      const now=new Date();
      const monthStart=new Date(now.getFullYear(),now.getMonth(),1,0,0,0,0);
      const dayStart=new Date(now.getFullYear(),now.getMonth(),now.getDate(),0,0,0,0);
      const weekStart=new Date(dayStart);const dow=(weekStart.getDay()+6)%7;weekStart.setDate(weekStart.getDate()-dow);
      const r=await fetch(`${window.PPAuth.url}/rest/v1/orders?select=total_amount,created_at&created_at=gte.${encodeURIComponent(monthStart.toISOString())}&order=created_at.desc`,{headers:{apikey:window.PPAuth.key}});
      if(!r.ok)throw new Error(await r.text());
      const rows=await r.json();
      const sumFrom=start=>rows.filter(o=>new Date(o.created_at)>=start).reduce((s,o)=>s+Number(o.total_amount||0),0);
      renderRevenue(sumFrom(dayStart),sumFrom(weekStart),sumFrom(monthStart));
    }catch(e){console.warn('Faturamento',e)}
  }

  function renderRevenue(today,week,month){
    const dash=document.getElementById('view-dashboard');if(!dash)return;
    let wrap=document.getElementById('revenue-stats');
    if(!wrap){
      wrap=document.createElement('div');wrap.id='revenue-stats';wrap.className='stats revenue-stats';
      dash.prepend(wrap);
    }
    wrap.innerHTML=`<div class="stat revenue-card"><span>Faturamento hoje</span><strong>${money(today)}</strong></div><div class="stat revenue-card"><span>Faturamento da semana</span><strong>${money(week)}</strong></div><div class="stat revenue-card"><span>Faturamento do mês</span><strong>${money(month)}</strong></div>`;
  }

  const observer=new MutationObserver(()=>{
    addValueField();
    if(document.getElementById('view-dashboard')?.classList.contains('active'))fetchRevenue();
  });

  document.addEventListener('DOMContentLoaded',()=>{
    addValueField();
    observer.observe(document.body,{childList:true,subtree:true});
    document.addEventListener('click',e=>{if(e.target.closest('.nav-item[data-view="dashboard"]'))setTimeout(fetchRevenue,250)});
    setTimeout(fetchRevenue,700);
    setInterval(()=>{if(document.getElementById('view-dashboard')?.classList.contains('active'))fetchRevenue()},15000);
  });
})();