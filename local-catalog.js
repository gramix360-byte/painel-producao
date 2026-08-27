(()=>{
  const CUSTOMER_LIST='panel-customers';
  const PRODUCT_LIST='panel-products';
  let customers=[];
  let products=[];
  const esc=(v='')=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  async function loadCatalog(){
    try{
      const [cr,pr]=await Promise.all([
        fetch(`${window.PPAuth.url}/rest/v1/customers?select=id,name,phone,email&active=eq.true&order=name.asc`,{headers:{apikey:window.PPAuth.key}}),
        fetch(`${window.PPAuth.url}/rest/v1/products?select=id,sku,name,sale_price,stock,category&active=eq.true&order=name.asc`,{headers:{apikey:window.PPAuth.key}})
      ]);
      if(!cr.ok||!pr.ok)throw new Error('Falha ao carregar catálogo do painel');
      customers=await cr.json();products=await pr.json();renderLists();decorateForm();
    }catch(e){console.warn('Catálogo do painel',e)}
  }

  function renderLists(){
    let c=document.getElementById(CUSTOMER_LIST);if(!c){c=document.createElement('datalist');c.id=CUSTOMER_LIST;document.body.appendChild(c)}
    c.innerHTML=customers.map(x=>`<option value="${esc(x.name)}">${esc([x.phone,x.email].filter(Boolean).join(' · '))}</option>`).join('');
    let p=document.getElementById(PRODUCT_LIST);if(!p){p=document.createElement('datalist');p.id=PRODUCT_LIST;document.body.appendChild(p)}
    p.innerHTML=products.map(x=>`<option value="${esc(x.name)}">${esc([x.sku?`SKU ${x.sku}`:'',x.category||'',`Estoque ${Number(x.stock||0)}`].filter(Boolean).join(' · '))}</option>`).join('');
  }

  function addHint(input,text){const label=input.closest('label');if(!label||label.querySelector('.panel-catalog-hint'))return;const hint=document.createElement('small');hint.className='panel-catalog-hint';hint.textContent=text;label.appendChild(hint)}
  function decorateForm(){
    const customer=document.getElementById('customer-name');if(customer){customer.setAttribute('list',CUSTOMER_LIST);customer.setAttribute('autocomplete','off');customer.placeholder='Digite ou selecione um cliente';addHint(customer,'Clientes cadastrados neste painel')}
    document.querySelectorAll('.item-product').forEach(input=>{input.setAttribute('list',PRODUCT_LIST);input.setAttribute('autocomplete','off');input.placeholder='Digite ou selecione um produto';addHint(input,'Produtos cadastrados neste painel')});
  }
  const observer=new MutationObserver(()=>decorateForm());
  document.addEventListener('DOMContentLoaded',()=>{const items=document.getElementById('items-list');if(items)observer.observe(items,{childList:true,subtree:true});setTimeout(loadCatalog,300);document.addEventListener('click',e=>{if(e.target.closest('.nav-item[data-view="novo"]'))setTimeout(()=>{decorateForm();loadCatalog()},150)})});
  window.PPStandaloneCatalog={refresh:loadCatalog};
})();