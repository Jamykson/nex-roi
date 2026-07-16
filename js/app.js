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
  const navKey = page==='projeto-detalhe' ? 'projetos' : page;
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active', b.dataset.page===navKey));
  document.querySelector('.context-bar').style.display = (page==='dashboard') ? '' : 'none';
  renderPage(page);
}

function renderPage(page){
  renderContextBar();
  switch(page){
    case 'dashboard': return renderDashboard();
    case 'anos': return renderAnos();
    case 'colaboradores': return renderColaboradores();
    case 'projetos': return renderProjetos();
    case 'projeto-detalhe': return renderProjetoDetalhe();
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
      tbodyColab.innerHTML = linhas.map(l=>`
        <tr>
          <td>${escapeHtml(l.colaborador.nome)}</td>
          <td class="muted">${escapeHtml(l.colaborador.cargo)}</td>
          <td>${escapeHtml(l.projetoNome)}</td>
          <td class="num">${l.percentualLabel}</td>
          <td class="num">${formatCurrency(l.custo)}</td>
        </tr>`).join('');
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
    percentualLabel: (a.pctSoma / a.meses).toFixed(1).replace('.0','') + '% méd.',
    custo: a.custo
  }));
}

function renderChartEvolucao(){
  const canvas = el('chartEvolucao');
  if(!ctx.anoId){
    if(chartEvolucao){ chartEvolucao.destroy(); chartEvolucao=null; }
    return;
  }
  const filtro = projetoFiltroAtual();
  const gastos = [], ganhos = [];
  for(let m=1;m<=12;m++){
    gastos.push(Store.gastoTotal(ctx.anoId, m, filtro));
    ganhos.push(Store.ganho(ctx.anoId, m, filtro));
  }
  if(chartEvolucao) chartEvolucao.destroy();
  chartEvolucao = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: MESES,
      datasets: [
        { label:'Gasto', data:gastos, backgroundColor:'#C2483C', borderRadius:4, maxBarThickness:26 },
        { label:'Ganho', data:ganhos, backgroundColor:'#0E7C6B', borderRadius:4, maxBarThickness:26 }
      ]
    },
    options: {
      responsive:true,
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
function renderColaboradores(){
  document.querySelector('#tblColaboradores tbody').innerHTML = Store.data.colaboradores.map(c=>`
    <tr>
      <td>${escapeHtml(c.nome)}</td>
      <td class="muted">${escapeHtml(c.cargo)}</td>
      <td class="num">${formatCurrency(c.custoMensal)}</td>
      <td class="row-actions">
        <button class="icon-btn" data-action="editar-colab" data-id="${c.id}">Editar</button>
        <button class="icon-btn danger" data-action="remover-colab" data-id="${c.id}">Remover</button>
      </td>
    </tr>`).join('') || `<tr><td colspan="4" class="empty-hint">Nenhum colaborador cadastrado ainda.</td></tr>`;
}

// ---------------------------------------------------------------------------
// PROJETOS (lista, dentro do ano ativo)
// ---------------------------------------------------------------------------
function periodoProjetoLabel(p){
  const inicio = MESES[(p.mesInicio||1)-1];
  if(p.emAndamento || !p.mesFim) return `${inicio} → em andamento`;
  return `${inicio} → ${MESES[p.mesFim-1]}`;
}

function renderProjetos(){
  const semAno = !ctx.anoId;
  el('projetosSubtitle').textContent = semAno
    ? 'Selecione um ano no formulário abaixo para começar.'
    : `Projetos cadastrados em ${Store.getAno(ctx.anoId).ano}.`;
  preencherSelectMeses(el('projMesInicio'));
  preencherSelectMeses(el('projMesFim'));

  const selAno = el('projAno');
  const valorAtual = el('projId').value ? selAno.value : (ctx.anoId || '');
  selAno.innerHTML = Store.data.anos.map(a=>`<option value="${a.id}">${a.ano}</option>`).join('');
  if(valorAtual) selAno.value = valorAtual;

  const tbody = document.querySelector('#tblProjetos tbody');
  const emptyHint = el('projetosEmpty');
  if(semAno){
    tbody.innerHTML = '';
    emptyHint.hidden = false;
    emptyHint.textContent = 'Nenhum ano selecionado ainda.';
    return;
  }
  const projetos = Store.projetosDoAno(ctx.anoId);
  if(projetos.length===0){
    tbody.innerHTML = '';
    emptyHint.hidden = false;
    emptyHint.textContent = 'Nenhum projeto cadastrado neste ano ainda. Use o formulário acima para criar o primeiro.';
    return;
  }
  emptyHint.hidden = true;
  tbody.innerHTML = projetos.map(p=>{
    const membros = mes => Store.colaboradoresNoMes(ctx.anoId, mes, p.id).totalColaboradores;
    const numMembros = ctx.mes==='ano' ? membros(new Date().getMonth()+1) : membros(ctx.mes);
    const gasto = metrica(Store.gastoTotal, p.id);
    const ganho = metrica(Store.ganho, p.id);
    const saldo = ganho - gasto;
    return `<tr>
      <td><span class="color-dot" style="background:${p.cor}"></span></td>
      <td><button class="link-btn" data-action="abrir-projeto" data-id="${p.id}">${escapeHtml(p.nome)}</button></td>
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
  }).join('');
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
  el('detalheSubtitle').textContent = `${periodoProjetoLabel(projeto)} · Resumo ${periodoTexto()}.`;

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
  renderGanhosProjeto(projeto);
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
  info.textContent = `Percentual de envolvimento de cada colaborador em "${projeto.nome}" durante ${MESES_LONGO[ctx.mes-1]}.`;

  const colaboradores = Store.data.colaboradores;
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

// ---------------------------------------------------------------------------
// Eventos: Colaboradores
// ---------------------------------------------------------------------------
el('formColaborador').addEventListener('submit', e=>{
  e.preventDefault();
  Store.salvarColaborador({
    id: el('colabId').value || null,
    nome: el('colabNome').value.trim(),
    cargo: el('colabCargo').value.trim(),
    custoMensal: el('colabCusto').value
  });
  toast('Colaborador salvo.');
  resetFormColaborador();
  renderColaboradores();
});

el('btnColabCancel').addEventListener('click', resetFormColaborador);

function resetFormColaborador(){
  el('colabId').value = '';
  el('formColaborador').reset();
  el('btnColabSubmit').textContent = 'Adicionar colaborador';
  el('btnColabCancel').hidden = true;
}

document.querySelector('#page-colaboradores').addEventListener('click', e=>{
  const btn = e.target.closest('button[data-action]');
  if(!btn) return;
  const { action, id } = btn.dataset;
  if(action==='editar-colab'){
    const c = Store.data.colaboradores.find(x=>x.id===id);
    el('colabId').value = c.id;
    el('colabNome').value = c.nome;
    el('colabCargo').value = c.cargo;
    el('colabCusto').value = c.custoMensal;
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
// Eventos: Projetos (lista)
// ---------------------------------------------------------------------------
function syncProjMesFim(){
  el('wrapProjMesFim').style.display = el('projEmAndamento').checked ? 'none' : '';
}
el('projEmAndamento').addEventListener('change', syncProjMesFim);
syncProjMesFim();

el('formProjeto').addEventListener('submit', e=>{
  e.preventDefault();
  const anoObj = Store.getAno(el('projAno').value);
  if(!anoObj){ toast('Selecione o ano do projeto.'); return; }

  const idEditando = el('projId').value;
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
    nome: el('projNome').value.trim(),
    anoId: anoObj.id,
    mesInicio: el('projMesInicio').value,
    mesFim: el('projMesFim').value,
    emAndamento: el('projEmAndamento').checked
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
  el('projAno').disabled = false;
  el('projEmAndamento').checked = true;
  syncProjMesFim();
  el('btnProjSubmit').textContent = 'Adicionar projeto';
  el('btnProjCancel').hidden = true;
}

document.querySelector('#page-projetos').addEventListener('click', e=>{
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
    el('projAno').value = p.anoId;    el('projMesInicio').value = p.mesInicio || 1;
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
  Store.setAlocacao(ctx.anoId, ctx.mes, input.dataset.colab, projeto.id, input.value);
  atualizarLinhaMembro(input.dataset.colab);
});

el('btnCopiarMesAnteriorProjeto').addEventListener('click', ()=>{
  if(!ctx.anoId || ctx.mes==='ano'){ toast('Selecione um mês específico primeiro.'); return; }
  const res = Store.copiarAlocacaoProjetoMesAnterior(ctx.anoId, projetoDetalheId, ctx.mes);
  if(!res.ok){ toast(res.msg); return; }
  toast('Percentuais copiados do mês anterior.');
  renderMembrosProjeto(Store.getProjeto(projetoDetalheId));
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
  Store.salvarGanho({
    id: el('pganhoId').value || null,
    anoId: ctx.anoId,
    projetoId: projeto.id,
    tipo: el('pganhoTipo').value,
    mesInicio: el('pganhoMesInicio').value,
    mesFim: el('pganhoMesFim').value,
    descricao: el('pganhoDescricao').value.trim(),
    valor: el('pganhoValor').value
  });
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
el('btnExport').addEventListener('click', ()=>{
  const blob = new Blob([Store.exportJSON()], { type:'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `painel-roi-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

el('importFile').addEventListener('change', e=>{
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = ()=>{
    try{
      Store.importJSON(reader.result);
      ctx.anoId = Store.data.activeAnoId;
      toast('Backup importado com sucesso.');
      renderContextBar();
      setPage('dashboard');
    }catch(err){
      toast('Não foi possível ler esse arquivo.');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
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
