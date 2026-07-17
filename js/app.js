/* ==========================================================================
   app.js
   Camada de interface: renderização das páginas e ligação dos eventos.
   Toda leitura/escrita de dados passa pelo objeto Store (store.js).

   Fluxo de navegação:
     Dashboard | Anos | Projetos | Colaboradores
     Projetos -> abrir um projeto -> Projeto Detalhe (membros + ganhos + gastos)
   ========================================================================== */

const ctx = {
  anoId: null,
  mes: (new Date().getMonth() + 1), // número 1-12, ou a string 'ano' para o ano inteiro
  projetoId: '' // filtro do Dashboard: '' = todos, 'GERAL' = sem projeto, ou o id de um projeto
};

let projetoDetalheId = null; // projeto aberto na página de detalhe
let colaboradorDetalheId = null; // colaborador aberto na página de detalhe
let projetosGruposAbertos = new Set(); // ids (do projeto mais antigo da cadeia) que estão expandidos na lista de Projetos
let chartEvolucao = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatCurrency(v){
  return 'R$ ' + (v || 0).toLocaleString('pt-BR', { minimumFractionDigits:2, maximumFractionDigits:2 });
}
function el(id){ return document.getElementById(id); }
function escapeHtml(s){ return (s??'').toString().replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function toast(msg){
  const t = el('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._h);
  toast._h = setTimeout(()=>t.classList.remove('show'), 2400);
}

function projetoFiltroAtual(){
  if(ctx.projetoId === '') return 'ALL';
  if(ctx.projetoId === 'GERAL') return 'GERAL';
  return ctx.projetoId;
}

function nomeProjeto(projetoId){
  if(!projetoId) return 'Geral (empresa)';
  const p = Store.data.projetos.find(x=>x.id===projetoId);
  return p ? p.nome : '(projeto removido)';
}

function periodoLabel(l){
  if(l.tipo==='pontual') return MESES_LONGO[l.mesInicio-1];
  if(l.mesInicio===1 && l.mesFim===12) return 'Todo o ano';
  return `${MESES[l.mesInicio-1]} → ${MESES[l.mesFim-1]}`;
}

// soma uma métrica respeitando o seletor "mês" (número) ou "ano todo"
function metrica(fn, projetoFiltro){
  if(!ctx.anoId) return 0;
  if(ctx.mes === 'ano') return Store.agregarAno(ctx.anoId, projetoFiltro, fn);
  return fn.call(Store, ctx.anoId, ctx.mes, projetoFiltro);
}

function periodoTexto(){
  return ctx.mes==='ano' ? 'no ano completo' : `em ${MESES_LONGO[ctx.mes-1]}`;
}

// ---------------------------------------------------------------------------
// Context bar (Ano / Mês / Projeto)
// ---------------------------------------------------------------------------
function mesTabsHtml(selected){
  return MESES.map((m,i)=>
    `<button data-mes="${i+1}" class="${selected===i+1?'active':''}">${m}</button>`
  ).join('') + `<button data-mes="ano" class="${selected==='ano'?'active':''}">Ano todo</button>`;
}

function renderContextBar(){
  const selAno = el('ctxAno');
  selAno.innerHTML = Store.data.anos.map(a=>
    `<option value="${a.id}">${a.ano}</option>`).join('') || '<option value="">Nenhum ano criado</option>';
  if(ctx.anoId) selAno.value = ctx.anoId;

  el('ctxMeses').innerHTML = mesTabsHtml(ctx.mes);

  const selProj = el('ctxProjeto');
  const projetosDoAno = ctx.anoId ? Store.projetosDoAno(ctx.anoId) : [];
  selProj.innerHTML = '<option value="">Todos os projetos</option>' +
    projetosDoAno.map(p=>`<option value="${p.id}">${escapeHtml(p.nome)}</option>`).join('') +
    '<option value="GERAL">Geral (sem projeto)</option>';
  selProj.value = ctx.projetoId;
}

function setPage(page){
  document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active', p.id===`page-${page}`));
  const navKey = page==='projeto-detalhe' ? 'projetos' : (page==='colaborador-detalhe' ? 'colaboradores' : page);
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active', b.dataset.page===navKey));
  // a barra de Ano/Mês/Projeto só faz sentido no Dashboard; nas outras páginas,
  // o mês (quando precisa) é escolhido localmente (ex.: dentro do projeto)
  document.querySelector('.context-bar').style.display = (page==='dashboard') ? '' : 'none';
  renderPage(page);
}

function renderPage(page){
  renderContextBar();
  switch(page){
    case 'dashboard': return renderDashboard();
    case 'anos': return renderAnos();
    case 'colaboradores': return renderColaboradores();
    case 'cargos': return renderCargos();
    case 'projetos': return renderProjetos();
    case 'projeto-detalhe': return renderProjetoDetalhe();
    case 'colaborador-detalhe': return renderColaboradorDetalhe();
  }
}

function currentPage(){
  return document.querySelector('.page.active')?.id.replace('page-','') || 'dashboard';
}

function rerenderCurrent(){ renderPage(currentPage()); }

// ---------------------------------------------------------------------------
// DASHBOARD
// ---------------------------------------------------------------------------
function renderDashboard(){
  const semAno = !ctx.anoId;
  const filtro = projetoFiltroAtual();

  const gasto = semAno ? 0 : metrica(Store.gastoTotal, filtro);
  const ganho = semAno ? 0 : metrica(Store.ganho, filtro);
  const saldo = ganho - gasto;

  el('kpiGasto').textContent = formatCurrency(gasto);
  el('kpiGanho').textContent = formatCurrency(ganho);
  el('kpiSaldo').textContent = formatCurrency(saldo);
  const stampSaldo = el('stampSaldo');
  stampSaldo.classList.toggle('positivo', saldo>=0);
  stampSaldo.classList.toggle('negativo', saldo<0);

  const anoObj = Store.getAno(ctx.anoId);
  const projTxt = filtro==='ALL' ? 'todos os projetos' : filtro==='GERAL' ? 'lançamentos gerais' : nomeProjeto(ctx.projetoId);
  el('dashSubtitle').textContent = semAno
    ? 'Crie um ano na aba "Anos" para começar.'
    : `${anoObj.ano} · ${periodoTexto()} · ${projTxt}`;

  // Tabela por projeto
  const tbody = document.querySelector('#tblProjetoResumo tbody');
  if(semAno){
    tbody.innerHTML = `<tr><td colspan="4" class="empty-hint">Nenhum ano selecionado.</td></tr>`;
  }else{
    const projetosDoAno = Store.projetosDoAno(ctx.anoId);
    const linhas = projetosDoAno.map(p=>({
      nome: p.nome, cor: p.cor,
      gasto: metrica(Store.gastoTotal, p.id),
      ganho: metrica(Store.ganho, p.id)
    }));
    const geralGanho = metrica(Store.ganho, 'GERAL');
    const geralGasto = metrica(Store.gastoTotal, 'GERAL');
    if(geralGanho || geralGasto) linhas.push({ nome:'Geral (sem projeto)', cor:'#98A2B3', gasto:geralGasto, ganho:geralGanho });

    if(linhas.length===0){
      tbody.innerHTML = `<tr><td colspan="4" class="empty-hint">Cadastre um projeto na aba "Projetos".</td></tr>`;
    }else{
      tbody.innerHTML = linhas.map(l=>{
        const s = l.ganho - l.gasto;
        return `<tr>
          <td><span class="color-dot" style="background:${l.cor}"></span>${escapeHtml(l.nome)}</td>
          <td class="num loss-text">${formatCurrency(l.gasto)}</td>
          <td class="num gain-text">${formatCurrency(l.ganho)}</td>
          <td class="num" style="color:${s>=0?'var(--gain)':'var(--loss)'}">${formatCurrency(s)}</td>
        </tr>`;
      }).join('');
    }
  }

  // Colaboradores no período
  const tbodyColab = document.querySelector('#tblColabResumo tbody');
  const emptyHint = el('dashColabEmpty');
  if(semAno){
    tbodyColab.innerHTML = '';
    emptyHint.hidden = false;
    emptyHint.textContent = 'Nenhum ano selecionado.';
  }else{
    const linhas = colaboradoresPeriodo(ctx.anoId, ctx.mes, filtro);
    if(linhas.length===0){
      tbodyColab.innerHTML = '';
      emptyHint.hidden = false;
      emptyHint.textContent = 'Ninguém alocado neste período ainda. Abra um projeto e cadastre os membros envolvidos.';
    }else{
      emptyHint.hidden = true;
      tbodyColab.innerHTML = renderColaboradoresAgrupados(linhas);
    }
  }
  el('kpiColab').textContent = semAno ? '0' : new Set(colaboradoresPeriodo(ctx.anoId, ctx.mes, filtro).map(l=>l.colaborador.id)).size;

  renderChartEvolucao();
}

// Junta alocações de um único mês, ou agrega o ano inteiro (média de % / soma de custo)
function colaboradoresPeriodo(anoId, mes, projetoFiltro){
  if(mes !== 'ano'){
    const { linhas } = Store.colaboradoresNoMes(anoId, mes, projetoFiltro);
    return linhas.map(l=>({
      colaborador: l.colaborador,
      projetoNome: l.projeto ? l.projeto.nome : '—',
      percentual: l.percentual,
      percentualLabel: l.percentual.toFixed(1).replace('.0','') + '%',
      custo: l.custo
    }));
  }
  const acc = {};
  for(let m=1;m<=12;m++){
    const { linhas } = Store.colaboradoresNoMes(anoId, m, projetoFiltro);
    linhas.forEach(l=>{
      const key = l.colaborador.id + '::' + (l.projeto?l.projeto.id:'geral');
      if(!acc[key]) acc[key] = { colaborador:l.colaborador, projeto:l.projeto, custo:0, pctSoma:0, meses:0 };
      acc[key].custo += l.custo;
      acc[key].pctSoma += l.percentual;
      acc[key].meses += 1;
    });
  }
  return Object.values(acc).map(a=>({
    colaborador: a.colaborador,
    projetoNome: a.projeto ? a.projeto.nome : '—',
    percentual: a.pctSoma / a.meses,
    percentualLabel: (a.pctSoma / a.meses).toFixed(1).replace('.0','') + '% méd.',
    custo: a.custo
  }));
}

// Agrupa as linhas (uma por colaborador+projeto) por colaborador, pra mostrar
// o nome só uma vez (célula "mesclada" com rowspan) em vez de repetir a cada
// projeto — e soma um subtotal quando a pessoa está em mais de um projeto.
function renderColaboradoresAgrupados(linhas){
  const grupos = [];
  const indice = new Map();
  linhas.forEach(l=>{
    if(!indice.has(l.colaborador.id)){
      indice.set(l.colaborador.id, grupos.length);
      grupos.push({ colaborador: l.colaborador, itens: [] });
    }
    grupos[indice.get(l.colaborador.id)].itens.push(l);
  });

  return grupos.map(g=>{
    const n = g.itens.length;
    const linhasHtml = g.itens.map((l,i)=>{
      const nomeCell = i===0
        ? `<td rowspan="${n}"><button class="link-btn" data-action="abrir-colaborador" data-id="${g.colaborador.id}">${escapeHtml(g.colaborador.nome)}</button></td>`
        : '';
      const cargoCell = i===0 ? `<td class="muted" rowspan="${n}">${escapeHtml(g.colaborador.cargo)}</td>` : '';
      return `<tr class="${i===0 ? 'grupo-colab-inicio' : ''}">
        ${nomeCell}${cargoCell}
        <td>${escapeHtml(l.projetoNome)}</td>
        <td class="num">${l.percentualLabel}</td>
        <td class="num">${formatCurrency(l.custo)}</td>
      </tr>`;
    }).join('');
    if(n <= 1) return linhasHtml;
    const totalPct = g.itens.reduce((s,l)=>s+l.percentual, 0);
    const totalCusto = g.itens.reduce((s,l)=>s+l.custo, 0);
    return linhasHtml + `<tr class="subtotal-colab">
      <td colspan="2" class="muted small">Total de ${g.colaborador.nome.split(' ')[0]} (${n} projetos)</td>
      <td></td>
      <td class="num">${totalPct.toFixed(0)}%</td>
      <td class="num">${formatCurrency(totalCusto)}</td>
    </tr>`;
  }).join('');
}

function renderChartEvolucao(){
  const canvas = el('chartEvolucao');
  if(typeof Chart === 'undefined'){
    canvas.parentElement.innerHTML = '<p class="empty-hint">Não foi possível carregar a biblioteca do gráfico. Os números seguem corretos nas tabelas acima.</p>';
    return;
  }
  if(!ctx.anoId){
    if(chartEvolucao){ chartEvolucao.destroy(); chartEvolucao=null; }
    return;
  }
  const filtro = projetoFiltroAtual();
  const anoObj = Store.getAno(ctx.anoId);
  const anoReal = new Date().getFullYear();
  const mesRealAtual = new Date().getMonth() + 1;
  // Só mostra meses que já aconteceram: no ano atual, para até o mês de
  // hoje (não faz sentido "evoluir" um mês que ainda não chegou); anos
  // passados mostram os 12 meses normalmente.
  const ultimoMes = anoObj.ano < anoReal ? 12 : (anoObj.ano === anoReal ? mesRealAtual : 0);
  const gastos = [], ganhos = [];
  for(let m=1;m<=ultimoMes;m++){
    gastos.push(Store.gastoTotal(ctx.anoId, m, filtro));
    ganhos.push(Store.ganho(ctx.anoId, m, filtro));
  }
  if(chartEvolucao) chartEvolucao.destroy();
  chartEvolucao = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: MESES.slice(0, ultimoMes),
      datasets: [
        { label:'Gasto', data:gastos, backgroundColor:'#C2483C', borderRadius:4, maxBarThickness:26 },
        { label:'Ganho', data:ganhos, backgroundColor:'#0E7C6B', borderRadius:4, maxBarThickness:26 }
      ]
    },
    options: {
      responsive:true,
      maintainAspectRatio:false,
      plugins:{ legend:{ position:'bottom', labels:{ boxWidth:10, font:{ family:'Work Sans', size:11 } } } },
      scales:{
        y:{ ticks:{ callback:v=>'R$ '+v.toLocaleString('pt-BR'), font:{ family:'IBM Plex Mono', size:10 } }, grid:{ color:'#EDF0F5' } },
        x:{ ticks:{ font:{ family:'IBM Plex Mono', size:11 } }, grid:{ display:false } }
      }
    }
  });
}

