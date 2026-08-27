(()=>{
  const $=s=>document.querySelector(s);
  const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const num=v=>Number(v||0).toLocaleString('pt-BR');
  const localDate=d=>{const x=new Date(d);return new Date(x.getFullYear(),x.getMonth(),x.getDate())};
  const isoDate=d=>{const x=new Date(d);return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`};
  const host=$('#view-dashboard');
  let loading=false,lastRows=[],lastFetch=0,rendering=false,lastSignature='';

  // Prevent the legacy dashboard renderer from replacing the professional dashboard every sync cycle.
  const innerHTMLDescriptor=Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML');
  if(host&&innerHTMLDescriptor){
    Object.defineProperty(host,'innerHTML',{
      configurable:true,
      get(){return innerHTMLDescriptor.get.call(this)},
      set(value){
        if(rendering||!this.querySelector('[data-pro-dashboard]')) innerHTMLDescriptor.set.call(this,value);
      }
    });
  }

  async function headers(){const s=await window.PPAuth?.getSession();return {apikey:window.PPAuth.key,...(s?.access_token?{Authorization:`Bearer ${s.access_token}`}:{})}}
  function signature(rows){return rows.map(o=>`${o.id}:${o.updated_at||o.created_at}:${o.total_amount}:${o.phase}:${o.status}`).join('|')}
  function cacheRows(rows){try{sessionStorage.setItem('pp-dashboard-cache',JSON.stringify({at:Date.now(),rows}))}catch{}}
  function restoreCache(){try{const c=JSON.parse(sessionStorage.getItem('pp-dashboard-cache')||'null');if(c?.rows?.length){lastRows=c.rows;lastFetch=c.at||0;render(lastRows,true);return true}}catch{}return false}

  async function load(force=false){
    if(!host||!host.classList.contains('active')||loading)return;
    if(!force&&lastRows.length&&Date.now()-lastFetch<30000){if(!host.querySelector('[data-pro-dashboard]'))render(lastRows,true);return}
    loading=true;
    try{
      const h=await headers();
      const monthFloor=new Date();monthFloor.setMonth(monthFloor.getMonth()-2,1);monthFloor.setHours(0,0,0,0);
      const r=await fetch(`${window.PPAuth.url}/rest/v1/orders?select=id,order_number,customer_name,total_amount,status,phase,priority,created_at,updated_at,finished_at,order_items(product_name,quantity,line_total,unit_price)&created_at=gte.${encodeURIComponent(monthFloor.toISOString())}&order=created_at.desc`,{headers:h});
      if(!r.ok)throw new Error(await r.text());
      const rows=await r.json();lastFetch=Date.now();cacheRows(rows);
      const sig=signature(rows);
      if(sig!==lastSignature||!host.querySelector('[data-pro-dashboard]')){lastRows=rows;lastSignature=sig;render(rows)}
    }catch(e){console.warn('Dashboard profissional',e);if(lastRows.length&&!host.querySelector('[data-pro-dashboard]'))render(lastRows,true)}finally{loading=false}
  }

  function between(rows,start,end){return rows.filter(o=>{const d=new Date(o.created_at);return d>=start&&d<end})}
  function sum(rows){return rows.reduce((s,o)=>s+Number(o.total_amount||0),0)}
  function pct(now,prev){if(!prev)return now?100:0;return ((now-prev)/prev)*100}
  function pctBox(label,value){const up=value>=0;return `<div class="dash-compare ${up?'up':'down'}"><small>${label}</small><strong>${up?'↗':'↘'} ${value>=0?'+':''}${value.toFixed(1)}%</strong></div>`}
  function escapeHtml(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

  function render(rows,fromCache=false){
    if(!host)return;
    const now=new Date(),today=localDate(now),tomorrow=new Date(today);tomorrow.setDate(tomorrow.getDate()+1);
    const yesterday=new Date(today);yesterday.setDate(yesterday.getDate()-1);
    const weekStart=new Date(today);weekStart.setDate(weekStart.getDate()-((weekStart.getDay()+6)%7));
    const monthStart=new Date(today.getFullYear(),today.getMonth(),1),nextMonth=new Date(today.getFullYear(),today.getMonth()+1,1);
    const lastWeekDay=new Date(today);lastWeekDay.setDate(lastWeekDay.getDate()-7);const lastWeekDayEnd=new Date(lastWeekDay);lastWeekDayEnd.setDate(lastWeekDayEnd.getDate()+1);
    const todayRows=between(rows,today,tomorrow),yesterdayRows=between(rows,yesterday,today),weekRows=between(rows,weekStart,tomorrow),monthRows=between(rows,monthStart,nextMonth),lastWeekSame=between(rows,lastWeekDay,lastWeekDayEnd);
    const todayTotal=sum(todayRows),yesterdayTotal=sum(yesterdayRows),weekTotal=sum(weekRows),monthTotal=sum(monthRows),sameDayTotal=sum(lastWeekSame);
    const waiting=rows.filter(o=>o.phase==='aguardando_aprovacao').length,doing=rows.filter(o=>o.phase==='em_producao').length,done=rows.filter(o=>o.status==='finalizado').length,totalStatus=Math.max(waiting+doing+done,1);
    const a=(waiting/totalStatus*100).toFixed(2)+'%',b=(doing/totalStatus*100).toFixed(2)+'%';
    const daily=[];for(let i=6;i>=0;i--){const d=new Date(today);d.setDate(d.getDate()-i);const e=new Date(d);e.setDate(e.getDate()+1);daily.push({label:d.toLocaleDateString('pt-BR',{weekday:'short'}).replace('.',''),value:sum(between(rows,d,e))})}const maxDay=Math.max(...daily.map(x=>x.value),1);
    const top={};monthRows.forEach(o=>(o.order_items||[]).forEach(i=>{const k=i.product_name||'Produto';if(!top[k])top[k]={name:k,q:0,v:0};top[k].q+=Number(i.quantity||0);top[k].v+=Number(i.line_total||0)}));const topList=Object.values(top).sort((x,y)=>y.v-x.v).slice(0,10);
    const dateText=now.toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long'});
    rendering=true;
    host.innerHTML=`<div class="dashboard-pro" data-pro-dashboard="1">
      <section class="dash-card dash-hero"><div class="dash-hero-date">◷ ${dateText}</div><div><div class="dash-live">${fromCache?'DADOS SALVOS':'AO VIVO'}</div><div class="dash-kicker">Faturamento hoje</div><div class="dash-big">${money(todayTotal)}</div><div class="dash-orders-count">🛒 ${num(todayRows.length)} pedido(s)</div><div class="dash-comparisons">${pctBox('vs ontem',pct(todayTotal,yesterdayTotal))}${pctBox('vs semana passada',pct(todayTotal,sameDayTotal))}</div></div></section>
      <div class="dash-grid-3"><section class="dash-card"><div class="dash-metric-title">Faturamento hoje</div><div class="dash-metric-value">${money(todayTotal)}</div><div class="dash-metric-sub">${num(todayRows.length)} pedido(s)</div></section><section class="dash-card"><div class="dash-metric-title">Faturamento da semana</div><div class="dash-metric-value">${money(weekTotal)}</div><div class="dash-metric-sub">${num(weekRows.length)} pedido(s)</div></section><section class="dash-card"><div class="dash-metric-title">Faturamento do mês</div><div class="dash-metric-value">${money(monthTotal)}</div><div class="dash-metric-sub">${num(monthRows.length)} pedido(s)</div></section></div>
      <div class="dash-grid-2"><section class="dash-card"><div class="dash-section-title"><h2>Status dos pedidos</h2><span>${waiting+doing+done} total</span></div><div class="dash-status-row"><div class="dash-donut" style="--a:${a};--b:${b}"><span>${waiting+doing+done}</span></div><div class="dash-legend"><div><span><i class="dash-dot" style="background:#2f80d1"></i>Aguardando aprovação</span><b>${waiting}</b></div><div><span><i class="dash-dot" style="background:#123a70"></i>Em produção</span><b>${doing}</b></div><div><span><i class="dash-dot" style="background:#20a36a"></i>Finalizados</span><b>${done}</b></div></div></div></section><section class="dash-card"><div class="dash-section-title"><h2>Faturamento dos últimos 7 dias</h2></div><div class="dash-bars">${daily.map(x=>`<div class="dash-bar-wrap"><div class="dash-bar-value">${x.value?money(x.value).replace('R$ ','R$ '):'R$ 0'}</div><div class="dash-bar" style="height:${Math.max(5,(x.value/maxDay)*125)}px"></div><div class="dash-bar-label">${x.label}</div></div>`).join('')}</div></section></div>
      <div class="dash-grid-2"><section class="dash-card"><div class="dash-section-title"><h2>Faturamento por período</h2></div><div class="dash-period-controls"><label>De<input id="dash-date-from" type="date" value="${isoDate(today)}"></label><label>Até<input id="dash-date-to" type="date" value="${isoDate(today)}"></label></div><div class="dash-period-shortcuts"><button data-range="today">Hoje</button><button data-range="7">Últimos 7 dias</button><button data-range="month">Mês atual</button></div><div id="dash-period-value" class="dash-period-result">${money(todayTotal)}</div><div id="dash-period-count" class="dash-metric-sub">${todayRows.length} pedido(s)</div></section><section class="dash-card"><div class="dash-section-title"><h2>Top 10 Produtos do Mês</h2></div>${topList.length?`<table class="dash-table"><thead><tr><th>#</th><th>Produto</th><th>Qtd</th><th>Faturamento</th></tr></thead><tbody>${topList.map((x,i)=>`<tr><td><span class="dash-rank">${i+1}</span></td><td>${escapeHtml(x.name)}</td><td>${num(x.q)}</td><td><b>${money(x.v)}</b></td></tr>`).join('')}</tbody></table>`:'<div class="dash-empty">Ainda não há vendas de produtos neste mês.</div>'}</section></div>
    </div>`;
    rendering=false;bindPeriod(rows);
  }

  function bindPeriod(rows){const f=$('#dash-date-from'),t=$('#dash-date-to');const calc=()=>{if(!f?.value||!t?.value)return;const s=new Date(f.value+'T00:00:00'),e=new Date(t.value+'T00:00:00');e.setDate(e.getDate()+1);const list=between(rows,s,e);$('#dash-period-value').textContent=money(sum(list));$('#dash-period-count').textContent=`${list.length} pedido(s)`};f?.addEventListener('change',calc);t?.addEventListener('change',calc);document.querySelectorAll('[data-range]').forEach(b=>b.onclick=()=>{const today=localDate(new Date()),from=new Date(today);if(b.dataset.range==='7')from.setDate(from.getDate()-6);if(b.dataset.range==='month')from.setDate(1);f.value=isoDate(from);t.value=isoDate(today);calc()})}

  restoreCache();
  document.addEventListener('DOMContentLoaded',()=>{
    if(lastRows.length&&!host.querySelector('[data-pro-dashboard]'))render(lastRows,true);
    document.addEventListener('click',e=>{if(e.target.closest('.nav-item[data-view="dashboard"]'))setTimeout(()=>load(false),80)});
    setTimeout(()=>load(true),350);
    setInterval(()=>{if(document.visibilityState==='visible'&&host?.classList.contains('active'))load(false)},60000);
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&host?.classList.contains('active'))load(false)});
  });
  window.PPDashboardPro={refresh:()=>load(true)};
})();