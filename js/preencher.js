/* ==========================================================================
   preencher.js — página standalone de autopreenchimento individual.
   Acessada via preencher.html?ano=ANO_ID&mes=MES (link único, gerado pelo
   botão "Copiar link de preenchimento do mês" na lista de Colaboradores —
   quem abre escolhe o próprio nome num seletor antes de ver o formulário)
   ou via preencher.html?colab=ID&ano=ANO_ID&mes=MES (link direto pra uma
   pessoa específica, gerado na tela de detalhe daquele colaborador).

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
  // "colab" agora é opcional: o botão da lista de Colaboradores gera um link
  // só com ano+mes (link único pra todo mundo), e quem abre escolhe o
  // próprio nome num <select> antes de ver o formulário. O link antigo,
  // gerado na tela de um colaborador específico, continua funcionando
  // igual — já vem com "colab" e pula direto pro formulário dessa pessoa.
  let colabId = params.get('colab');
  const anoId = params.get('ano');
  const mes = parseInt(params.get('mes'), 10);

  function erro(msg){
    root.innerHTML = `<div class="panel"><p>${escapeHtml(msg)}</p></div>`;
  }

  if(!anoId || !mes){
    erro('Este link está incompleto ou inválido. Peça ao responsável pra gerar o link de novo.');
    return;
  }

  await Store.load();

  if(!Store._storageOk){
    erro('Não foi possível carregar os dados agora. Verifique sua internet e recarregue a página.');
    return;
  }

  const anoObj = Store.getAno(anoId);
  if(!anoObj || !(mes>=1 && mes<=12)){
    erro('Não encontramos esse ano ou mês. Peça um novo link.');
    return;
  }

  const projetos = edicoesAtivasNoAno(anoObj.ano).filter(p => projetoAtivoNoMes(p, anoObj.ano, mes));

  if(projetos.length===0){
    erro(`Não há nenhum projeto ativo em ${MESES_LONGO[mes-1]}/${anoObj.ano} pra preencher.`);
    return;
  }

  // Se o link original não tinha "colab" (veio do botão da lista de
  // Colaboradores), mostra um link "Não é você?" pra voltar ao seletor.
  // (precisa ficar ANTES do return abaixo, senão nunca é inicializada
  // quando o link é o geral — e daí "iniciarFormulario" quebra ao usá-la)
  const linkEraGeral = !params.get('colab');

  // Sem colab= na URL: mostra a tela de "quem é você" antes do formulário.
  if(!colabId){
    renderSeletorColaborador();
    return;
  }

  const colab = Store.data.colaboradores.find(c=>c.id===colabId);
  if(!colab){
    erro('Não encontramos esse colaborador. Peça um novo link.');
    return;
  }

  iniciarFormulario(colab);

  function renderSeletorColaborador(){
    const ativos = [...Store.data.colaboradores]
      .filter(c=>c.ativo!==false)
      .sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
    root.innerHTML = `
      <div class="page-head">
        <span class="eyebrow">Preenchimento do mês</span>
        <h1>${MESES_LONGO[mes-1]} de ${anoObj.ano}</h1>
        <p class="muted">Selecione o seu nome pra informar em quais projetos você trabalhou neste mês.</p>
      </div>
      <div class="panel">
        <div class="field">
          <label>Você é...</label>
          <select id="seletorColab">
            <option value="">Selecione seu nome…</option>
            ${ativos.map(c=>`<option value="${c.id}">${escapeHtml(c.nome)}</option>`).join('')}
          </select>
        </div>
        <div style="margin-top:18px; display:flex; justify-content:flex-end;">
          <button class="primary-btn" id="btnContinuarSeletor">Continuar</button>
        </div>
      </div>
    `;
    el('btnContinuarSeletor').addEventListener('click', ()=>{
      const id = el('seletorColab').value;
      if(!id){ toast('Selecione seu nome na lista antes de continuar.'); return; }
      const colab = Store.data.colaboradores.find(c=>c.id===id);
      if(!colab){ toast('Colaborador não encontrado.'); return; }
      colabId = id;
      // Atualiza a URL (sem recarregar a página) pra que, se a pessoa
      // atualizar/voltar, o link continue apontando pro nome dela.
      const url = new URL(location.href);
      url.searchParams.set('colab', id);
      history.replaceState(null, '', url);
      iniciarFormulario(colab);
    });
  }

  function iniciarFormulario(colab){
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
          <div style="margin-top:18px; display:flex; justify-content:space-between; align-items:center;">
            ${linkEraGeral ? `<button type="button" class="ghost-btn" id="btnTrocarColab">Não é você? Trocar</button>` : `<span></span>`}
            <button class="primary-btn" id="btnConfirmar">Confirmar preenchimento</button>
          </div>
        </div>
      `;
      atualizarTotal();
      document.querySelectorAll('.pct').forEach(inp => inp.addEventListener('input', atualizarTotal));
      el('btnConfirmar').addEventListener('click', confirmar);
      if(linkEraGeral){
        el('btnTrocarColab').addEventListener('click', ()=>{
          colabId = null;
          const url = new URL(location.href);
          url.searchParams.delete('colab');
          history.replaceState(null, '', url);
          renderSeletorColaborador();
        });
      }
    }

        function confirmar(){
      const total = totalAtual();
      if(total > 100.01){
        toast('A soma passou de 100%. Ajuste os valores antes de confirmar.');
        return;
      }
      const inputs = Array.from(document.querySelectorAll('.pct'));
      inputs.forEach(inp=>{ Store.setAlocacao(anoObj.id, mes, colab.id, inp.dataset.projeto, 0); });
      for(const inp of inputs){
        const val = parseFloat((inp.value||'0').toString().replace(',','.')) || 0;
        const res = Store.setAlocacao(anoObj.id, mes, colab.id, inp.dataset.projeto, val);
        if(!res.ok){ toast(res.msg); return; }
      }
      Store.confirmarPreenchimento(colab.id, anoObj.id, mes);
      toast('Preenchimento confirmado! Obrigado.');
      renderConcluido();
    }

    // Tela final, depois de confirmar — substitui o formulário por um
    // aviso de "obrigado", em vez de deixar a tabela editável aberta na
    // tela. Quem precisar corrigir algo pode reabrir pelo link "Ajustar".
    function renderConcluido(){
      root.innerHTML = `
        <div class="panel" style="text-align:center; padding:40px 24px;">
          <p style="font-size:32px; margin-bottom:8px;">✓</p>
          <h1 style="margin-bottom:8px;">Obrigado, ${escapeHtml(colab.nome)}!</h1>
          <p class="muted" style="margin-bottom:20px;">Seu preenchimento de ${MESES_LONGO[mes-1]} de ${anoObj.ano} foi confirmado.</p>
          <div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
            <button type="button" class="ghost-btn" id="btnAjustarConcluido">Ajustar resposta</button>
            ${linkEraGeral ? `<button type="button" class="ghost-btn" id="btnTrocarConcluido">Preencher para outra pessoa</button>` : ''}
          </div>
        </div>
      `;
      el('btnAjustarConcluido').addEventListener('click', render);
      if(linkEraGeral){
        el('btnTrocarConcluido').addEventListener('click', ()=>{
          colabId = null;
          const url = new URL(location.href);
          url.searchParams.delete('colab');
          history.replaceState(null, '', url);
          renderSeletorColaborador();
        });
      }
    }

    render();
  }
})();