// ---------------------------------------------------------------------------
// ANOS (+ ganhos gerais da empresa, sem projeto)
// ---------------------------------------------------------------------------
function renderAnos(){
  document.querySelector('#tblAnos tbody').innerHTML = Store.data.anos.map(a=>{
    const numProjetos = Store.projetosDoAno(a.id).length;
    const numGeral = Store.data.ganhos.filter(g=>g.anoId===a.id && !g.projetoId).length;
    const ativo = a.id === ctx.anoId;
    return `<tr>
      <td class="mono">${a.ano} ${ativo?'<span class="badge mensal">selecionado</span>':''}</td>
      <td>${numProjetos} projeto(s)</td>
      <td>${numGeral} lançamento(s)</td>
      <td class="row-actions">
        ${ativo ? '' : `<button class="icon-btn" data-action="selecionar-ano" data-id="${a.id}">Selecionar</button>`}
        <button class="icon-btn danger" data-action="remover-ano" data-id="${a.id}">Excluir</button>
      </td>
    </tr>`;
  }).join('') || `<tr><td colspan="4" class="empty-hint">Nenhum ano criado ainda.</td></tr>`;

  const semAno = !ctx.anoId;
  el('formGanhoGeral').querySelectorAll('input,select,button').forEach(elm=>elm.disabled = semAno);
  el('ganhosGeraisAnoLabel').textContent = semAno ? '' : `(ano ${Store.getAno(ctx.anoId).ano})`;

  preencherSelectMeses(el('geralMesInicio'));
  preencherSelectMeses(el('geralMesFim'));

  const tbody = document.querySelector('#tblGanhosGerais tbody');
  if(semAno){
    tbody.innerHTML = `<tr><td colspan="5" class="empty-hint">Selecione um ano para ver os ganhos gerais dele.</td></tr>`;
    return;
  }
  const lista = Store.data.ganhos.filter(g=>g.anoId===ctx.anoId && !g.projetoId).sort((a,b)=>a.mesInicio-b.mesInicio);
  tbody.innerHTML = lista.map(g=>`
    <tr>
      <td>${escapeHtml(g.descricao)||'<span class="muted">—</span>'}</td>
      <td><span class="badge ${g.tipo}">${g.tipo==='pontual'?'Pontual':'Mensal'}</span></td>
      <td class="mono">${periodoLabel(g)}</td>
      <td class="num gain-text">${formatCurrency(g.valor)}</td>
      <td class="row-actions">
        <button class="icon-btn" data-action="editar-geral" data-id="${g.id}">Editar</button>
        <button class="icon-btn danger" data-action="remover-geral" data-id="${g.id}">Remover</button>
      </td>
    </tr>`).join('') || `<tr><td colspan="5" class="empty-hint">Nenhum ganho geral lançado neste ano ainda.</td></tr>`;
}

