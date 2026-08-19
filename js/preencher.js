/* ==========================================================================
   preencher.js — página standalone de autopreenchimento individual.
   Acessada via preencher.html?colab=ID&ano=ANO_ID&mes=MES (todos gerados
   pelo botão "Copiar link" na tela do Colaborador, no app principal).

   Não carrega js/app.js (é uma página separada, enviada por link direto pra
   cada colaborador) — por isso duplica aqui a pequena parte da lógica do
   app.js que decide "quais projetos estavam ativos naquele ano/mês"
   (projetosAgrupados / projetoAtivoNoMes / edicoesAtivasNoAno), pra não
   precisar carregar o app inteiro só por causa disso.
   ========================================================================== */

function el(id){ return document.getElementById(id); }
function escapeHtml(s){ return (s??'').toString().replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function toast(msg){
  const t = el('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._h);
  toast._h = setTimeout(()=>t.classList.remove('show'), 2400);
}

// ---- Mesma regra de "projetos ativos naquele ano/mês" que existe em
// js/app.js — ver comentário lá pra entender o porquê da cadeia de renovação.
function projetosAgrupados(){
  const porId = new Map(Store.data.projetos.map(p=>[p.id, p]));
  const visitados = new Set();
  const grupos = [];
  Store.data.projetos.forEach(p=>{
    if(visitados.has(p.id)) return;
    let raiz = p;
    while(raiz.renovadoDeId && porId.has(raiz.renovadoDeId)){
      raiz = porId.get(raiz.renovadoDeId);
    }
    if(visitados.has(raiz.id)) return;
    const cadeia = [];
    let atual = raiz;
    while(atual){
      cadeia.push(atual);
      visitados.add(atual.id);
      atual = atual.renovadoParaId ? porId.get(atual.renovadoParaId) : null;
    }
    grupos.push(cadeia);
  });
  return grupos;
}

function projetoAtivoNoMes(p, anoNum, mes){
  const anoInicio = Store.getAno(p.anoId)?.ano;
  if(anoInicio===undefined) return false;
  if(anoNum < anoInicio) return false;
  if(anoNum === anoInicio && mes < (p.mesInicio||1)) return false;
  if(!p.emAndamento){
    if(anoNum > anoInicio) return false;
    if(anoNum === anoInicio && mes > (p.mesFim||12)) return false;
  }
  return true;
}

function edicoesAtivasNoAno(anoNum){
  const grupos = projetosAgrupados();
  const resultado = [];
  grupos.forEach(cadeia=>{
    let candidata = null, anoCandidata = -Infinity;
    cadeia.forEach(p=>{
      const anoP = Store.getAno(p.anoId)?.ano;
      if(anoP===undefined || anoP > anoNum) return;
      if(anoP > anoCandidata){ candidata = p; anoCandidata = anoP; }
    });
    if(!candidata) return;
    if(anoCandidata === anoNum || candidata.emAndamento){
      resultado.push(candidata);
    }
  });
  return resultado;
}

(async function main(){
  const root = el('conteudo');
  const params = new URLSearchParams(location.search);
  const colabId = params.get('colab');
  const anoId = params.get('ano');
  const mes = parseInt(params.get('mes'), 10);

  function erro(msg){
    root.innerHTML = `<div class="panel"><p>${escapeHtml(msg)}</p></div>`;
  }

  if(!colabId || !anoId || !mes){
    erro('Este link está incompleto ou inválido. Peça ao responsável pra gerar o link de novo, na tela do colaborador.');
    return;
  }

  await Store.load();

  if(!Store._storageOk){
    erro('Não foi possível carregar os dados agora. Verifique sua internet e recarregue a página.');
    return;
  }

  const colab = Store.data.colaboradores.find(c=>c.id===colabId);
  const anoObj = Store.getAno(anoId);
  if(!colab || !anoObj || !(mes>=1 && mes<=12)){
    erro('Não encontramos esse colaborador, ano ou mês. Peça um novo link.');
    return;
  }

  const projetos = edicoesAtivasNoAno(anoObj.ano).filter(p => projetoAtivoNoMes(p, anoObj.ano, mes));

  if(projetos.length===0){
    erro(`Não há nenhum projeto ativo em ${MESES_LONGO[mes-1]}/${anoObj.ano} pra preencher.`);
    return;
  }

  function totalAtual(){
    return Array.from(document.querySelectorAll('.pct'))
      .reduce((s,inp)=> s + (parseFloat((inp.value||'0').toString().replace(',','.')) || 0), 0);
  }

  function atualizarTotal(){
    const total = Math.round(totalAtual()*100)/100;
    const totalEl = el('totalPreencher');
    totalEl.textContent = total + '%';
    totalEl.className = 'num ' + (Math.abs(total-100)<0.01 ? 'gain-text' : (total>100 ? 'loss-text' : ''));
  }

  function render(){
    const conf = Store.getConfirmacao(colab.id, anoObj.id, mes);
    root.innerHTML = `
      <div class="page-head">
        <span class="eyebrow">Preenchimento individual</span>
        <h1>${escapeHtml(colab.nome)}</h1>
        <p class="muted">${MESES_LONGO[mes-1]} de ${anoObj.ano}</p>
      </div>
      <div class="panel">
        ${conf ? `<p class="muted small" style="margin-bottom:14px;"><span class="badge impacto">✓ já confirmado</span> em ${new Date(conf.confirmadoEm).toLocaleString('pt-BR')} — pode ajustar e confirmar de novo se algo mudar.</p>` : ''}
        <p class="muted" style="margin-bottom:16px;">Informe quantos % do seu tempo você dedicou a cada projeto abaixo durante ${MESES_LONGO[mes-1]}. A soma não pode passar de 100%.</p>
        <table class="data-table">
          <thead><tr><th>Projeto</th><th class="num">% no mês</th></tr></thead>
          <tbody>
            ${projetos.map(p=>{
              const a = Store.getAlocacao(anoObj.id, mes, colab.id, p.id);
              const valor = a ? a.percentual : '';
              return `<tr>
                <td><span class="color-dot" style="background:${p.cor}"></span>${escapeHtml(p.nome)}</td>
                <td class="num"><input type="number" class="pct" data-projeto="${p.id}" min="0" max="100" step="0.01" value="${valor}" placeholder="0" style="width:90px; text-align:right;"></td>
              </tr>`;
            }).join('')}
          </tbody>
          <tfoot>
            <tr><td>Total</td><td class="num" id="totalPreencher">0%</td></tr>
          </tfoot>
        </table>
        <div style="margin-top:18px; display:flex; justify-content:flex-end;">
          <button class="primary-btn" id="btnConfirmar">Confirmar preenchimento</button>
        </div>
      </div>
    `;
    atualizarTotal();
    document.querySelectorAll('.pct').forEach(inp => inp.addEventListener('input', atualizarTotal));
    el('btnConfirmar').addEventListener('click', confirmar);
  }

  function confirmar(){
    const total = totalAtual();
    if(total > 100.01){
      toast('A soma passou de 100%. Ajuste os valores antes de confirmar.');
      return;
    }
    const inputs = Array.from(document.querySelectorAll('.pct'));
    // Zera tudo primeiro, pra poder aplicar os valores novos em qualquer
    // ordem sem esbarrar na trava de 100% no meio do caminho (ex.: trocar
    // 20%/80% por 80%/20% falharia se processasse um de cada vez sem zerar
    // os dois antes — mesma solução usada no "Dividir % igualmente").
    inputs.forEach(inp=>{ Store.setAlocacao(anoObj.id, mes, colab.id, inp.dataset.projeto, 0); });
    for(const inp of inputs){
      const val = parseFloat((inp.value||'0').toString().replace(',','.')) || 0;
      const res = Store.setAlocacao(anoObj.id, mes, colab.id, inp.dataset.projeto, val);
      if(!res.ok){ toast(res.msg); return; }
    }
    Store.confirmarPreenchimento(colab.id, anoObj.id, mes);
    toast('Preenchimento confirmado! Obrigado.');
    render();
  }

  render();
})();