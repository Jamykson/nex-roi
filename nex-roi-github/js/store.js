/* ==========================================================================
   store.js
   Camada de dados: persistência (localStorage) + regras de cálculo.
   Nenhuma manipulação de DOM acontece aqui — só dados.
   ========================================================================== */

const STORAGE_KEY = 'roi_dashboard_v1';

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const MESES_LONGO = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

const PROJECT_COLORS = ['#2C6E8F','#B5762B','#5B7A3A','#8A4B7A','#3A6B6B','#A2472F','#5A5FA6','#7A8A2C'];

function uid(){
  return Date.now().toString(36) + Math.random().toString(36).slice(2,8);
}

function defaultData(){
  return {
    anos: [],
    colaboradores: [],
    projetos: [],
    alocacoes: [],     // {id, anoId, mes, colaboradorId, projetoId, percentual}
    ganhos: [],        // {id, anoId, projetoId|null, tipo, mesInicio, mesFim, descricao, valor}
    gastosExtras: [],  // idem ganhos
    activeAnoId: null
  };
}

const Store = {
  data: null,
  _storageOk: true,

  load(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      // testa escrita de verdade — alguns ambientes (ex.: preview de artefato)
      // permitem leitura mas bloqueiam escrita, e só descobriríamos isso depois
      const probeKey = STORAGE_KEY + '__probe__';
      localStorage.setItem(probeKey, '1');
      localStorage.removeItem(probeKey);
      this.data = raw ? JSON.parse(raw) : defaultData();
      this._storageOk = true;
    }catch(e){
      console.warn('localStorage indisponível neste ambiente — os dados vão funcionar só durante esta sessão.', e);
      this._storageOk = false;
      this.data = defaultData();
    }
    // saneamento: garante todas as chaves existem (útil após updates do app)
    const base = defaultData();
    for(const k in base){
      if(!(k in this.data)) this.data[k] = base[k];
    }
    return this.data;
  },

  // Nunca deixa uma falha de armazenamento (ex.: localStorage bloqueado dentro de
  // um preview de artefato) interromper o restante do código que chamou save() —
  // isso já causou telas que "não atualizavam" depois de cadastrar algo.
  save(){
    try{
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
      this._storageOk = true;
    }catch(e){
      if(this._storageOk) console.warn('Não foi possível salvar (localStorage indisponível). Os dados continuam funcionando nesta sessão, mas não persistem após recarregar a página.', e);
      this._storageOk = false;
    }
  },

  exportJSON(){
    return JSON.stringify(this.data, null, 2);
  },

  importJSON(json){
    const parsed = JSON.parse(json);
    this.data = parsed;
    this.save();
  },

  // ---------------- Anos ----------------
  criarAno(ano){
    ano = parseInt(ano, 10);
    if(this.data.anos.some(a => a.ano === ano)) return { ok:false, msg:'Esse ano já existe.' };
    const novo = { id: uid(), ano };
    this.data.anos.push(novo);
    this.data.anos.sort((a,b)=>a.ano-b.ano);
    if(!this.data.activeAnoId) this.data.activeAnoId = novo.id;
    this.save();
    return { ok:true, ano: novo };
  },

  removerAno(anoId){
    const projetosDoAno = this.data.projetos.filter(p=>p.anoId===anoId).map(p=>p.id);
    this.data.anos = this.data.anos.filter(a=>a.id!==anoId);
    this.data.projetos = this.data.projetos.filter(p=>p.anoId!==anoId);
    this.data.alocacoes = this.data.alocacoes.filter(a=>a.anoId!==anoId);
    this.data.ganhos = this.data.ganhos.filter(a=>a.anoId!==anoId);
    this.data.gastosExtras = this.data.gastosExtras.filter(a=>a.anoId!==anoId);
    if(this.data.activeAnoId===anoId){
      this.data.activeAnoId = this.data.anos[0]?.id || null;
    }
    this.save();
  },

  getAno(id){ return this.data.anos.find(a=>a.id===id); },
  getAnoAtivo(){ return this.getAno(this.data.activeAnoId); },

  setAnoAtivo(id){
    this.data.activeAnoId = id;
    this.save();
  },

  // ---------------- Colaboradores ----------------
  salvarColaborador({id, nome, cargo, custoMensal}){
    custoMensal = parseFloat(custoMensal) || 0;
    if(id){
      const c = this.data.colaboradores.find(x=>x.id===id);
      if(c){ c.nome=nome; c.cargo=cargo; c.custoMensal=custoMensal; }
    }else{
      this.data.colaboradores.push({ id: uid(), nome, cargo, custoMensal });
    }
    this.save();
  },

  removerColaborador(id){
    this.data.colaboradores = this.data.colaboradores.filter(c=>c.id!==id);
    this.data.alocacoes = this.data.alocacoes.filter(a=>a.colaboradorId!==id);
    this.save();
  },

  // ---------------- Projetos (pertencem a um ano) ----------------
  salvarProjeto({id, nome, anoId}){
    if(id){
      const p = this.data.projetos.find(x=>x.id===id);
      if(p) p.nome = nome;
    }else{
      const cor = PROJECT_COLORS[this.data.projetos.length % PROJECT_COLORS.length];
      this.data.projetos.push({ id: uid(), nome, anoId, cor });
    }
    this.save();
  },

  projetosDoAno(anoId){
    return this.data.projetos.filter(p=>p.anoId===anoId);
  },

  getProjeto(id){ return this.data.projetos.find(p=>p.id===id); },

  removerProjeto(id){
    this.data.projetos = this.data.projetos.filter(p=>p.id!==id);
    this.data.alocacoes = this.data.alocacoes.filter(a=>a.projetoId!==id);
    this.data.ganhos = this.data.ganhos.filter(g=>g.projetoId!==id);
    this.data.gastosExtras = this.data.gastosExtras.filter(g=>g.projetoId!==id);
    this.save();
  },

  // ---------------- Alocação mensal ----------------
  getAlocacao(anoId, mes, colaboradorId, projetoId){
    return this.data.alocacoes.find(a=>
      a.anoId===anoId && a.mes===mes && a.colaboradorId===colaboradorId && a.projetoId===projetoId);
  },

  setAlocacao(anoId, mes, colaboradorId, projetoId, percentual){
    percentual = parseFloat(percentual);
    let reg = this.getAlocacao(anoId, mes, colaboradorId, projetoId);
    if(!percentual || percentual<=0){
      if(reg) this.data.alocacoes = this.data.alocacoes.filter(a=>a!==reg);
    }else{
      if(reg){ reg.percentual = percentual; }
      else{ this.data.alocacoes.push({ id:uid(), anoId, mes, colaboradorId, projetoId, percentual }); }
    }
    this.save();
  },

  getAlocacoesDoMes(anoId, mes){
    return this.data.alocacoes.filter(a=>a.anoId===anoId && a.mes===mes);
  },

  totalAlocadoColaborador(anoId, mes, colaboradorId){
    return this.getAlocacoesDoMes(anoId, mes)
      .filter(a=>a.colaboradorId===colaboradorId)
      .reduce((s,a)=>s+a.percentual, 0);
  },

  copiarAlocacaoProjetoMesAnterior(anoId, projetoId, mesDestino){
    const mesOrigem = mesDestino - 1;
    if(mesOrigem < 1) return { ok:false, msg:'Não há mês anterior dentro do ano.' };
    const origem = this.data.alocacoes.filter(a=>a.anoId===anoId && a.mes===mesOrigem && a.projetoId===projetoId);
    if(origem.length===0) return { ok:false, msg:'O mês anterior está vazio neste projeto.' };
    this.data.alocacoes = this.data.alocacoes.filter(a=>!(a.anoId===anoId && a.mes===mesDestino && a.projetoId===projetoId));
    origem.forEach(a=>{
      this.data.alocacoes.push({ id:uid(), anoId, mes:mesDestino, colaboradorId:a.colaboradorId, projetoId, percentual:a.percentual });
    });
    this.save();
    return { ok:true };
  },

  // ---------------- Ganhos / Gastos extras (mesma forma) ----------------
  _salvarLancamento(colecao, campos){
    const { id, projetoId, tipo, mesInicio, mesFim, descricao, valor, anoId } = campos;
    const registro = {
      id: id || uid(),
      anoId,
      projetoId: projetoId || null,
      tipo,
      mesInicio: parseInt(mesInicio,10),
      mesFim: tipo==='mensal' ? (mesFim ? parseInt(mesFim,10) : 12) : parseInt(mesInicio,10),
      descricao: descricao || '',
      valor: parseFloat(valor) || 0
    };
    if(id){
      const idx = this.data[colecao].findIndex(x=>x.id===id);
      if(idx>-1) this.data[colecao][idx] = registro;
    }else{
      this.data[colecao].push(registro);
    }
    this.save();
    return registro;
  },

  salvarGanho(campos){ return this._salvarLancamento('ganhos', campos); },
  salvarGastoExtra(campos){ return this._salvarLancamento('gastosExtras', campos); },

  removerGanho(id){ this.data.ganhos = this.data.ganhos.filter(g=>g.id!==id); this.save(); },
  removerGastoExtra(id){ this.data.gastosExtras = this.data.gastosExtras.filter(g=>g.id!==id); this.save(); },

  // Um lançamento (ganho/gasto) "acontece" no mês m se for pontual no mesmo mês,
  // ou mensal dentro do intervalo [mesInicio, mesFim].
  _lancamentoAplicaNoMes(l, mes){
    if(l.tipo==='pontual') return l.mesInicio === mes;
    return mes >= l.mesInicio && mes <= l.mesFim;
  },

  // Compara o projeto de um registro com um filtro:
  //  - undefined ou 'ALL'  -> não filtra (considera todos os registros)
  //  - null ou 'GERAL'     -> só registros sem projeto (gerais da empresa)
  //  - um id                -> só registros daquele projeto
  _matchProjeto(valorProjetoId, filtro){
    if(filtro===undefined || filtro==='ALL') return true;
    if(filtro===null || filtro==='GERAL') return valorProjetoId===null;
    return valorProjetoId===filtro;
  },

  _somaLancamentos(colecao, anoId, mes, projetoFiltro){
    return this.data[colecao]
      .filter(l => l.anoId===anoId
        && this._lancamentoAplicaNoMes(l, mes)
        && this._matchProjeto(l.projetoId, projetoFiltro))
      .reduce((s,l)=>s+l.valor, 0);
  },

  // ---------------- Cálculos agregados ----------------

  // custo de folha de um colaborador em um mês, opcionalmente restrito a um projeto
  custoFolhaColaborador(anoId, mes, colaboradorId, projetoFiltro){
    const colab = this.data.colaboradores.find(c=>c.id===colaboradorId);
    if(!colab) return 0;
    const alocs = this.getAlocacoesDoMes(anoId, mes).filter(a=>a.colaboradorId===colaboradorId
      && this._matchProjeto(a.projetoId, projetoFiltro));
    const pct = alocs.reduce((s,a)=>s+a.percentual,0);
    return colab.custoMensal * (pct/100);
  },

  // gasto de folha total (todos colaboradores) em um mês, opcionalmente por projeto
  gastoFolha(anoId, mes, projetoFiltro){
    const alocs = this.getAlocacoesDoMes(anoId, mes).filter(a=> this._matchProjeto(a.projetoId, projetoFiltro));
    return alocs.reduce((sum, a)=>{
      const colab = this.data.colaboradores.find(c=>c.id===a.colaboradorId);
      if(!colab) return sum;
      return sum + colab.custoMensal * (a.percentual/100);
    }, 0);
  },

  gastoExtra(anoId, mes, projetoFiltro){ return this._somaLancamentos('gastosExtras', anoId, mes, projetoFiltro); },
  ganho(anoId, mes, projetoFiltro){ return this._somaLancamentos('ganhos', anoId, mes, projetoFiltro); },

  gastoTotal(anoId, mes, projetoFiltro){
    return this.gastoFolha(anoId, mes, projetoFiltro) + this.gastoExtra(anoId, mes, projetoFiltro);
  },

  saldo(anoId, mes, projetoFiltro){
    return this.ganho(anoId, mes, projetoFiltro) - this.gastoTotal(anoId, mes, projetoFiltro);
  },

  // soma ao longo de vários meses (usado quando "mês" selecionado = ano todo)
  agregarAno(anoId, projetoFiltro, fn){
    let total = 0;
    for(let m=1;m<=12;m++) total += fn.call(this, anoId, m, projetoFiltro);
    return total;
  },

  colaboradoresNoMes(anoId, mes, projetoFiltro){
    const alocs = this.getAlocacoesDoMes(anoId, mes).filter(a=> this._matchProjeto(a.projetoId, projetoFiltro));
    const vistos = new Set();
    const linhas = [];
    alocs.forEach(a=>{
      const colab = this.data.colaboradores.find(c=>c.id===a.colaboradorId);
      const proj = this.data.projetos.find(p=>p.id===a.projetoId);
      if(!colab) return;
      vistos.add(colab.id);
      linhas.push({
        colaborador: colab,
        projeto: proj,
        percentual: a.percentual,
        custo: colab.custoMensal * (a.percentual/100)
      });
    });
    return { linhas, totalColaboradores: vistos.size };
  }
};