// ---------------------------------------------------------------------------
// COLABORADORES (registro global de pessoas + salário)
// ---------------------------------------------------------------------------
// Preenche o <select> de Cargo (usado no form de Colaboradores) com os cargos
// cadastrados. Se o colaborador já tem um cargo que não existe mais na lista
// (foi removido/renomeado depois), preserva o valor antigo como opção extra,
// pra não perder/esconder o dado dele.
function preencherSelectCargos(select, valorAtual){
  const cargos = [...Store.data.cargos].sort((a,b)=>a.nome.localeCompare(b.nome, 'pt-BR'));
  if(cargos.length === 0){
    select.innerHTML = `<option value="">Nenhum cargo cadastrado — crie um na aba "Cargos"</option>`;
    return;
  }
  let opcoes = `<option value="">Selecione um cargo…</option>` + cargos.map(c=>
  `<option value="${escapeHtml(c.nome)}" data-salario="${c.salario}">${escapeHtml(c.nome)}</option>`
  ).join('');
  if(valorAtual && !cargos.some(c=>c.nome===valorAtual)){
    opcoes += `<option value="${escapeHtml(valorAtual)}" selected>${escapeHtml(valorAtual)} (cargo removido)</option>`;
  }
  select.innerHTML = opcoes;
  if(valorAtual && cargos.some(c=>c.nome===valorAtual)) select.value = valorAtual;
}

function renderColaboradores(){
  preencherSelectCargos(el('colabCargo'), el('colabId').value ? el('colabCargo').value : '');
  document.querySelector('#tblColaboradores tbody').innerHTML = Store.data.colaboradores.map(c=>{
    const anoEntrada = c.entradaAnoId ? Store.getAno(c.entradaAnoId) : null;
    const entradaTxt = anoEntrada ? formatarValorInicio(anoEntrada, c.entradaMes) : '<span class="muted">—</span>';
    const situacaoTxt = c.ativo === false
      ? (c.saidaAnoId ? `Saiu em ${formatarValorInicio(Store.getAno(c.saidaAnoId), c.saidaMes)}` : 'Inativo')
      : '<span class="badge mensal">Em atividade</span>';
    return `
    <tr>
      <td><button class="link-btn" data-action="abrir-colaborador" data-id="${c.id}">${escapeHtml(c.nome)}</button></td>
      <td class="muted">${escapeHtml(c.cargo)}</td>
      <td class="mono small">${entradaTxt}</td>
      <td class="mono small">${situacaoTxt}</td>
      <td class="num">${formatCurrency(c.custoMensal)}</td>
      <td class="row-actions">
        <button class="icon-btn" data-action="editar-colab" data-id="${c.id}">Editar</button>
        <button class="icon-btn danger" data-action="remover-colab" data-id="${c.id}">Remover</button>
      </td>
    </tr>`;
  }).join('') || `<tr><td colspan="6" class="empty-hint">Nenhum colaborador cadastrado ainda.</td></tr>`;
}

// ---------------------------------------------------------------------------
// CARGOS (catálogo de cargos com salário-base)
// ---------------------------------------------------------------------------
function renderCargos(){
  const tbody = document.querySelector('#tblCargos tbody');
  const emptyHint = el('cargosEmpty');
  const cargos = [...Store.data.cargos].sort((a,b)=>a.nome.localeCompare(b.nome, 'pt-BR'));
  if(cargos.length === 0){
    tbody.innerHTML = '';
    emptyHint.hidden = false;
    return;
  }
  emptyHint.hidden = true;
  tbody.innerHTML = cargos.map(c=>{
    const qtd = Store.colaboradoresPorCargo(c.nome);
    return `<tr>
      <td>${escapeHtml(c.nome)}</td>
      <td class="num">${formatCurrency(c.salario)}</td>
      <td class="num muted">${qtd}</td>
      <td class="row-actions">
        <button class="icon-btn" data-action="editar-cargo" data-id="${c.id}">Editar</button>
        <button class="icon-btn danger" data-action="remover-cargo" data-id="${c.id}">Remover</button>
      </td>
    </tr>`;
  }).join('');
}

// ---------------------------------------------------------------------------
// PROJETOS (lista, dentro do ano ativo)
// ---------------------------------------------------------------------------
function periodoProjetoLabel(p){
  const inicio = MESES[(p.mesInicio||1)-1];
  if(p.emAndamento || !p.mesFim) return `${inicio} → em andamento`;
  return `${inicio} → ${MESES[p.mesFim-1]}`;
}

function tipoProjetoBadge(p){
  const tipo = p.tipo || 'impacto';
  return tipo==='cultura'
    ? `<span class="badge cultura">Cultura</span>`
    : `<span class="badge impacto">Impacto</span>`;
}

// Calcula uma métrica (gasto/ganho) usando o ANO DO PRÓPRIO PROJETO,
// e não o ano que está selecionado no momento na barra de contexto.
// Isso é o que permite listar projetos de anos diferentes juntos, cada um
// com os números certos.
function metricaProjeto(fn, projeto){
  if(ctx.mes === 'ano') return Store.agregarAno(projeto.anoId, projeto.id, fn);
  return fn.call(Store, projeto.anoId, ctx.mes, projeto.id);
}

// Agrupa Store.data.projetos em "cadeias": cada cadeia é um array com todas as
// edições anuais de um mesmo projeto, na ordem em que foram renovadas
// (ex.: [Clube da Leitura/2022, Clube da Leitura/2023, ... /2026]).
// Usa o vínculo renovadoDeId/renovadoParaId que já existe (criado pelo botão
// "Renovar projeto"), em vez de agrupar só pelo nome.
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

function renderProjetos(){
  el('projetosSubtitle').textContent = 'Todos os projetos cadastrados, de todos os anos.';
  if(!el('projId').value){
    el('projInicio').value = '';
  }
  preencherSelectMeses(el('projMesFim'));

  const tbody = document.querySelector('#tblProjetos tbody');
  const emptyHint = el('projetosEmpty');

  const grupos = projetosAgrupados().sort((a,b)=>{
    const anoA = Store.getAno(a[0].anoId)?.ano || 0;
    const anoB = Store.getAno(b[0].anoId)?.ano || 0;
    if(anoA !== anoB) return anoA - anoB;
    return (a[0].mesInicio||1) - (b[0].mesInicio||1);
  });

  if(grupos.length===0){
    tbody.innerHTML = '';
    emptyHint.hidden = false;
    emptyHint.textContent = 'Nenhum projeto cadastrado ainda. Use o formulário acima para criar o primeiro.';
    return;
  }
  emptyHint.hidden = true;

  tbody.innerHTML = grupos.map(cadeia=>{
    // projeto "avulso" (nunca foi renovado) — mostra como sempre, sem agrupamento
    if(cadeia.length === 1) return linhaProjeto(cadeia[0], false);

    const primeiro = cadeia[0];
    const grupoId = primeiro.id; // chave estável: id do projeto mais antigo da cadeia
    const aberto = projetosGruposAbertos.has(grupoId);
    const anos = cadeia.map(p => Store.getAno(p.anoId)?.ano).filter(Boolean);

    let gastoTotal = 0, ganhoTotal = 0;
    cadeia.forEach(p=>{
      gastoTotal += Store.agregarAno(p.anoId, p.id, Store.gastoTotal);
      ganhoTotal += Store.agregarAno(p.anoId, p.id, Store.ganho);
    });
    const saldoTotal = ganhoTotal - gastoTotal;

    const linhaGrupo = `<tr class="grupo-row" data-action="toggle-grupo-projeto" data-grupo="${grupoId}">
      <td><span class="color-dot" style="background:${primeiro.cor}"></span></td>
      <td><span class="chevron ${aberto?'open':''}">▸</span><strong>${escapeHtml(primeiro.nome)}</strong></td>
      <td class="mono small">${anos[0]}–${anos[anos.length-1]}</td>
      <td>${tipoProjetoBadge(primeiro)}</td>
      <td class="mono small muted">${cadeia.length} anos cadastrados — clique pra ${aberto?'fechar':'ver'}</td>
      <td class="num muted">—</td>
      <td class="num loss-text">${formatCurrency(gastoTotal)}</td>
      <td class="num gain-text">${formatCurrency(ganhoTotal)}</td>
      <td class="num" style="color:${saldoTotal>=0?'var(--gain)':'var(--loss)'}">${formatCurrency(saldoTotal)}</td>
      <td></td>
    </tr>`;

    const linhasAnos = aberto ? cadeia.map(p => linhaProjeto(p, true)).join('') : '';
    return linhaGrupo + linhasAnos;
  }).join('');
}

