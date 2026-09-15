/* Read-only order acknowledgements. Uses the panel's authenticated session. */
(()=>{
 const origin='https://brindeon-atendimento.gramix360.chatgpt.site',key='brindeon-status-channel';
 const match=location.hash.match(/^#brindeon(?:-sync)?=([a-f0-9-]{36})$/);
 if(match)sessionStorage.setItem(key,JSON.stringify({nonce:match[1],at:Date.now()}));
 let channel;try{channel=JSON.parse(sessionStorage.getItem(key)||'null')}catch{}
 if(!channel||Date.now()-channel.at>12*3600000||!window.opener)return;
 const source=window.opener;let busy=false,last=0;
 const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
 window.addEventListener('message',async event=>{
  const data=event.data;
  if(event.origin!==origin||event.source!==source||data?.nonce!==channel.nonce||data.type!=='brindeon-status-request'||busy||Date.now()-last<5000)return;
  if(!Array.isArray(data.references)||!data.references.length||data.references.length>100||!data.references.every(r=>typeof r==='string'&&uuid.test(r)))return;
  if(!window.PPAuth||document.body?.style.visibility!=='visible')return;
  busy=true;last=Date.now();
  const send=(type,rest)=>source.postMessage({type,nonce:channel.nonce,...rest},origin);
  try{
   const session=await window.PPAuth.getSession();if(!session)throw Error('Entre no Painel de Produção para atualizar os pedidos.');
   const params=new URLSearchParams({select:'id,order_number,status,shipping_status,notes,updated_at',deleted_at:'is.null',or:'('+data.references.map(r=>'notes.like.*'+r+'*').join(',')+')',limit:'100'});
   const response=await fetch(window.PPAuth.url+'/rest/v1/orders?'+params,{headers:{apikey:window.PPAuth.key},cache:'no-store'});
   if(!response.ok)throw Error('Não foi possível consultar a produção. Confira a conexão e o login.');
   const rows=await response.json();if(!Array.isArray(rows))throw Error('Resposta inválida do painel.');
   const orders=[];
   for(const row of rows){const reference=String(row.notes||'').match(/(?:^|\n)Referência: ([a-f0-9-]{36})(?:\n|$)/)?.[1];if(!reference||!data.references.includes(reference))continue;
    const status=row.shipping_status==='delivered'?'entregue':row.shipping_status==='shipped'?'enviado':row.status==='finalizado'?'pronto':row.status==='em_producao'?'em_producao':row.status==='aguardando'?'aguardando':null;
    if(status)orders.push({reference,id:row.id,number:String(row.order_number),status,updatedAt:row.updated_at});
   }
   send('brindeon-status-result',{orders});
  }catch(error){send('brindeon-status-error',{message:error.message||'Falha ao atualizar pedidos.'})}finally{busy=false}
 });
})();
