(()=>{
  const $=s=>document.querySelector(s),view=document.getElementById('view-expedicao');
  if(!view)return;
  let orders=[],tab='pending';
  const esc=(v='')=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const date=v=>v?new Date(v).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):'—';
  const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const methods=[['pix','PIX'],['cartao_credito','Cartão de crédito'],['cartao_debito','Cartão de débito'],['dinheiro','Dinheiro'],['transferencia','Transferência'],['boleto','Boleto'],['outro','Outro']];
  async function headers(){const s=await window.PPAuth.getSession();return{apikey:window.PPAuth.key,Authorization:`Bearer ${s.access_token}`,'Content-Type':'application/json'}}
  async function load(){
    view.innerHTML='<div class="shipping-loading">Carregando expedição...</div>';
    try{
      const r=await fetch(`${window.PPAuth.url}/rest/v1/orders?select=id,order_number,customer_name,due_date,total_amount,amount_paid,payment_status,payment_method,payment_plan,sales_channel,shipping_status,carrier,tracking_code,shipping_notes,finished_at,shipped_at,delivered_at,order_items(product_name,quantity)&status=eq.finalizado&deleted_at=is.null&order=finished_at.desc.nullslast`,{headers:await headers()});
      if(!r.ok)throw Error(await r.text());
      orders=await r.json();render();
    }catch(e){console.error(e);view.innerHTML='<div class="shipping-empty">Não foi possível carregar a expedição.</div>'}
  }
  const count=s=>orders.filter(o=>(o.shipping_status||'pending')===s).length;
  function card(o){
    const status=o.shipping_status||'pending',items=(o.order_items||[]).map(i=>`<li><b>${esc(i.quantity)}</b> × ${esc(i.product_name)}</li>`).join(''),remaining=Math.max(0,Number(o.total_amount||0)-Number(o.amount_paid||0)),market=['mercado_livre','shopee','tiktok_shop'].includes(o.sales_channel);
    if(status==='pending')return `<article class="shipping-card" data-order="${o.id}"><div class="shipping-card-head"><div><span>Pedido #${esc(o.order_number)}</span><h3>${esc(o.customer_name||'Cliente')}</h3></div><span class="shipping-badge pending">Aguardando envio</span></div><ul>${items}</ul><div class="shipping-meta">Produção finalizada: ${date(o.finished_at)}</div><div class="shipping-form"><label>Transportadora<input class="ship-carrier" value="${esc(o.carrier||'')}" placeholder="Ex.: Mercado Livre, Correios ou retirada"></label><label>Código de rastreamento<input class="ship-code" value="${esc(o.tracking_code||'')}" placeholder="Opcional para retirada ou entrega própria"></label><label class="wide">Observação<input class="ship-notes" value="${esc(o.shipping_notes||'')}" placeholder="Informação sobre a entrega"></label></div><button class="button primary ship-send">Marcar como enviado</button></article>`;
    if(status==='shipped')return `<article class="shipping-card" data-order="${o.id}"><div class="shipping-card-head"><div><span>Pedido #${esc(o.order_number)}</span><h3>${esc(o.customer_name||'Cliente')}</h3></div><span class="shipping-badge shipped">Enviado</span></div><ul>${items}</ul><div class="shipping-info"><div><small>Transportadora</small><b>${esc(o.carrier||'Não informada')}</b></div><div><small>Rastreamento</small><b>${esc(o.tracking_code||'Não informado')}</b></div><div><small>Enviado em</small><b>${date(o.shipped_at)}</b></div></div><div class="shipping-payment ${remaining>0?'due':'paid'}"><div><small>Pagamento</small><b>${remaining>0?`Saldo na entrega: ${money(remaining)}`:'Pago integralmente'}</b></div>${remaining>0&&!market?`<label>Forma de recebimento<select class="delivery-method">${methods.map(([v,l])=>`<option value="${v}" ${o.payment_method===v?'selected':''}>${l}</option>`).join('')}</select></label>`:''}</div>${o.shipping_notes?`<p class="shipping-note">${esc(o.shipping_notes)}</p>`:''}<div class="shipping-actions">${o.tracking_code?'<button class="button secondary ship-copy">Copiar rastreio</button>':''}${remaining>0&&!market?'<button class="button success ship-deliver" data-receive="true">Entregue e receber saldo</button><button class="button secondary ship-deliver" data-receive="false">Entregue — pagamento pendente</button>':'<button class="button success ship-deliver" data-receive="false">Marcar como entregue</button>'}</div></article>`;
    return `<article class="shipping-card" data-order="${o.id}"><div class="shipping-card-head"><div><span>Pedido #${esc(o.order_number)}</span><h3>${esc(o.customer_name||'Cliente')}</h3></div><span class="shipping-badge delivered">Entregue</span></div><ul>${items}</ul><div class="shipping-info"><div><small>Transportadora</small><b>${esc(o.carrier||'Não informada')}</b></div><div><small>Rastreamento</small><b>${esc(o.tracking_code||'Não informado')}</b></div><div><small>Entregue em</small><b>${date(o.delivered_at)}</b></div></div><div class="shipping-payment ${remaining>0?'due':'paid'}"><div><small>Pagamento</small><b>${remaining>0?`Pendente: ${money(remaining)}`:'Pago integralmente'}</b></div></div></article>`;
  }
  function render(){
    view.innerHTML=`<div class="shipping-shell"><div class="shipping-summary"><div><span>Aguardando envio</span><strong>${count('pending')}</strong></div><div><span>Enviados</span><strong>${count('shipped')}</strong></div><div><span>Entregues</span><strong>${count('delivered')}</strong></div></div><div class="shipping-toolbar"><input id="shipping-search" placeholder="Buscar por pedido ou cliente"><button id="shipping-refresh" class="button secondary">Atualizar</button></div><div class="shipping-tabs"><button data-status="pending" class="${tab==='pending'?'active':''}">Aguardando <b>${count('pending')}</b></button><button data-status="shipped" class="${tab==='shipped'?'active':''}">Enviados <b>${count('shipped')}</b></button><button data-status="delivered" class="${tab==='delivered'?'active':''}">Entregues <b>${count('delivered')}</b></button></div><div id="shipping-list"></div></div>`;
    const draw=()=>{const q=$('#shipping-search').value.trim().toLowerCase(),list=orders.filter(o=>(o.shipping_status||'pending')===tab&&(!q||String(o.order_number).toLowerCase().includes(q)||String(o.customer_name||'').toLowerCase().includes(q)));$('#shipping-list').innerHTML=list.length?list.map(card).join(''):'<div class="shipping-empty">Nenhum pedido nesta etapa.</div>';bindCards()};
    document.querySelectorAll('.shipping-tabs button').forEach(b=>b.onclick=()=>{tab=b.dataset.status;render()});
    $('#shipping-search').oninput=draw;$('#shipping-refresh').onclick=load;draw();
  }
  async function patch(id,body){
    const r=await fetch(`${window.PPAuth.url}/rest/v1/orders?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',headers:{...(await headers()),Prefer:'return=minimal'},body:JSON.stringify({...body,updated_at:new Date().toISOString()})});
    if(!r.ok)throw Error(await r.text());
  }
  async function completeDelivery(id,receive,method){
    const r=await fetch(`${window.PPAuth.url}/rest/v1/rpc/complete_order_delivery_payment`,{method:'POST',headers:{...(await headers()),Prefer:'return=representation'},body:JSON.stringify({p_order_id:id,p_receive_balance:receive,p_payment_method:method||null})});
    if(!r.ok)throw Error(await r.text());
    return r.json();
  }
  function bindCards(){
    document.querySelectorAll('.ship-send').forEach(b=>b.onclick=async()=>{const c=b.closest('.shipping-card'),carrier=c.querySelector('.ship-carrier').value.trim();if(!carrier)return alert('Informe a transportadora, retirada ou entrega própria.');b.disabled=true;b.textContent='Salvando...';try{await patch(c.dataset.order,{shipping_status:'shipped',carrier,tracking_code:c.querySelector('.ship-code').value.trim()||null,shipping_notes:c.querySelector('.ship-notes').value.trim()||null,shipped_at:new Date().toISOString(),delivered_at:null});tab='shipped';await load()}catch(e){console.error(e);alert('Não foi possível marcar como enviado.');b.disabled=false;b.textContent='Marcar como enviado'}});
    document.querySelectorAll('.ship-deliver').forEach(b=>b.onclick=async()=>{const c=b.closest('.shipping-card'),receive=b.dataset.receive==='true',method=c.querySelector('.delivery-method')?.value||null,old=b.textContent;b.disabled=true;b.textContent='Salvando...';try{const result=await completeDelivery(c.dataset.order,receive,method);if(receive&&Number(result?.amount_received||0)>0)alert(`Pagamento de ${money(result.amount_received)} recebido e pedido entregue.`);tab='delivered';await load();window.PPFinance?.refresh?.();window.PPSalesPayment?.refresh?.()}catch(e){console.error(e);alert('Não foi possível concluir a entrega.');b.disabled=false;b.textContent=old}});
    document.querySelectorAll('.ship-copy').forEach(b=>b.onclick=()=>{const o=orders.find(x=>x.id===b.closest('.shipping-card').dataset.order);navigator.clipboard.writeText(o?.tracking_code||'').then(()=>{b.textContent='Copiado!';setTimeout(()=>b.textContent='Copiar rastreio',1200)})});
  }
  function open(){document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));view.classList.add('active');document.querySelectorAll('#nav button').forEach(b=>b.classList.remove('active'));document.getElementById('shipping-nav')?.classList.add('active');$('#page-title').textContent='Expedição';$('#page-subtitle').textContent='Envios, rastreamento e entregas';load()}
  document.getElementById('shipping-nav')?.addEventListener('click',open);
  window.KodaShipping={open,refresh:load};
})();