// Uma linha "normal" da tabela, representando UM projeto (uma edição/ano).
// indentado=true quando está dentro de um grupo expandido (visual recuado).
function linhaProjeto(p, indentado){
  const anoObj = Store.getAno(p.anoId);
  const membros = mes => Store.colaboradoresNoMes(p.anoId, mes, p.id).totalColaboradores;
  const numMembros = ctx.mes==='ano' ? membros(new Date().getMonth()+1) : membros(ctx.mes);
  const gasto = metricaProjeto(Store.gastoTotal, p);
  const ganho = metricaProjeto(Store.ganho, p);
  const saldo = ganho - gasto;
  return `<tr class="${indentado?'sub-row':''}">
    <td>${indentado?'':`<span class="color-dot" style="background:${p.cor}"></span>`}</td>
    <td><button class="link-btn" data-action="abrir-projeto" data-id="${p.id}">${escapeHtml(p.nome)}</button></td>
    <td class="mono small">${anoObj ? anoObj.ano : '—'}</td>
    <td>${tipoProjetoBadge(p)}</td>
    <td class="mono small">${periodoProjetoLabel(p)} ${p.emAndamento?'<span class="badge mensal">em andamento</span>':''}</td>
    <td class="num">${numMembros}</td>
    <td class="num loss-text">${formatCurrency(gasto)}</td>
    <td class="num gain-text">${formatCurrency(ganho)}</td>
    <td class="num" style="color:${saldo>=0?'var(--gain)':'var(--loss)'}">${formatCurrency(saldo)}</td>
    <td class="row-actions">
      <button class="icon-btn" data-action="editar-proj" data-id="${p.id}">Editar</button>
      <button class="icon-btn danger" data-action="remover-proj" data-id="${p.id}">Remover</button>
    </td>
  </tr>`;
}
// ---------------------------------------------------------------------------
// PROJETO — DETALHE (membros + ganhos + gastos extras deste projeto)
// ---------------------------------------------------------------------------
function renderProjetoDetalhe(){
  const projeto = Store.getProjeto(projetoDetalheId);
  if(!projeto){ setPage('projetos'); return; }
  const ano = Store.getAno(projeto.anoId);

  el('detalheAno').textContent = ano ? `Projeto · ${ano.ano}` : 'Projeto';
  el('detalheNomeProjeto').textContent = projeto.nome;
  el('detalheSubtitle').innerHTML = `${periodoProjetoLabel(projeto)} · Resumo ${periodoTexto()} · ${tipoProjetoBadge(projeto)}`;

  const btnRenovar = el('btnRenovarProjeto');
  const avisoRenovado = el('renovadoAviso');
  if(projeto.renovadoParaId){
    const continuacao = Store.getProjeto(projeto.renovadoParaId);
    const anoContinuacao = continuacao ? Store.getAno(continuacao.anoId) : null;
    btnRenovar.hidden = true;
    avisoRenovado.hidden = false;
    avisoRenovado.innerHTML = continuacao
      ? `Este projeto continua em <button class="link-btn" data-action="ir-continuacao" data-id="${continuacao.id}">${anoContinuacao?.ano ?? ''}</button>.`
      : '';
  }else if(projeto.emAndamento){
    btnRenovar.hidden = false;
    avisoRenovado.hidden = true;
  }else{
    btnRenovar.hidden = true;
    avisoRenovado.hidden = true;
  }

  const ehCultura = (projeto.tipo || 'impacto') === 'cultura';
  el('wrapGanhosProjeto').hidden = ehCultura;
  el('ganhosCulturaAviso').hidden = !ehCultura;

  const gasto = metrica(Store.gastoTotal, projetoDetalheId);
  const ganho = metrica(Store.ganho, projetoDetalheId);
  const saldo = ganho - gasto;
  el('detGasto').textContent = formatCurrency(gasto);
  el('detGanho').textContent = formatCurrency(ganho);
  el('detSaldo').textContent = formatCurrency(saldo);
  const stamp = el('detStampSaldo');
  stamp.classList.toggle('positivo', saldo>=0);
  stamp.classList.toggle('negativo', saldo<0);

  renderMembrosProjeto(projeto);
  if(!ehCultura) renderGanhosProjeto(projeto);
  renderGastosProjeto(projeto);
}

function renderMembrosProjeto(projeto){
  el('detMeses').innerHTML = mesTabsHtml(ctx.mes);

  const info = el('membrosInfo');
  const tbody = document.querySelector('#tblMembrosProjeto tbody');
  const emptyHint = el('membrosEmpty');

  if(ctx.mes === 'ano'){
    info.textContent = 'Selecione um mês específico no topo para ver e editar os membros deste projeto (a alocação é sempre mensal).';
    tbody.innerHTML = '';
    emptyHint.hidden = true;
    return;
  }
  const fimProjeto = projeto.emAndamento ? 12 : (projeto.mesFim || 12);
  if(ctx.mes < (projeto.mesInicio||1) || ctx.mes > fimProjeto){
    info.textContent = `"${projeto.nome}" não estava ativo em ${MESES_LONGO[ctx.mes-1]} (período do projeto: ${MESES[(projeto.mesInicio||1)-1]} → ${projeto.emAndamento ? 'em andamento' : MESES[fimProjeto-1]}).`;
    tbody.innerHTML = '';
    emptyHint.hidden = true;
    return;
  }
  info.textContent = `Percentual de envolvimento de cada colaborador em "${projeto.nome}" durante ${MESES_LONGO[ctx.mes-1]}.`;


  const anoDoProjeto = Store.getAno(ctx.anoId);
  // Só oferece colaboradores que já tinham entrado (e ainda não tinham saído)
  // até este (ano, mês).
  const colaboradores = Store.data.colaboradores.filter(c =>
    Store.colaboradorJaEntrou(c, anoDoProjeto.ano, ctx.mes) && !Store.colaboradorJaSaiu(c, anoDoProjeto.ano, ctx.mes));
  if(colaboradores.length===0){
    tbody.innerHTML = '';
    emptyHint.hidden = false;
    return;
  }
  emptyHint.hidden = true;
  tbody.innerHTML = colaboradores.map(c=>{
    const reg = Store.getAlocacao(ctx.anoId, ctx.mes, c.id, projeto.id);
    const val = reg ? reg.percentual : '';
    const custo = reg ? c.custoMensal * (reg.percentual/100) : 0;
    const total = Store.totalAlocadoColaborador(ctx.anoId, ctx.mes, c.id);
    const totalClass = total===100 ? 'total-ok' : (total===0 ? '' : 'total-bad');
    return `<tr>
      <td>${escapeHtml(c.nome)}</td>
      <td class="muted">${escapeHtml(c.cargo)}</td>
      <td><input type="number" class="pct" min="0" max="100" step="1" value="${val}"
            data-colab="${c.id}" placeholder="0"></td>
      <td class="num">${formatCurrency(custo)}</td>
      <td class="num total-cell ${totalClass}" data-total-for="${c.id}">${total}%</td>
    </tr>`;
  }).join('');
}

function atualizarLinhaMembro(colabId){
  const c = Store.data.colaboradores.find(x=>x.id===colabId);
  const projeto = Store.getProjeto(projetoDetalheId);
  const reg = Store.getAlocacao(ctx.anoId, ctx.mes, colabId, projeto.id);
  const custo = reg ? c.custoMensal * (reg.percentual/100) : 0;
  const row = document.querySelector(`input[data-colab="${colabId}"]`)?.closest('tr');
  if(row) row.children[3].textContent = formatCurrency(custo);
  const total = Store.totalAlocadoColaborador(ctx.anoId, ctx.mes, colabId);
  const cell = document.querySelector(`[data-total-for="${colabId}"]`);
  if(cell){
    cell.textContent = total + '%';
    cell.className = 'num total-cell ' + (total===100 ? 'total-ok' : (total===0 ? '' : 'total-bad'));
  }
  // outros projetos do colaborador também mudam a coluna "Total no mês" deles — mas
  // como estamos numa página de projeto único, isso só é visível se reabrir outro projeto.
  renderProjetos.__dirty = true;
}

function renderGanhosProjeto(projeto){
  preencherSelectMeses(el('pganhoMesInicio'));
  preencherSelectMeses(el('pganhoMesFim'));
  const lista = Store.data.ganhos.filter(g=>g.anoId===ctx.anoId && g.projetoId===projeto.id).sort((a,b)=>a.mesInicio-b.mesInicio);
  document.querySelector('#tblGanhosProjeto tbody').innerHTML = lista.map(g=>`
    <tr>
      <td>${escapeHtml(g.descricao)||'<span class="muted">—</span>'}</td>
      <td><span class="badge ${g.tipo}">${g.tipo==='pontual'?'Pontual':'Mensal'}</span></td>
      <td class="mono">${periodoLabel(g)}</td>
      <td class="num gain-text">${formatCurrency(g.valor)}</td>
      <td class="row-actions">
        <button class="icon-btn" data-action="editar-pganho" data-id="${g.id}">Editar</button>
        <button class="icon-btn danger" data-action="remover-pganho" data-id="${g.id}">Remover</button>
      </td>
    </tr>`).join('') || `<tr><td colspan="5" class="empty-hint">Nenhum ganho lançado neste projeto ainda.</td></tr>`;
}

