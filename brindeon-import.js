/* Receives a reviewed draft from BrindeOn. Saving remains in the existing order flow. */
(()=>{
  const nativeFetch=window.fetch.bind(window);
  window.fetch=async function(input,init){
    try{
      const original=typeof input==='string'?input:input?.url||'';
      if(original.includes('/rest/v1/products?')){const u=new URL(original,location.href);if(!u.searchParams.has('limit')&&(init?.method||'GET').toUpperCase()==='GET')u.searchParams.set('limit','100');input=u.toString()}
      else if(original.includes('/rest/v1/product_images?')){const u=new URL(original,location.href);if(!u.searchParams.has('limit')&&(init?.method||'GET').toUpperCase()==='GET')u.searchParams.set('limit','500');input=u.toString()}
    }catch(e){console.warn('Products performance guard',e)}
    return nativeFetch(input,init)
  };
  const productViewActive=()=>document.getElementById('view-produtos')?.classList.contains('active');
  const guardRefresh=name=>{const fn=window[name]?.refresh;if(typeof fn!=='function')return;window[name].refresh=(...args)=>productViewActive()?Promise.resolve():fn(...args)};
  const installGuards=()=>{guardRefresh('PPStandaloneCatalog');guardRefresh('PPProductPricing');guardRefresh('PPProductLocation')};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installGuards,{once:true});else installGuards();

  // Lightweight Products screen: intercept the old click before products.js can start its heavy load.
  function openLightProducts(ev){
    if(ev){ev.preventDefault();ev.stopImmediatePropagation()}
    document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
    const host=document.getElementById('view-produtos');if(!host)return;
    host.classList.add('active');
    document.querySelectorAll('.nav-item,.phase-nav-btn,.customer-nav-btn,.product-nav-btn').forEach(b=>b.classList.remove('active'));
    document.getElementById('products-nav')?.classList.add('active');
    document.getElementById('page-title').textContent='Produtos';
    document.getElementById('page-subtitle').textContent='Preços, custos, imagens e estoque';
    if(!host.dataset.lightReady){
      host.dataset.lightReady='1';
      host.innerHTML='<section style="padding:20px"><div style="display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap"><h2 style="margin:0">Produtos cadastrados</h2><button id="light-products-refresh" type="button" class="button secondary">Atualizar</button></div><input id="light-products-search" placeholder="Buscar por nome, SKU ou categoria" style="width:100%;margin:14px 0;padding:12px"><div id="light-product-list">Carregando...</div></section>';
      document.getElementById('light-products-refresh').onclick=()=>loadLightProducts(true);
      document.getElementById('light-products-search').oninput=renderLightProducts;
    }
    loadLightProducts(false);
  }
  let lightProducts=[];
  async function loadLightProducts(force){
    const list=document.getElementById('light-product-list');if(!list)return;
    if(!force&&list.dataset.loading==='1')return;list.dataset.loading='1';list.textContent='Carregando produtos...';
    try{
      const s=await window.PPAuth.getSession();if(!s?.access_token)throw Error('Sessão expirada');
      const h={apikey:window.PPAuth.key,Authorization:`Bearer ${s.access_token}`};
      const r=await nativeFetch(`${window.PPAuth.url}/rest/v1/products?select=id,sku,name,cost_price,sale_price,stock,low_stock_threshold,category&deleted_at=is.null&order=name.asc&limit=100`,{headers:h});
      if(!r.ok)throw Error(await r.text());lightProducts=await r.json();renderLightProducts();
    }catch(e){console.error(e);list.textContent='Não foi possível carregar os produtos. Clique em Atualizar para tentar novamente.'}
    finally{if(list)list.dataset.loading='0'}
  }
  function renderLightProducts(){
    const list=document.getElementById('light-product-list');if(!list)return;
    const q=(document.getElementById('light-products-search')?.value||'').trim().toLowerCase();
    const rows=lightProducts.filter(p=>!q||[p.name,p.sku,p.category].some(v=>String(v||'').toLowerCase().includes(q)));
    list.innerHTML=rows.length?rows.map(p=>`<article class="product-card"><div class="product-card-head"><div style="flex:1"><h3>${String(p.name||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}</h3><div class="product-card-meta"><span>SKU ${p.sku||'-'}</span><span>Estoque ${Number(p.stock||0)}</span></div><div class="product-price">Venda R$ ${Number(p.sale_price||0).toFixed(2).replace('.',',')}</div></div></div></article>`).join(''):'<div class="product-empty">Nenhum produto encontrado.</div>';
  }
  function installLightHandler(){
    const nav=document.getElementById('products-nav');if(!nav||nav.dataset.lightHandler)return;nav.dataset.lightHandler='1';nav.addEventListener('click',openLightProducts,true);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installLightHandler,{once:true});else installLightHandler();

  const ORIGIN='https://brindeon-atendimento.gramix360.chatgpt.site',KEY='brindeon-transfer';
  const match=location.hash.match(/^#brindeon=([a-f0-9-]{36})$/);if(match)sessionStorage.setItem(KEY,JSON.stringify({nonce:match[1],time:Date.now()}));
  let pending;try{pending=JSON.parse(sessionStorage.getItem(KEY)||'null')}catch{}
  if(!pending||Date.now()-pending.time>180000||!window.opener)return;
  const source=window.opener;let received=false,processing=false;
  const send=(type,extra={})=>source.postMessage({type,nonce:pending.nonce,...extra},ORIGIN);
  const ready=()=>document.body?.style.visibility==='visible'&&document.querySelector('#items-list .item-row')&&document.getElementById('client-files')&&document.getElementById('sales-channel');
  const input=(selector,value)=>{const el=document.querySelector(selector);if(!el)throw Error('O formulário ainda não está pronto. Atualize o painel.');el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))};
  async function fill(data){
    const o=data.order;if(!o||o.reference!==pending.nonce||typeof o.customerName!=='string'||!o.customerName.trim()||o.customerName.length>120||!/^\d{10,15}$/.test(o.phone)||typeof o.product!=='string'||!o.product.trim()||o.product.length>200||!Number.isInteger(o.quantity)||o.quantity<1||o.quantity>100000||typeof o.due!=='string'||(o.due&&!/^\d{4}-\d{2}-\d{2}$/.test(o.due))||typeof o.notes!=='string'||o.notes.length>2000||typeof o.personalization!=='string'||o.personalization.length>1000)throw Error('Os dados do pedido são inválidos. Revise no BrindeOn.');
    let file=null;if(data.file){file=data.file;if(!(file instanceof Blob)||!['image/png','image/jpeg'].includes(file.type)||file.size>10*1024*1024)throw Error('A arte deve ser PNG/JPG com até 10 MB.');const h=new Uint8Array(await file.slice(0,8).arrayBuffer());if(!(file.type==='image/png'?h[0]===137&&h[1]===80&&h[2]===78&&h[3]===71:h[0]===255&&h[1]===216&&h[2]===255))throw Error('Arquivo de arte inválido.')}
    if(!ready())throw Error('Aguarde o carregamento e o login do Painel de Produção.');
    if(document.querySelector('#customer-name').value.trim()||[...document.querySelectorAll('.item-product')].some(e=>e.value.trim()))throw Error('Já há um pedido sendo preenchido nesta janela. Conclua ou limpe o formulário antes de transferir outro.');
    document.querySelector('.nav-item[data-view="novo"]').click();input('#customer-name',o.customerName);input('#due-date',o.due);input('#priority','normal');input('#notes',`Origem: WhatsApp BrindeOn\nWhatsApp do cliente: +${o.phone}\nReferência: ${o.reference}${o.notes?'\n'+o.notes:''}`);input('#items-list .item-qty',o.quantity);input('#items-list .item-product',o.product);input('#items-list .item-personalization',o.personalization);input('#sales-channel','whatsapp');
    if(file){const dt=new DataTransfer();dt.items.add(new File([file],file.name||'arte-whatsapp.'+(file.type==='image/png'?'png':'jpg'),{type:file.type}));const el=document.getElementById('client-files');el.files=dt.files;el.dispatchEvent(new Event('change',{bubbles:true}))}
    let banner=document.getElementById('brindeon-import-notice');if(!banner){banner=document.createElement('p');banner.id='brindeon-import-notice';banner.setAttribute('role','status');banner.style.cssText='padding:14px;border:1px solid #b8dca0;border-radius:10px;background:#f0f8e5;color:#244814';document.getElementById('order-form').prepend(banner)}banner.textContent='Pedido recebido do BrindeOn. Confira o produto cadastrado, os valores, o prazo e os arquivos antes de clicar em Cadastrar pedido.';document.getElementById('order-form').scrollIntoView({behavior:'smooth'});received=true;sessionStorage.removeItem(KEY);history.replaceState(null,'',location.pathname+location.search);send('brindeon-filled')
  }
  window.addEventListener('message',async event=>{if(event.origin!==ORIGIN||event.source!==source||event.data?.nonce!==pending.nonce||Date.now()-pending.time>180000)return;if(event.data.type==='brindeon-ping'){if(received)send('brindeon-filled');else if(ready())send('brindeon-ready');return}if(event.data.type!=='brindeon-order')return;if(received){send('brindeon-filled');return}if(processing||!ready())return;processing=true;try{await fill(event.data)}catch(e){send('brindeon-error',{message:e.message||'Não foi possível preencher o pedido.'})}finally{processing=false}})
})();