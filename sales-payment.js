(()=>{
  const $=s=>document.querySelector(s);
  const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const channelLabels={mercado_livre:'Mercado Livre',shopee:'Shopee',tiktok_shop:'TikTok Shop',site:'Site',whatsapp:'WhatsApp',venda_externa:'Venda externa',outro:'Outro'};
  const paymentLabels={pendente:'Pendente',pago:'Pago',parcial:'Parcial',cancelado:'Cancelado'};
  const methodLabels={pix:'PIX',cartao_credito:'Cartão de crédito',cartao_debito:'Cartão de débito',dinheiro:'Dinheiro',boleto:'Boleto',transferencia:'Transferência',outro:'Outro'};
  let formState={sales_channel:'venda_externa',payment_status:'pendente',payment_method:'pix',amount_paid:0};
  let remoteCache=[],cacheAt=0,loading=false;

  async function authHeaders(){const s=await window.PPAuth?.getSession();return {apikey:window.PPAuth.key,...(s?.access_token?{Authorization:`Bearer ${s.access_token}`}:{})}}

  function ensureForm(){
    const form=$('#order-form');if(!form||$('#sales-channel'))return;
    const notes=form.querySelector('label:has(#notes)');
    const wrap=document.createElement('div');wrap.className='sales-payment-fields';
    wrap.innerHTML=`<label>Canal de venda<select id="sales-channel"><option value="venda_externa">Venda externa</option><option value="whatsapp">WhatsApp</option><option value="site">Site</option><option value="mercado_livre">Mercado Livre</option><option value="shopee">Shopee</option><option value="tiktok_shop">TikTok Shop</option><option value="outro">Outro</option></select></label><label>Status do pagamento<select id="payment-status"><option value="pendente">Pendente</option><option value="pago">Pago</option><option value="parcial">Parcial</option><option value="cancelado">Cancelado</option></select></label><label>Forma de pagamento<select id="payment-method"><option value="pix">PIX</option><option value="cartao_credito">Cartão de crédito</option><option value="cartao_debito">Cartão de débito</option><option value="dinheiro">Dinheiro</option><option value="boleto">Boleto</option><option value="transferencia">Transferência</option><option value="outro">Outro</option></select></label><label class="payment-partial-wrap hidden-payment">Valor recebido (R$)<input id="amount-paid" type="number" min="0" step="0.01" inputmode="decimal" value="0.00"></label>`;
    notes?.insertAdjacentElement('beforebegin',wrap);
    $('#payment-status')?.addEventListener('change',syncPaymentUI);
    form.addEventListener('submit',captureForm,true);
    form.addEventListener('reset',()=>setTimeout(()=>{formState={sales_channel:'venda_externa',payment_status:'pendente',payment_method:'pix',amount_paid:0};syncPaymentUI()},0));
    syncPaymentUI();
  }

  function syncPaymentUI(){const status=$('#payment-status')?.value||'pendente';$('.payment-partial-wrap')?.classList.toggle('hidden-payment',status!=='parcial')}
  function captureForm(){const total=Number($('#order-total-amount')?.value||0),status=$('#payment-status')?.value||'pendente';formState={sales_channel:$('#sales-channel')?.value||'venda_externa',payment_status:status,payment_method:status==='cancelado'?null:($('#payment-method')?.value||'pix'),amount_paid:status==='pago'?total:status==='parcial'?Number($('#amount-paid')?.value||0):0}}

  const nativeFetch=window.fetch.bind(window);
  window.fetch=async function(input,init={}){
    const url=typeof input==='string'?input:input.url;
    if(url.includes('/rest/v1/orders')&&init?.method==='POST'&&init.body){
      try{const body=JSON.parse(init.body);const add=o=>({...o,sales_channel:o.sales_channel??formState.sales_channel,payment_status:o.payment_status??formState.payment_status,payment_method:o.payment_method??formState.payment_method,amount_paid:Number(o.amount_paid??formState.amount_paid??0)});init={...init,body:JSON.stringify(Array.isArray(body)?body.map(add):add(body))}}catch{}
    }
    return nativeFetch(input,init);
  };

  async function loadRemote(force=false){
    if(loading)return remoteCache;if(!force&&Date.now()-cacheAt<12000)return remoteCache;loading=true;
    try{const r=await nativeFetch(`${window.PPAuth.url}/rest/v1/orders?select=order_number,total_amount,sales_channel,payment_status,payment_method,amount_paid,created_at&order=created_at.desc&limit=500`,{headers:await authHeaders()});if(r.ok){remoteCache=await r.json();cacheAt=Date.now()}}catch(e){console.warn('Canais/pagamentos',e)}finally{loading=false}return remoteCache;
  }

  async function decorateOrders(){
    if(!$('#view-pedidos')?.classList.contains('active'))return;const rows=await loadRemote();const map=new Map(rows.map(o=>[String(o.order_number),o]));
    document.querySelectorAll('#orders-results .order-list-row').forEach(el=>{if(el.querySelector('.sales-payment-row'))return;const numText=el.querySelector('.order-number')?.textContent?.replace('#','').trim(),o=map.get(numText);if(!o)return;const meta=document.createElement('div');meta.className='sales-payment-row';meta.innerHTML=`<span class="sales-channel-badge">${channelLabels[o.sales_channel]||o.sales_channel}</span><span class="payment-status-badge ${o.payment_status}">${paymentLabels[o.payment_status]||o.payment_status}</span>${o.payment_method?`<span class="sales-channel-badge">${methodLabels[o.payment_method]||o.payment_method}</span>`:''}`;el.querySelector('.order-list-main')?.appendChild(meta)})
  }

  async function renderDashboardFinance(){
    const host=$('#view-dashboard');if(!host?.classList.contains('active')||!host.querySelector('[data-pro-dashboard]'))return;const rows=await loadRemote();
    const now=new Date(),start=new Date(now.getFullYear(),now.getMonth(),1);const month=rows.filter(o=>new Date(o.created_at)>=start);const gross=month.reduce((s,o)=>s+Number(o.total_amount||0),0),received=month.reduce((s,o)=>s+Number(o.amount_paid||0),0),pending=Math.max(0,gross-received);
    const byChannel={};month.forEach(o=>{const k=o.sales_channel||'venda_externa';byChannel[k]=(byChannel[k]||0)+Number(o.total_amount||0)});const maxC=Math.max(...Object.values(byChannel),1);
    const byPay={pago:0,parcial:0,pendente:0,cancelado:0};month.forEach(o=>{byPay[o.payment_status||'pendente']=(byPay[o.payment_status||'pendente']||0)+1});const maxP=Math.max(...Object.values(byPay),1);
    let grid=$('#dash-finance-extra');if(!grid){grid=document.createElement('div');grid.id='dash-finance-extra';grid.className='dash-finance-grid';const firstGrid=host.querySelector('.dash-grid-2');firstGrid?.insertAdjacentElement('beforebegin',grid)}
    grid.innerHTML=`<section class="dash-card"><div class="dash-section-title"><h2>Financeiro do mês</h2></div><div class="dash-finance-summary"><div><span>Vendido</span><strong>${money(gross)}</strong></div><div><span>Recebido</span><strong>${money(received)}</strong></div><div><span>A receber</span><strong>${money(pending)}</strong></div></div><div class="dash-payment-list">${Object.entries(byPay).map(([k,v])=>`<div class="dash-payment-line"><span>${paymentLabels[k]}</span><div class="dash-finance-bar"><span style="width:${(v/maxP)*100}%"></span></div><b>${v}</b></div>`).join('')}</div></section><section class="dash-card"><div class="dash-section-title"><h2>Vendas por canal no mês</h2></div><div class="dash-channel-list">${Object.keys(byChannel).length?Object.entries(byChannel).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<div class="dash-channel-line"><span>${channelLabels[k]||k}</span><div class="dash-finance-bar"><span style="width:${(v/maxC)*100}%"></span></div><b class="dash-finance-total">${money(v)}</b></div>`).join(''):'<div class="dash-empty">Ainda não há vendas neste mês.</div>'}</div></section>`;
  }

  const obs=new MutationObserver(()=>{ensureForm();if($('#view-pedidos')?.classList.contains('active'))setTimeout(decorateOrders,80);if($('#view-dashboard')?.classList.contains('active'))setTimeout(renderDashboardFinance,120)});
  document.addEventListener('DOMContentLoaded',()=>{ensureForm();obs.observe(document.body,{childList:true,subtree:true});document.addEventListener('click',e=>{if(e.target.closest('.nav-item[data-view="pedidos"]'))setTimeout(()=>decorateOrders(),180);if(e.target.closest('.nav-item[data-view="dashboard"]'))setTimeout(()=>renderDashboardFinance(),220)});setTimeout(renderDashboardFinance,1200)});
  window.PPSalesPayment={refresh:async()=>{await loadRemote(true);decorateOrders();renderDashboardFinance()}};
})();