function renderGastosProjeto(projeto){
  preencherSelectMeses(el('pgastoMesInicio'));
  preencherSelectMeses(el('pgastoMesFim'));
  const lista = Store.data.gastosExtras.filter(g=>g.anoId===ctx.anoId && g.projetoId===projeto.id).sort((a,b)=>a.mesInicio-b.mesInicio);
  document.querySelector('#tblGastosProjeto tbody').innerHTML = lista.map(g=>`
    <tr>
      <td>${escapeHtml(g.descricao)||'<span class="muted">—</span>'}</td>
      <td><span class="badge ${g.tipo}">${g.tipo==='pontual'?'Pontual':'Mensal'}</span></td>
      <td class="mono">${periodoLabel(g)}</td>
      <td class="num loss-text">${formatCurrency(g.valor)}</td>
      <td class="row-actions">
        <button class="icon-btn" data-action="editar-pgasto" data-id="${g.id}">Editar</button>
        <button class="icon-btn danger" data-action="remover-pgasto" data-id="${g.id}">Remover</button>
      </td>
    </tr>`).join('') || `<tr><td colspan="5" class="empty-hint">Nenhum gasto extra lançado neste projeto ainda.</td></tr>`;
}

function preencherSelectMeses(select){
  select.innerHTML = MESES_LONGO.map((m,i)=>`<option value="${i+1}">${m}</option>`).join('');
}

// Campo de texto "mês/ano de início" de um projeto (ex.: "05/2022").
// Em vez de um <select>, o usuário digita só números e o campo se
// auto-formata como mm/aaaa conforme ele digita.
function maskMesAno(input){
  let digitos = input.value.replace(/\D/g, '').slice(0, 6); // no máx. MMAAAA
  let saida = digitos;
  if(digitos.length >= 2) saida = digitos.slice(0,2) + '/' + digitos.slice(2);
  input.value = saida;
}

// Monta o texto "mm/aaaa" a partir de um ano cadastrado (objeto) + número do mês.
function formatarValorInicio(anoObj, mes){
  if(!anoObj || !mes) return '';
  return `${String(mes).padStart(2,'0')}/${anoObj.ano}`;
}

// Lê o texto "mm/aaaa" digitado e devolve { mes, ano } válidos, ou null se
// o texto ainda estiver incompleto/errado.
function parseValorInicio(texto){
  const m = (texto || '').match(/^(\d{2})\/(\d{4})$/);
  if(!m) return null;
  const mes = parseInt(m[1], 10);
  const ano = parseInt(m[2], 10);
  if(mes < 1 || mes > 12) return null;
  if(ano < 1900 || ano > 2999) return null;
  return { mes, ano };
}

// ---------------------------------------------------------------------------
// COLABORADOR — DETALHE (em quais projetos ele está, e com que % em cada mês)
// ---------------------------------------------------------------------------
function renderColaboradorDetalhe(){
  const colab = Store.data.colaboradores.find(c=>c.id===colaboradorDetalheId);
  if(!colab){ setPage('colaboradores'); return; }

  el('colabDetNome').textContent = colab.nome;
  el('colabDetSubtitle').textContent = `${colab.cargo} · Custo mensal integral: ${formatCurrency(colab.custoMensal)}`;

  const anos = [...Store.data.anos].sort((a,b)=>a.ano-b.ano);
  const selAno = el('colabAno');
  selAno.innerHTML = anos.length
    ? anos.map(a=>`<option value="${a.id}">${a.ano}</option>`).join('')
    : `<option value="">Nenhum ano cadastrado</option>`;
  if(ctx.anoId) selAno.value = ctx.anoId;

  el('colabMeses').innerHTML = mesTabsHtml(ctx.mes);

  const info = el('colabProjetosInfo');
  const tbody = document.querySelector('#tblProjetosColaborador tbody');
  const emptyHint = el('colabProjetosEmpty');

  if(!ctx.anoId){
    info.textContent = 'Selecione um ano (na aba Anos ou no Dashboard) para ver os projetos deste colaborador.';
    tbody.innerHTML = '';
    emptyHint.hidden = true;
    return;
  }
  if(ctx.mes === 'ano'){
    info.textContent = 'Selecione um mês específico no topo para ver e editar o % deste colaborador em cada projeto (a alocação é sempre mensal).';
    tbody.innerHTML = '';
    emptyHint.hidden = true;
    return;
  }

  const anoObj = Store.getAno(ctx.anoId);
  const total = Store.totalAlocadoColaborador(ctx.anoId, ctx.mes, colab.id);
  const totalClass = total===100 ? 'total-ok' : (total===0 ? '' : 'total-bad');
  info.innerHTML = `Envolvimento de <strong>${escapeHtml(colab.nome)}</strong> em cada projeto de ${anoObj.ano} durante ${MESES_LONGO[ctx.mes-1]}. Total alocado no mês: <span class="total-cell ${totalClass}" id="colabTotalMes">${total}%</span>.`;

  if(!Store.colaboradorJaEntrou(colab, anoObj.ano, ctx.mes)){
    tbody.innerHTML = '';
    emptyHint.hidden = false;
    const entradaTxt = formatarValorInicio(Store.getAno(colab.entradaAnoId), colab.entradaMes);
    emptyHint.textContent = `${colab.nome} ainda não tinha entrado (entrada: ${entradaTxt}).`;
    return;
  }
  if(Store.colaboradorJaSaiu(colab, anoObj.ano, ctx.mes)){
    tbody.innerHTML = '';
    emptyHint.hidden = false;
    const saidaTxt = formatarValorInicio(Store.getAno(colab.saidaAnoId), colab.saidaMes);
    emptyHint.textContent = `${colab.nome} já tinha saído (saída: ${saidaTxt}).`;
    return;
  }

  const projetosDoAno = Store.projetosDoAno(ctx.anoId);
  if(projetosDoAno.length===0){
    tbody.innerHTML = '';
    emptyHint.hidden = false;
    emptyHint.textContent = `Nenhum projeto cadastrado em ${anoObj.ano} ainda.`;
    return;
  }
  // só mostra projetos que já tinham começado (e ainda não tinham terminado)
  // no mês selecionado — evita alocar colaborador antes do projeto existir.
  const projetos = projetosDoAno.filter(p=>{
    const fim = p.emAndamento ? 12 : (p.mesFim || 12);
    return ctx.mes >= (p.mesInicio||1) && ctx.mes <= fim;
  });
  if(projetos.length===0){
    tbody.innerHTML = '';
    emptyHint.hidden = false;
    emptyHint.textContent = `Nenhum projeto ativo em ${MESES_LONGO[ctx.mes-1]} de ${anoObj.ano}.`;
    return;
  }
  emptyHint.hidden = true;
  tbody.innerHTML = projetos.map(p=>{
    const reg = Store.getAlocacao(ctx.anoId, ctx.mes, colab.id, p.id);
    const val = reg ? reg.percentual : '';
    const custo = reg ? colab.custoMensal * (reg.percentual/100) : 0;
    const periodo = Store.periodoColaboradorNoProjeto(ctx.anoId, colab.id, p.id);
    const periodoTxt = periodo ? `${MESES[periodo.min-1]} → ${MESES[periodo.max-1]}` : '<span class="muted">—</span>';
    return `<tr>
      <td><span class="color-dot" style="background:${p.cor}"></span>${escapeHtml(p.nome)}</td>
      <td class="mono small">${periodoTxt}</td>
      <td><input type="number" class="pct" min="0" max="100" step="1" value="${val}"
            data-projeto="${p.id}" placeholder="0"></td>
      <td class="num">${formatCurrency(custo)}</td>
    </tr>`;
  }).join('');
}

function atualizarColaboradorDetalheTotal(){
  const total = Store.totalAlocadoColaborador(ctx.anoId, ctx.mes, colaboradorDetalheId);
  const cell = el('colabTotalMes');
  if(cell){
    cell.textContent = total + '%';
    cell.className = 'total-cell ' + (total===100 ? 'total-ok' : (total===0 ? '' : 'total-bad'));
  }
}

// ---------------------------------------------------------------------------
// Eventos: navegação e contexto
// ---------------------------------------------------------------------------
el('nav').addEventListener('click', e=>{
  const btn = e.target.closest('.nav-item');
  if(!btn) return;
  setPage(btn.dataset.page);
});

