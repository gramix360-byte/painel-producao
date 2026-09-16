(()=>{
  const nativeFetch=window.fetch.bind(window);
  window.fetch=async function(input,init){
    try{
      const original=typeof input==='string'?input:input?.url||'';
      if(original.includes('/rest/v1/products?')){
        const u=new URL(original,location.href);
        if(u.searchParams.get('select')==='*' && !u.searchParams.has('limit'))u.searchParams.set('limit','100');
        input=u.toString();
      }else if(original.includes('/rest/v1/product_images?')){
        const u=new URL(original,location.href);
        if(!u.searchParams.has('limit'))u.searchParams.set('limit','500');
        input=u.toString();
      }
    }catch(e){console.warn('Products performance guard',e)}
    return nativeFetch(input,init);
  };
})();
