(()=>{
  const money=value=>Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:2,maximumFractionDigits:4});
  function mount(){
    const form=document.getElementById('product-form');
    const cost=document.getElementById('product-cost');
    if(!form||!cost||form.querySelector('.product-cost-calculator'))return;
    cost.step='0.0001';
    const box=document.createElement('section');
    box.className='product-cost-calculator';
    box.innerHTML=`
      <h3>Calculadora de custo</h3>
      <p>Informe a compra do material e quanto dele é usado em um produto.</p>
      <div class="product-cost-fields">
        <label>Valor do pacote (R$)<input id="cost-package-value" type="number" min="0" step="0.01" placeholder="10,00"></label>
        <label>Quantidade no pacote<input id="cost-package-quantity" type="number" min="0.0001" step="0.0001" placeholder="100"></label>
        <label>Quantidade utilizada<input id="cost-used-quantity" type="number" min="0" step="0.0001" value="1"></label>
        <label>Unidade de medida<select id="cost-unit"><option value="unidade">Unidade</option><option value="folha">Folha</option><option value="metro">Metro</option><option value="centímetro">Centímetro</option><option value="quilo">Quilo</option><option value="grama">Grama</option><option value="litro">Litro</option><option value="mililitro">Mililitro</option></select></label>
      </div>
      <div class="product-cost-result">
        <div><span>Custo por <b data-cost-unit>unidade</b></span><strong data-unit-cost>R$ 0,00</strong></div>
        <div class="used"><span>Custo utilizado no produto</span><strong data-used-cost>R$ 0,00</strong></div>
      </div>
      <button class="button primary product-cost-apply" type="button" disabled>Aplicar ao custo do produto</button>
      <div class="product-cost-error" role="status"></div>`;
    cost.closest('label')?.insertAdjacentElement('afterend',box);
    const packageValue=box.querySelector('#cost-package-value');
    const packageQuantity=box.querySelector('#cost-package-quantity');
    const usedQuantity=box.querySelector('#cost-used-quantity');
    const unit=box.querySelector('#cost-unit');
    const unitOutput=box.querySelector('[data-unit-cost]');
    const usedOutput=box.querySelector('[data-used-cost]');
    const unitLabel=box.querySelector('[data-cost-unit]');
    const error=box.querySelector('.product-cost-error');
    const apply=box.querySelector('.product-cost-apply');
    let usedCost=0;
    function calculate(){
      const total=Number(packageValue.value||0),quantity=Number(packageQuantity.value||0),used=Number(usedQuantity.value||0);
      unitLabel.textContent=unit.value;
      if(total<0||quantity<=0||used<0){
        usedCost=0;unitOutput.textContent='R$ 0,00';usedOutput.textContent='R$ 0,00';apply.disabled=true;
        error.textContent=quantity<=0&&packageQuantity.value?'A quantidade do pacote precisa ser maior que zero.':'';
        return;
      }
      const unitCost=total/quantity;
      usedCost=unitCost*used;
      unitOutput.textContent=money(unitCost);
      usedOutput.textContent=money(usedCost);
      apply.disabled=!(total>0&&quantity>0&&used>=0);
      error.textContent='';
    }
    [packageValue,packageQuantity,usedQuantity,unit].forEach(field=>field.addEventListener('input',calculate));
    apply.addEventListener('click',()=>{
      cost.value=usedCost.toFixed(4).replace(/0+$/,'').replace(/\.$/,'');
      cost.dispatchEvent(new Event('input',{bubbles:true}));
      apply.textContent='Custo aplicado ✓';
      setTimeout(()=>apply.textContent='Aplicar ao custo do produto',1600);
    });
    calculate();
  }
  document.addEventListener('click',event=>{if(event.target.closest('#products-nav'))setTimeout(mount,0)},true);
  window.addEventListener('load',()=>setTimeout(mount,800));
})();