el('ctxAno').addEventListener('change', e=>{
  ctx.anoId = e.target.value || null;
  Store.setAnoAtivo(ctx.anoId);
  ctx.projetoId = '';
  rerenderCurrent();
});

document.body.addEventListener('click', e=>{
  const btn = e.target.closest('.month-tabs button');
  if(!btn) return;
  const v = btn.dataset.mes;
  ctx.mes = v==='ano' ? 'ano' : parseInt(v,10);
  rerenderCurrent();
});

el('ctxProjeto').addEventListener('change', e=>{
  ctx.projetoId = e.target.value;
  rerenderCurrent();
});

el('btnVoltarProjetos').addEventListener('click', ()=>{ setPage('projetos'); });

el('btnRenovarProjeto').addEventListener('click', ()=>{
  const res = Store.renovarProjeto(projetoDetalheId);
  if(!res.ok){ toast(res.msg); return; }
  toast('Projeto continuado no próximo ano.');
  projetoDetalheId = res.projeto.id;
  ctx.anoId = res.projeto.anoId;
  Store.setAnoAtivo(ctx.anoId);
  renderProjetoDetalhe();
});

document.querySelector('#page-projeto-detalhe').addEventListener('click', e=>{
  const btn = e.target.closest('button[data-action="ir-continuacao"]');
  if(!btn) return;
  projetoDetalheId = btn.dataset.id;
  const p = Store.getProjeto(projetoDetalheId);
  if(p){ ctx.anoId = p.anoId; Store.setAnoAtivo(ctx.anoId); }
  renderProjetoDetalhe();
});

el('colabAno').addEventListener('change', e=>{
  ctx.anoId = e.target.value || null;
  Store.setAnoAtivo(ctx.anoId);
  rerenderCurrent();
});

// ---------------------------------------------------------------------------
// Eventos: Anos + Ganhos gerais
// ---------------------------------------------------------------------------

document.querySelector('#page-anos').addEventListener('click', e=>{
  const btn = e.target.closest('button[data-action]');
  if(!btn) return;
  const { action, id } = btn.dataset;
  if(action==='selecionar-ano'){
    ctx.anoId = id;
    Store.setAnoAtivo(id);
    ctx.projetoId = '';
    toast('Ano selecionado.');
    renderAnos(); renderContextBar();
  }
  if(action==='remover-ano'){
    if(!confirm('Excluir este ano? Todos os projetos, alocações e lançamentos dele serão perdidos.')) return;
    Store.removerAno(id);
    ctx.anoId = Store.data.activeAnoId;
    toast('Ano excluído.');
    renderAnos(); renderContextBar();
  }
  if(action==='editar-geral'){
    const g = Store.data.ganhos.find(x=>x.id===id);
    el('geralId').value = g.id;
    el('geralTipo').value = g.tipo;
    el('geralTipo').dispatchEvent(new Event('change'));
    el('geralMesInicio').value = g.mesInicio;
    el('geralMesFim').value = g.mesFim;
    el('geralDescricao').value = g.descricao;
    el('geralValor').value = g.valor;
    el('btnGeralSubmit').textContent = 'Salvar alterações';
    el('btnGeralCancel').hidden = false;
    window.scrollTo({top:0, behavior:'smooth'});
  }
  if(action==='remover-geral'){
    if(!confirm('Remover este ganho geral?')) return;
    Store.removerGanho(id);
    toast('Ganho removido.');
    renderAnos();
  }
});

el('formGanhoGeral').addEventListener('submit', e=>{
  e.preventDefault();
  if(!ctx.anoId){ toast('Crie e selecione um ano primeiro.'); return; }
  Store.salvarGanho({
    id: el('geralId').value || null,
    anoId: ctx.anoId,
    projetoId: null,
    tipo: el('geralTipo').value,
    mesInicio: el('geralMesInicio').value,
    mesFim: el('geralMesFim').value,
    descricao: el('geralDescricao').value.trim(),
    valor: el('geralValor').value
  });
  toast('Ganho geral salvo.');
  resetFormGeral();
  renderAnos();
});
el('btnGeralCancel').addEventListener('click', resetFormGeral);
function resetFormGeral(){
  el('geralId').value = '';
  el('formGanhoGeral').reset();
  el('geralTipo').dispatchEvent(new Event('change'));
  el('btnGeralSubmit').textContent = 'Adicionar ganho geral';
  el('btnGeralCancel').hidden = true;
}


el('colabCargo').addEventListener('change', ()=>{
  const opt = el('colabCargo').selectedOptions[0];
  const salario = opt?.dataset.salario;
  if(salario !== undefined) el('colabCusto').value = salario;
});
el('colabEntrada').addEventListener('input', () => maskMesAno(el('colabEntrada')));
el('colabSaida').addEventListener('input', () => maskMesAno(el('colabSaida')));
function syncColabSaida(){
  el('wrapColabSaida').style.display = el('colabAtivo').checked ? 'none' : '';
}
el('colabAtivo').addEventListener('change', syncColabSaida);
syncColabSaida();
// ---------------------------------------------------------------------------
// Eventos: Colaboradores
// ---------------------------------------------------------------------------
el('formColaborador').addEventListener('submit', e=>{
  e.preventDefault();

  // Data de entrada é opcional. Se preenchida, precisa estar completa
  // (mm/aaaa) e cria o ano automaticamente se ainda não existir.
  const entradaTexto = el('colabEntrada').value.trim();
  let entradaAnoId = null, entradaMes = null;
  if(entradaTexto){
    const entradaDigitada = parseValorInicio(entradaTexto);
    if(!entradaDigitada){ toast('Digite a data de entrada no formato mm/aaaa (ex.: 05/2022), ou deixe em branco.'); return; }
    let anoObj = Store.getAnoPorNumero(entradaDigitada.ano);
    if(!anoObj){
      const resultado = Store.criarAno(entradaDigitada.ano);
      anoObj = resultado.ok ? resultado.ano : Store.getAnoPorNumero(entradaDigitada.ano);
    }
    if(!anoObj){ toast('Não foi possível registrar esse ano.'); return; }
    entradaAnoId = anoObj.id;
    entradaMes = entradaDigitada.mes;
  }

  // "Em atividade" desmarcado exige uma data de saída válida — mas essa,
  // diferente da entrada, só aceita um ano que já exista (não cria ano novo
  // sozinho por um mm/aaaa digitado errado).
  const ativo = el('colabAtivo').checked;
  let saidaAnoId = null, saidaMes = null;
  if(!ativo){
    const saidaTexto = el('colabSaida').value.trim();
    const saidaDigitada = parseValorInicio(saidaTexto);
    if(!saidaDigitada){ toast('Digite a data de saída no formato mm/aaaa (ex.: 05/2026), ou marque "Em atividade".'); return; }
    const anoObj = Store.getAnoPorNumero(saidaDigitada.ano);
    if(!anoObj){ toast(`Não existe o ano ${saidaDigitada.ano} cadastrado (os anos vão de 2020 até o atual).`); return; }
    saidaAnoId = anoObj.id;
    saidaMes = saidaDigitada.mes;
  }

  Store.salvarColaborador({
    id: el('colabId').value || null,
    nome: el('colabNome').value.trim(),
    cargo: el('colabCargo').value.trim(),
    custoMensal: el('colabCusto').value,
    entradaAnoId,
    entradaMes,
    ativo,
    saidaAnoId,
    saidaMes
  });
  toast('Colaborador salvo.');
  resetFormColaborador();
  renderColaboradores();
});

el('btnColabCancel').addEventListener('click', resetFormColaborador);

function resetFormColaborador(){
  el('colabId').value = '';
  el('formColaborador').reset();
  el('colabAtivo').checked = true;
  syncColabSaida();
  el('btnColabSubmit').textContent = 'Adicionar colaborador';
  el('btnColabCancel').hidden = true;
}

