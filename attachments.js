(()=>{
  const BUCKET='client-files';
  let selected=[];
  let pending=[];
  let busy=false;
  const previousFetch=window.fetch.bind(window);

  const safe=(s='')=>String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt',"'":'&#39;','"':'&quot;'}[c]));
  const encodePath=p=>p.split('/').map(encodeURIComponent).join('/');
  const valid=f=>['image/png','image/jpeg'].includes(f.type)&&f.size<=10*1024*1024;

  function ensureUI(){
    const form=document.getElementById('order-form');
    if(!form||document.getElementById('client-files'))return;
    const actions=form.querySelector('.form-actions');
    const box=document.createElement('div');
    box.className='client-files-box';
    box.innerHTML=`<div class="client-files-head"><div><h3>Arquivos do Cliente</h3><small>Logo ou referência em PNG/JPG/JPEG · até 10 MB por imagem</small></div></div><label class="client-files-drop"><input id="client-files" type="file" accept="image/png,image/jpeg,.jpg,.jpeg,.png" multiple/><strong>Selecionar imagens</strong><span>Você pode adicionar mais de uma imagem</span></label><div id="client-files-preview" class="client-files-preview"></div>`;
    actions.before(box);
    const input=box.querySelector('#client-files');
    input.addEventListener('change',()=>{
      const add=[...input.files].filter(valid);
      if(add.length!==input.files.length)alert('Use apenas PNG/JPG/JPEG com até 10 MB por imagem.');
      selected=[...selected,...add].slice(0,10);
      input.value='';renderPreview();
    });
  }

  function renderPreview(){
    const el=document.getElementById('client-files-preview');if(!el)return;
    el.innerHTML='';
    selected.forEach((f,i)=>{
      const url=URL.createObjectURL(f),card=document.createElement('div');card.className='client-file-preview';
      card.innerHTML=`<img src="${url}" alt=""><span title="${safe(f.name)}">${safe(f.name)}</span><button type="button" data-i="${i}">×</button>`;
      card.querySelector('img').addEventListener('load',()=>URL.revokeObjectURL(url),{once:true});
      card.querySelector('button').onclick=()=>{selected.splice(i,1);renderPreview();};el.appendChild(card);
    });
  }

  async function session(){return window.PPAuth?.getSession?.();}
  async function uploadOne(orderId,file){
    const s=await session();if(!s?.access_token)throw new Error('Sessão expirada');
    const ext=file.type==='image/png'?'png':'jpg';
    const path=`${orderId}/${crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random().toString(16).slice(2)}.${ext}`;
    const r=await previousFetch(`${window.PPAuth.url}/storage/v1/object/${BUCKET}/${encodePath(path)}`,{method:'POST',headers:{apikey:window.PPAuth.key,Authorization:`Bearer ${s.access_token}`,'Content-Type':file.type,'x-upsert':'false'},body:file});
    if(!r.ok)throw new Error(await r.text());
    const meta={order_id:orderId,file_name:file.name,storage_path:path,mime_type:file.type,file_size:file.size};
    const m=await previousFetch(`${window.PPAuth.url}/rest/v1/order_files`,{method:'POST',headers:{apikey:window.PPAuth.key,Authorization:`Bearer ${s.access_token}`,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify(meta)});
    if(!m.ok)throw new Error(await m.text());
  }

  async function uploadPending(orderId){
    if(busy||!pending.length)return;busy=true;
    const files=[...pending];pending=[];
    try{for(const f of files)await uploadOne(orderId,f);}
    catch(e){console.error('Anexo',e);alert('O pedido foi salvo, mas uma imagem não conseguiu ser enviada. Tente novamente com internet estável.');}
    finally{busy=false;selected=[];renderPreview();setTimeout(decorateOrders,600);}
  }

  window.fetch=async function(input,init={}){
    const response=await previousFetch(input,init);
    try{
      const url=typeof input==='string'?input:input.url;
      const method=(init.method||(typeof input!=='string'?input.method:'GET')||'GET').toUpperCase();
      if(response.ok&&method==='POST'&&url.includes('/rest/v1/order_items')&&pending.length){
        const body=typeof init.body==='string'?JSON.parse(init.body):null;
        const arr=Array.isArray(body)?body:[body];
        const orderId=arr.find(x=>x?.order_id)?.order_id;
        if(orderId)setTimeout(()=>uploadPending(orderId),250);
      }
    }catch(e){console.warn('Anexos',e)}
    return response;
  };

  document.addEventListener('submit',e=>{
    if(e.target?.id!=='order-form')return;
    if(selected.length&&!navigator.onLine){e.preventDefault();e.stopImmediatePropagation();alert('Para enviar as imagens do cliente, conecte-se à internet ou remova os anexos antes de cadastrar.');return;}
    pending=[...selected];
  },true);

  async function fetchFiles(){
    const s=await session();if(!s)return[];
    const r=await previousFetch(`${window.PPAuth.url}/rest/v1/order_files?select=*,orders(order_number)&order=created_at.asc`,{headers:{apikey:window.PPAuth.key,Authorization:`Bearer ${s.access_token}`}});
    return r.ok?await r.json():[];
  }
  async function getBlob(path){
    const s=await session();
    const r=await previousFetch(`${window.PPAuth.url}/storage/v1/object/authenticated/${BUCKET}/${encodePath(path)}`,{headers:{apikey:window.PPAuth.key,Authorization:`Bearer ${s.access_token}`}});
    if(!r.ok)throw new Error(await r.text());return r.blob();
  }
  async function openFiles(orderNumber){
    let modal=document.getElementById('attachments-modal');
    if(!modal){modal=document.createElement('div');modal.id='attachments-modal';modal.className='attachments-modal hidden';modal.innerHTML='<div class="attachments-dialog"><div class="attachments-dialog-head"><h2>Arquivos do Cliente</h2><button class="attachments-close" type="button">×</button></div><div class="attachments-grid"></div></div>';document.body.appendChild(modal);modal.querySelector('.attachments-close').onclick=()=>modal.classList.add('hidden');modal.onclick=e=>{if(e.target===modal)modal.classList.add('hidden')};}
    const grid=modal.querySelector('.attachments-grid');grid.innerHTML='<div>Carregando...</div>';modal.classList.remove('hidden');
    const rows=(await fetchFiles()).filter(x=>String(x.orders?.order_number)===String(orderNumber));grid.innerHTML='';
    for(const row of rows){try{const blob=await getBlob(row.storage_path),url=URL.createObjectURL(blob),card=document.createElement('div');card.className='attachment-card';card.innerHTML=`<img src="${url}" alt=""><div><strong>${safe(row.file_name)}</strong><br><a href="${url}" target="_blank" rel="noopener">Abrir imagem</a></div>`;grid.appendChild(card);}catch(e){console.warn(e)}}
    if(!rows.length)grid.innerHTML='<div>Nenhum arquivo neste pedido.</div>';
  }
  async function decorateOrders(){
    const view=document.getElementById('view-pedidos');if(!view||!view.classList.contains('active'))return;
    const files=await fetchFiles(),counts={};files.forEach(f=>{const n=f.orders?.order_number;if(n!=null)counts[n]=(counts[n]||0)+1});
    view.querySelectorAll('.order-list-row').forEach(row=>{if(row.querySelector('.attachment-button'))return;const num=(row.querySelector('.order-number')?.textContent||'').replace('#','').trim();if(!counts[num])return;const b=document.createElement('button');b.type='button';b.className='attachment-button';b.textContent=`Arquivos (${counts[num]})`;b.onclick=()=>openFiles(num);row.appendChild(b);});
  }
  const observer=new MutationObserver(()=>setTimeout(decorateOrders,100));
  document.addEventListener('DOMContentLoaded',()=>{ensureUI();const v=document.getElementById('view-pedidos');if(v)observer.observe(v,{childList:true,subtree:true});document.addEventListener('click',e=>{if(e.target.closest('.nav-item[data-view="pedidos"]'))setTimeout(decorateOrders,350)});});
})();