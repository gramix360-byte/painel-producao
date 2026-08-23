(()=>{
  const previousFetch=window.fetch.bind(window);
  let notifying=false;

  async function notifyOrder(orderId){
    if(!orderId||notifying||!window.PPAuth)return;
    notifying=true;
    try{
      const session=await window.PPAuth.getSession();
      if(!session?.access_token)return;
      const response=await previousFetch('https://evyilktotmjivscrufug.supabase.co/functions/v1/notify-new-order',{
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'Authorization':`Bearer ${session.access_token}`
        },
        body:JSON.stringify({order_id:orderId})
      });
      if(!response.ok){
        const text=await response.text();
        console.warn('Não foi possível enviar o aviso do pedido:',text);
      }
    }catch(error){
      console.warn('Aviso de novo pedido indisponível:',error);
    }finally{
      notifying=false;
    }
  }

  window.fetch=async function(input,init={}){
    const response=await previousFetch(input,init);
    try{
      const url=typeof input==='string'?input:input.url;
      const method=(init.method||(typeof input!=='string'?input.method:'GET')||'GET').toUpperCase();
      if(response.ok&&method==='POST'&&url.includes('/rest/v1/order_items')){
        const raw=init.body;
        if(typeof raw==='string'){
          const payload=JSON.parse(raw);
          const items=Array.isArray(payload)?payload:[payload];
          const orderId=items.find(item=>item?.order_id)?.order_id;
          if(orderId)setTimeout(()=>notifyOrder(orderId),300);
        }
      }
    }catch(error){console.warn('Falha ao preparar aviso por e-mail:',error)}
    return response;
  };
})();