document.querySelector('#page-colaboradores').addEventListener('click', e=>{
  const btn = e.target.closest('button[data-action]');
  if(!btn) return;
  const { action, id } = btn.dataset;
  if(action==='abrir-colaborador'){
    colaboradorDetalheId = id;
    setPage('colaborador-detalhe');
  }
  if(action==='editar-colab'){
    const c = Store.data.colaboradores.find(x=>x.id===id);
    el('colabId').value = c.id;
    el('colabNome').value = c.nome;
    preencherSelectCargos(el('colabCargo'), c.cargo);
    el('colabCusto').value = c.custoMensal;
    const anoEntradaAtual = c.entradaAnoId ? Store.getAno(c.entradaAnoId) : null;
    el('colabEntrada').value = anoEntradaAtual ? formatarValorInicio(anoEntradaAtual, c.entradaMes) : '';
    el('colabAtivo').checked = c.ativo !== false;
    const anoSaidaAtual = c.saidaAnoId ? Store.getAno(c.saidaAnoId) : null;
    el('colabSaida').value = anoSaidaAtual ? formatarValorInicio(anoSaidaAtual, c.saidaMes) : '';
    syncColabSaida();
    el('btnColabSubmit').textContent = 'Salvar alterações';
    el('btnColabCancel').hidden = false;
    window.scrollTo({top:0, behavior:'smooth'});
  }
  if(action==='remover-colab'){
    if(!confirm('Remover este colaborador? As alocações dele em qualquer projeto também serão removidas.')) return;
    Store.removerColaborador(id);
    toast('Colaborador removido.');
    renderColaboradores();
  }
});

// ---------------------------------------------------------------------------
// Eventos: Cargos
// ---------------------------------------------------------------------------
el('formCargo').addEventListener('submit', e=>{
  e.preventDefault();
  const idEditando = el('cargoId').value;
  const nome = el('cargoNome').value.trim();
  const salario = el('cargoSalario').value;
  if(idEditando){
    Store.salvarCargo({ id: idEditando, nome, salario });
    toast('Cargo atualizado.');
  }else{
    const resultado = Store.criarCargo(nome, salario);
    if(!resultado.ok){ toast(resultado.msg); return; }
    toast('Cargo criado.');
  }
  resetFormCargo();
  renderCargos();
});

el('btnCargoCancel').addEventListener('click', resetFormCargo);

function resetFormCargo(){
  el('cargoId').value = '';
  el('formCargo').reset();
  el('btnCargoSubmit').textContent = 'Adicionar cargo';
  el('btnCargoCancel').hidden = true;
}

document.querySelector('#page-cargos').addEventListener('click', e=>{
  const btn = e.target.closest('button[data-action]');
  if(!btn) return;
  const { action, id } = btn.dataset;
  if(action==='editar-cargo'){
    const c = Store.getCargo(id);
    el('cargoId').value = c.id;
    el('cargoNome').value = c.nome;
    el('cargoSalario').value = c.salario;
    el('btnCargoSubmit').textContent = 'Salvar alterações';
    el('btnCargoCancel').hidden = false;
    window.scrollTo({top:0, behavior:'smooth'});
  }
  if(action==='remover-cargo'){
    const qtd = Store.colaboradoresPorCargo(Store.getCargo(id)?.nome);
    const aviso = qtd > 0
      ? `Remover este cargo? ${qtd} colaborador(es) usam ele hoje — eles mantêm o cargo atual, só sai da lista de opções pra novos cadastros.`
      : 'Remover este cargo?';
    if(!confirm(aviso)) return;
    Store.removerCargo(id);
    toast('Cargo removido.');
    renderCargos();
  }
});

// ---------------------------------------------------------------------------
// Eventos: Projetos (lista)
// ---------------------------------------------------------------------------
function syncProjMesFim(){
  el('wrapProjMesFim').style.display = el('projEmAndamento').checked ? 'none' : '';
}
el('projEmAndamento').addEventListener('change', syncProjMesFim);
syncProjMesFim();

el('projInicio').addEventListener('input', () => maskMesAno(el('projInicio')));

el('formProjeto').addEventListener('submit', e=>{
  e.preventDefault();
  const inicioDigitado = parseValorInicio(el('projInicio').value);
  if(!inicioDigitado){ toast('Digite o início do projeto no formato mm/aaaa (ex.: 05/2022).'); return; }
  let anoObj = Store.getAnoPorNumero(inicioDigitado.ano);
  if(!anoObj){
    const resultado = Store.criarAno(inicioDigitado.ano);
    anoObj = resultado.ok ? resultado.ano : Store.getAnoPorNumero(inicioDigitado.ano);
  }
  if(!anoObj){ toast('Não foi possível registrar esse ano.'); return; }
  const mesInicioSelecionado = inicioDigitado.mes;

  const idEditando = el('projId').value;
  const nomeDigitado = el('projNome').value.trim();

  // Avisa (sem bloquear) se já existe um projeto com esse nome no mesmo ano —
  // evita duplicatas por clique duplo ou campo não limpo entre criações.
  if(!idEditando){
    const jaExiste = Store.projetosDoAno(anoObj.id)
      .some(p => p.nome.trim().toLowerCase() === nomeDigitado.toLowerCase());
    if(jaExiste){
      const seguir = confirm(`Já existe um projeto chamado "${nomeDigitado}" em ${anoObj.ano}. Quer criar outro mesmo assim?`);
      if(!seguir) return;
    }
  }

  if(idEditando){
    const projetoAtual = Store.getProjeto(idEditando);
    if(projetoAtual && projetoAtual.anoId !== anoObj.id){
      const n = Store.contarRegistrosDoProjetoNoAno(idEditando, projetoAtual.anoId);
      if(n > 0) toast(`Ano alterado — atenção: ${n} registro(s) (membros/ganhos) de ${Store.getAno(projetoAtual.anoId)?.ano} não foram movidos.`);
    }
  }

  ctx.anoId = anoObj.id;
  Store.setAnoAtivo(anoObj.id);
  Store.salvarProjeto({
    id: idEditando || null,
    nome: nomeDigitado,
    anoId: anoObj.id,
    mesInicio: mesInicioSelecionado,
    mesFim: el('projMesFim').value,
    emAndamento: el('projEmAndamento').checked,
    tipo: el('projTipo').value
  });
  if(!idEditando) toast(`Projeto salvo em ${anoObj.ano}.`);
  resetFormProjeto();
  renderProjetos();
  renderContextBar();
});

el('btnProjCancel').addEventListener('click', resetFormProjeto);

function resetFormProjeto(){
  el('projId').value = '';
  el('formProjeto').reset();
  el('projEmAndamento').checked = true;
  syncProjMesFim();
  el('btnProjSubmit').textContent = 'Adicionar projeto';
  el('btnProjCancel').hidden = true;
}

document.querySelector('#page-projetos').addEventListener('click', e=>{
  const linhaGrupo = e.target.closest('tr[data-action="toggle-grupo-projeto"]');
  if(linhaGrupo){
    const grupoId = linhaGrupo.dataset.grupo;
    if(projetosGruposAbertos.has(grupoId)) projetosGruposAbertos.delete(grupoId);
    else projetosGruposAbertos.add(grupoId);
    renderProjetos();
    return;
  }
  const btn = e.target.closest('button[data-action]');
  if(!btn) return;
  const { action, id } = btn.dataset;
  if(action==='abrir-projeto'){
    projetoDetalheId = id;
    setPage('projeto-detalhe');
  }
  if(action==='editar-proj'){
    const p = Store.getProjeto(id);
    el('projId').value = p.id;
    el('projNome').value = p.nome;
    el('projInicio').value = formatarValorInicio(Store.getAno(p.anoId), p.mesInicio || 1);
    el('projTipo').value = p.tipo || 'impacto';
    el('projEmAndamento').checked = p.emAndamento !== false;
    el('projMesFim').value = p.mesFim || 12;
    syncProjMesFim();
    el('btnProjSubmit').textContent = 'Salvar alterações';
    el('btnProjCancel').hidden = false;
    window.scrollTo({top:0, behavior:'smooth'});
  }
  if(action==='remover-proj'){
    if(!confirm('Remover este projeto? Os membros e ganhos ligados a ele também serão removidos.')) return;
    Store.removerProjeto(id);
    toast('Projeto removido.');
    renderProjetos();
    renderContextBar();
  }
});

// ---------------------------------------------------------------------------
// Eventos: Projeto detalhe — Membros
// ---------------------------------------------------------------------------
el('tblMembrosProjeto').addEventListener('change', e=>{
  const input = e.target.closest('input.pct');
  if(!input) return;
  const projeto = Store.getProjeto(projetoDetalheId);
  const anterior = Store.getAlocacao(ctx.anoId, ctx.mes, input.dataset.colab, projeto.id)?.percentual ?? '';
  const res = Store.setAlocacao(ctx.anoId, ctx.mes, input.dataset.colab, projeto.id, input.value);
  if(!res.ok){
    toast(res.msg);
    input.value = anterior;
    return;
  }
  atualizarLinhaMembro(input.dataset.colab);
});

// ---------------------------------------------------------------------------
// Eventos: Colaborador detalhe
// ---------------------------------------------------------------------------
el('btnVoltarColaboradores').addEventListener('click', ()=>{ setPage('colaboradores'); });

el('tblProjetosColaborador').addEventListener('change', e=>{
  const input = e.target.closest('input.pct');
  if(!input) return;
  const projetoId = input.dataset.projeto;
  const anterior = Store.getAlocacao(ctx.anoId, ctx.mes, colaboradorDetalheId, projetoId)?.percentual ?? '';
  const res = Store.setAlocacao(ctx.anoId, ctx.mes, colaboradorDetalheId, projetoId, input.value);
  if(!res.ok){
    toast(res.msg);
    input.value = anterior;
    return;
  }
  const colab = Store.data.colaboradores.find(c=>c.id===colaboradorDetalheId);
  const reg = Store.getAlocacao(ctx.anoId, ctx.mes, colaboradorDetalheId, projetoId);
  const custo = reg ? colab.custoMensal * (reg.percentual/100) : 0;
  const row = input.closest('tr');
  row.children[3].textContent = formatCurrency(custo);
  atualizarColaboradorDetalheTotal();
});

el('btnCopiarMesAnteriorProjeto').addEventListener('click', ()=>{
  if(!ctx.anoId || ctx.mes==='ano'){ toast('Selecione um mês específico primeiro.'); return; }
  const res = Store.copiarAlocacaoProjetoMesAnterior(ctx.anoId, projetoDetalheId, ctx.mes);
  if(!res.ok){ toast(res.msg); return; }
  toast('Percentuais copiados do mês anterior.');
  renderMembrosProjeto(Store.getProjeto(projetoDetalheId));
});

el('btnCopiarMesAnteriorColab').addEventListener('click', ()=>{
  if(!ctx.anoId || ctx.mes==='ano'){ toast('Selecione um mês específico primeiro.'); return; }
  const res = Store.copiarAlocacaoColaboradorMesAnterior(ctx.anoId, colaboradorDetalheId, ctx.mes);
  if(!res.ok){ toast(res.msg); return; }
  toast('Percentuais copiados do mês anterior.');
  renderColaboradorDetalhe();
});

// ---------------------------------------------------------------------------
// Eventos: Projeto detalhe — Ganhos
// ---------------------------------------------------------------------------
function wireTipoToggle({tipoId, wrapFimId, lblInicioId}){
  const tipoSel = el(tipoId);
  const wrapFim = el(wrapFimId);
  const lblInicio = el(lblInicioId);
  function syncTipo(){
    const mensal = tipoSel.value === 'mensal';
    wrapFim.hidden = !mensal;
    lblInicio.textContent = mensal ? 'A partir de' : 'Mês';
  }
  tipoSel.addEventListener('change', syncTipo);
  syncTipo();
}
wireTipoToggle({ tipoId:'geralTipo', wrapFimId:'wrapGeralMesFim', lblInicioId:'lblGeralMesInicio' });
wireTipoToggle({ tipoId:'pganhoTipo', wrapFimId:'wrapPGanhoMesFim', lblInicioId:'lblPGanhoMesInicio' });
wireTipoToggle({ tipoId:'pgastoTipo', wrapFimId:'wrapPGastoMesFim', lblInicioId:'lblPGastoMesInicio' });

el('formGanhoProjeto').addEventListener('submit', e=>{
  e.preventDefault();
  const projeto = Store.getProjeto(projetoDetalheId);
  const res = Store.salvarGanho({
    id: el('pganhoId').value || null,
    anoId: ctx.anoId,
    projetoId: projeto.id,
    tipo: el('pganhoTipo').value,
    mesInicio: el('pganhoMesInicio').value,
    mesFim: el('pganhoMesFim').value,
    descricao: el('pganhoDescricao').value.trim(),
    valor: el('pganhoValor').value
  });
  if(res && res.ok===false){ toast(res.msg); return; }
  toast('Ganho salvo.');
  resetFormGanhoProjeto();
  renderProjetoDetalhe();
});
el('btnPGanhoCancel').addEventListener('click', resetFormGanhoProjeto);
function resetFormGanhoProjeto(){
  el('pganhoId').value = '';
  el('formGanhoProjeto').reset();
  el('pganhoTipo').dispatchEvent(new Event('change'));
  el('btnPGanhoSubmit').textContent = 'Adicionar ganho';
  el('btnPGanhoCancel').hidden = true;
}

document.querySelector('#tblGanhosProjeto').addEventListener('click', e=>{
  const btn = e.target.closest('button[data-action]');
  if(!btn) return;
  const { action, id } = btn.dataset;
  if(action==='editar-pganho'){
    const g = Store.data.ganhos.find(x=>x.id===id);
    el('pganhoId').value = g.id;
    el('pganhoTipo').value = g.tipo;
    el('pganhoTipo').dispatchEvent(new Event('change'));
    el('pganhoMesInicio').value = g.mesInicio;
    el('pganhoMesFim').value = g.mesFim;
    el('pganhoDescricao').value = g.descricao;
    el('pganhoValor').value = g.valor;
    el('btnPGanhoSubmit').textContent = 'Salvar alterações';
    el('btnPGanhoCancel').hidden = false;
    window.scrollTo({top:0, behavior:'smooth'});
  }
  if(action==='remover-pganho'){
    if(!confirm('Remover este ganho?')) return;
    Store.removerGanho(id);
    toast('Ganho removido.');
    renderProjetoDetalhe();
  }
});

// ---------------------------------------------------------------------------
// Eventos: Projeto detalhe — Gastos extras
// ---------------------------------------------------------------------------
el('formGastoProjeto').addEventListener('submit', e=>{
  e.preventDefault();
  const projeto = Store.getProjeto(projetoDetalheId);
  Store.salvarGastoExtra({
    id: el('pgastoId').value || null,
    anoId: ctx.anoId,
    projetoId: projeto.id,
    tipo: el('pgastoTipo').value,
    mesInicio: el('pgastoMesInicio').value,
    mesFim: el('pgastoMesFim').value,
    descricao: el('pgastoDescricao').value.trim(),
    valor: el('pgastoValor').value
  });
  toast('Gasto salvo.');
  resetFormGastoProjeto();
  renderProjetoDetalhe();
});
el('btnPGastoCancel').addEventListener('click', resetFormGastoProjeto);
function resetFormGastoProjeto(){
  el('pgastoId').value = '';
  el('formGastoProjeto').reset();
  el('pgastoTipo').dispatchEvent(new Event('change'));
  el('btnPGastoSubmit').textContent = 'Adicionar gasto';
  el('btnPGastoCancel').hidden = true;
}

document.querySelector('#tblGastosProjeto').addEventListener('click', e=>{
  const btn = e.target.closest('button[data-action]');
  if(!btn) return;
  const { action, id } = btn.dataset;
  if(action==='editar-pgasto'){
    const g = Store.data.gastosExtras.find(x=>x.id===id);
    el('pgastoId').value = g.id;
    el('pgastoTipo').value = g.tipo;
    el('pgastoTipo').dispatchEvent(new Event('change'));
    el('pgastoMesInicio').value = g.mesInicio;
    el('pgastoMesFim').value = g.mesFim;
    el('pgastoDescricao').value = g.descricao;
    el('pgastoValor').value = g.valor;
    el('btnPGastoSubmit').textContent = 'Salvar alterações';
    el('btnPGastoCancel').hidden = false;
    window.scrollTo({top:0, behavior:'smooth'});
  }
  if(action==='remover-pgasto'){
    if(!confirm('Remover este gasto?')) return;
    Store.removerGastoExtra(id);
    toast('Gasto removido.');
    renderProjetoDetalhe();
  }
});

// ---------------------------------------------------------------------------
// Exportar / Importar backup
// ---------------------------------------------------------------------------
// Sincronia entre abas: se outra aba/janela deste site salvar dados novos,
// esta aba recarrega o que está em memória em vez de continuar com a versão
// antiga (que senão poderia "ressuscitar" algo apagado ao salvar de novo).
// ---------------------------------------------------------------------------
window.addEventListener('storage', e=>{
  if(e.key !== STORAGE_KEY || !e.newValue) return;
  try{
    Store.data = JSON.parse(e.newValue);
    Store.garantirAnosPadrao();
    if(!Store.getAno(ctx.anoId)) ctx.anoId = Store.data.activeAnoId;
    toast('Dados atualizados (outra aba salvou algo).');
    rerenderCurrent();
  }catch(err){ /* ignora se o valor salvo não for JSON válido */ }
});

// ---------------------------------------------------------------------------
el('btnExport').addEventListener('click', ()=>{
  const blob = new Blob([Store.exportJSON()], { type:'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `painel-roi-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

// ---------------------------------------------------------------------------
// Início
// ---------------------------------------------------------------------------
(function init(){
  Store.load();
  ctx.anoId = Store.data.activeAnoId;
  el('storageWarning').hidden = Store._storageOk;
  setPage('dashboard');
})();