/* ==========================================================================
   store.js
   Camada de dados: agora fala com o Supabase (banco compartilhado, sem
   login) em vez do localStorage. Nenhuma manipulação de DOM acontece aqui.

   COMO FUNCIONA:
   - Store.data é uma cópia em memória de tudo, carregada uma vez no início
     (Store.load(), que é assíncrona) — é nela que o resto do app lê e
     escreve, então tudo continua rápido e síncrono como antes.
   - Toda função que CRIA/EDITA/REMOVE algo faz duas coisas: (1) atualiza
     Store.data na hora, pra tela responder instantaneamente; e (2) dispara,
     em segundo plano, a chamada correspondente ao Supabase pra persistir de
     verdade. Se essa chamada falhar (sem internet, etc.), aparece um toast
     avisando — mas a tela já tinha atualizado, então é bom recarregar a
     página se isso acontecer, pra garantir que ficou tudo sincronizado.
   - Isso significa que os dados são COMPARTILHADOS: qualquer pessoa que
     abrir o site vê (e pode editar) os mesmos dados que todo mundo.
   ========================================================================== */

// ---------------------------------------------------------------------------
// CONFIGURAÇÃO — cole aqui a URL e a chave "anon public" do seu projeto
// Supabase (em Project Settings → API).
// ---------------------------------------------------------------------------
const SUPABASE_URL = 'https://afhznrrpowqxmyhmsclq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFmaHpucnJwb3dxeG15aG1zY2xxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3MzM0MjksImV4cCI6MjEwMDMwOTQyOX0.s-pF26RQ4cZHwMNnhnC_LITPpq_J0cMQDJt0_j4Kk3k';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const MESES_LONGO = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

const PROJECT_COLORS = ['#2C6E8F','#B5762B','#5B7A3A','#8A4B7A','#3A6B6B','#A2472F','#5A5FA6','#7A8A2C'];
const ANO_BASE = 2020;

function uid(){
  return Date.now().toString(36) + Math.random().toString(36).slice(2,8);
}

function avisarErro(acao, err){
  console.error(`Erro ao ${acao}:`, err);
  if(typeof toast === 'function'){
    toast(`Não foi possível ${acao}. Verifique sua internet e recarregue a página.`);
  }
}

function defaultData(){
  return {
    anos: [],
    colaboradores: [],
    cargos: [],
    projetos: [],
    alocacoes: [],
    salariosPontuais: [],
    mudancasCargo: [],
    ganhos: [],
    gastosExtras: [],
    confirmacoes: [],
    activeAnoId: null
  };
}

// ---------------------------------------------------------------------------
// Conversão entre as colunas do banco (snake_case) e os objetos que o app
// usa (camelCase).
// ---------------------------------------------------------------------------
function anoFromRow(r){ return { id:r.id, ano:r.ano }; }
function anoToRow(a){ return { id:a.id, ano:a.ano }; }

function cargoFromRow(r){ return { id:r.id, nome:r.nome, salario:Number(r.salario) }; }
function cargoToRow(c){ return { id:c.id, nome:c.nome, salario:c.salario }; }

function colaboradorFromRow(r){
  return {
    id:r.id, nome:r.nome, cargo:r.cargo, custoMensal:Number(r.custo_mensal),
    entradaAnoId:r.entrada_ano_id, entradaMes:r.entrada_mes,
    ativo:r.ativo, saidaAnoId:r.saida_ano_id, saidaMes:r.saida_mes
  };
}
function colaboradorToRow(c){
  return {
    id:c.id, nome:c.nome, cargo:c.cargo, custo_mensal:c.custoMensal,
    entrada_ano_id:c.entradaAnoId||null, entrada_mes:c.entradaMes,
    ativo:c.ativo, saida_ano_id:c.saidaAnoId||null, saida_mes:c.saidaMes
  };
}

function projetoFromRow(r){
  const p = {
    id:r.id, nome:r.nome, anoId:r.ano_id, cor:r.cor, mesInicio:r.mes_inicio,
    emAndamento:r.em_andamento, mesFim:r.mes_fim, tipo:r.tipo
  };
  if(r.renovado_de_id) p.renovadoDeId = r.renovado_de_id;
  if(r.renovado_para_id) p.renovadoParaId = r.renovado_para_id;
  if(r.torna_impacto_ano_id) p.tornaImpactoAnoId = r.torna_impacto_ano_id;
  if(r.torna_impacto_mes) p.tornaImpactoMes = r.torna_impacto_mes;
  return p;
}
function projetoToRow(p){
  return {
    id:p.id, nome:p.nome, ano_id:p.anoId, cor:p.cor, mes_inicio:p.mesInicio,
    em_andamento:p.emAndamento, mes_fim:p.mesFim, tipo:p.tipo,
    renovado_de_id:p.renovadoDeId||null, renovado_para_id:p.renovadoParaId||null,
    torna_impacto_ano_id:p.tornaImpactoAnoId||null, torna_impacto_mes:p.tornaImpactoMes||null
  };
}

function alocacaoFromRow(r){
  return { id:r.id, anoId:r.ano_id, mes:r.mes, colaboradorId:r.colaborador_id, projetoId:r.projeto_id, percentual:Number(r.percentual) };
}
function alocacaoToRow(a){
  return { id:a.id, ano_id:a.anoId, mes:a.mes, colaborador_id:a.colaboradorId, projeto_id:a.projetoId, percentual:a.percentual };
}

function salarioPontualFromRow(r){
  return { id:r.id, colaboradorId:r.colaborador_id, anoId:r.ano_id, mes:r.mes, valor:Number(r.valor) };
}
function salarioPontualToRow(s){
  return { id:s.id, colaborador_id:s.colaboradorId, ano_id:s.anoId, mes:s.mes, valor:s.valor };
}

function mudancaCargoFromRow(r){
  return { id:r.id, colaboradorId:r.colaborador_id, anoId:r.ano_id, mes:r.mes, cargo:r.cargo, salario: (r.salario===null||r.salario===undefined) ? null : Number(r.salario) };
}
function mudancaCargoToRow(m){
  return { id:m.id, colaborador_id:m.colaboradorId, ano_id:m.anoId, mes:m.mes, cargo:m.cargo, salario:m.salario };
}

function lancamentoFromRow(r){
  return { id:r.id, anoId:r.ano_id, projetoId:r.projeto_id||null, tipo:r.tipo, mesInicio:r.mes_inicio, mesFim:r.mes_fim, descricao:r.descricao||'', valor:Number(r.valor) };
}
function lancamentoToRow(l){
  return { id:l.id, ano_id:l.anoId, projeto_id:l.projetoId||null, tipo:l.tipo, mes_inicio:l.mesInicio, mes_fim:l.mesFim, descricao:l.descricao||'', valor:l.valor };
}

function confirmacaoFromRow(r){
  return { id:r.id, colaboradorId:r.colaborador_id, anoId:r.ano_id, mes:r.mes, confirmadoEm:r.confirmado_em };
}
function confirmacaoToRow(c){
  return { id:c.id, colaborador_id:c.colaboradorId, ano_id:c.anoId, mes:c.mes, confirmado_em:c.confirmadoEm };
}

const Store = {
  data: null,
  _storageOk: true,

  async load(){
    this.data = defaultData();
    try{
      const [anosR, cargosR, colabR, projR, alocR, salPontR, mudCargoR, ganhosR, gastosR, confR] = await Promise.all([
        sb.from('anos').select('*'),
        sb.from('cargos').select('*'),
        sb.from('colaboradores').select('*'),
        sb.from('projetos').select('*'),
        sb.from('alocacoes').select('*'),
        sb.from('salarios_pontuais').select('*'),
        sb.from('mudancas_cargo').select('*'),
        sb.from('ganhos').select('*'),
        sb.from('gastos_extras').select('*'),
        sb.from('confirmacoes').select('*'),
      ]);
      const primeiroErro = [anosR, cargosR, colabR, projR, alocR, salPontR, mudCargoR, ganhosR, gastosR, confR].find(r=>r.error);
      if(primeiroErro) throw primeiroErro.error;

      this.data.anos = anosR.data.map(anoFromRow).sort((a,b)=>a.ano-b.ano);
      this.data.cargos = cargosR.data.map(cargoFromRow).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
      this.data.colaboradores = colabR.data.map(colaboradorFromRow);
      this.data.projetos = projR.data.map(projetoFromRow);
      this.data.alocacoes = alocR.data.map(alocacaoFromRow);
      this.data.salariosPontuais = salPontR.data.map(salarioPontualFromRow);
      this.data.mudancasCargo = mudCargoR.data.map(mudancaCargoFromRow);
      this.data.ganhos = ganhosR.data.map(lancamentoFromRow);
      this.data.gastosExtras = gastosR.data.map(lancamentoFromRow);
      this.data.confirmacoes = confR.data.map(confirmacaoFromRow);
      this._storageOk = true;
    }catch(e){
      console.error('Não foi possível carregar os dados do Supabase.', e);
      this._storageOk = false;
    }

    await this.garantirAnosPadrao();

    const anoAtualNum = new Date().getFullYear();
    let ativoSalvo = null;
    try{ ativoSalvo = localStorage.getItem('roi_ano_ativo_local'); }catch(e){}
    if(ativoSalvo && this.data.anos.some(a=>a.id===ativoSalvo)){
      this.data.activeAnoId = ativoSalvo;
    }else{
      const atual = this.data.anos.find(a=>a.ano===anoAtualNum);
      this.data.activeAnoId = (atual || this.data.anos[this.data.anos.length-1])?.id || null;
    }
    return this.data;
  },

  async garantirAnosPadrao(){
    const anoAtual = new Date().getFullYear();
    const faltantes = [];
    for(let a = ANO_BASE; a <= anoAtual; a++){
      if(!this.data.anos.some(x=>x.ano===a)){
        const novo = { id: uid(), ano: a };
        this.data.anos.push(novo);
        faltantes.push(novo);
      }
    }
    this.data.anos.sort((a,b)=>a.ano-b.ano);
    if(faltantes.length){
      try{
        const { error } = await sb.from('anos').insert(faltantes.map(anoToRow));
        if(error) throw error;
      }catch(e){ avisarErro('criar os anos padrão', e); }
    }
  },

  exportJSON(){
    return JSON.stringify(this.data, null, 2);
  },

  async importJSON(json){
    const parsed = JSON.parse(json);
    const tabelas = ['gastos_extras','ganhos','mudancas_cargo','salarios_pontuais','alocacoes','projetos','colaboradores','cargos','anos'];
    for(const t of tabelas){
      const { error } = await sb.from(t).delete().not('id', 'is', null);
      if(error) throw error;
    }
    const ordem = [
      ['anos', parsed.anos||[], anoToRow],
      ['cargos', parsed.cargos||[], cargoToRow],
      ['colaboradores', parsed.colaboradores||[], colaboradorToRow],
      ['projetos', parsed.projetos||[], projetoToRow],
      ['alocacoes', parsed.alocacoes||[], alocacaoToRow],
      ['salarios_pontuais', parsed.salariosPontuais||[], salarioPontualToRow],
      ['mudancas_cargo', parsed.mudancasCargo||[], mudancaCargoToRow],
      ['ganhos', parsed.ganhos||[], lancamentoToRow],
      ['gastos_extras', parsed.gastosExtras||[], lancamentoToRow],
    ];
    for(const [tabela, linhas, toRow] of ordem){
      if(linhas.length===0) continue;
      const { error } = await sb.from(tabela).insert(linhas.map(toRow));
      if(error) throw error;
    }
    await this.load();
  },

  // ---------------- Anos ----------------
  criarAno(ano){
    ano = parseInt(ano, 10);
    if(this.data.anos.some(a => a.ano === ano)) return { ok:false, msg:'Esse ano já existe.' };
    const novo = { id: uid(), ano };
    this.data.anos.push(novo);
    this.data.anos.sort((a,b)=>a.ano-b.ano);
    if(!this.data.activeAnoId) this.data.activeAnoId = novo.id;
    sb.from('anos').insert(anoToRow(novo)).then(({error})=>{ if(error) avisarErro('criar o ano', error); });
    return { ok:true, ano: novo };
  },

  getAnoPorNumero(anoNum){
    return this.data.anos.find(a=>a.ano===parseInt(anoNum,10));
  },

  removerAno(anoId){
    this.data.anos = this.data.anos.filter(a=>a.id!==anoId);
    this.data.projetos = this.data.projetos.filter(p=>p.anoId!==anoId);
    this.data.alocacoes = this.data.alocacoes.filter(a=>a.anoId!==anoId);
    this.data.ganhos = this.data.ganhos.filter(a=>a.anoId!==anoId);
    this.data.gastosExtras = this.data.gastosExtras.filter(a=>a.anoId!==anoId);
    if(this.data.activeAnoId===anoId){
      this.data.activeAnoId = this.data.anos[0]?.id || null;
    }
    sb.from('anos').delete().eq('id', anoId).then(({error})=>{ if(error) avisarErro('excluir o ano', error); });
  },

  getAno(id){ return this.data.anos.find(a=>a.id===id); },
  getAnoAtivo(){ return this.getAno(this.data.activeAnoId); },

  setAnoAtivo(id){
    this.data.activeAnoId = id;
    try{ localStorage.setItem('roi_ano_ativo_local', id || ''); }catch(e){}
  },

  // ---------------- Cargos ----------------
  criarCargo(nome, salario){
    nome = (nome||'').trim();
    if(!nome) return { ok:false, msg:'Informe o nome do cargo.' };
    if(this.data.cargos.some(c => c.nome.toLowerCase() === nome.toLowerCase())){
      return { ok:false, msg:'Esse cargo já existe.' };
    }
    const novo = { id: uid(), nome, salario: parseFloat(salario) || 0 };
    this.data.cargos.push(novo);
    this.data.cargos.sort((a,b)=>a.nome.localeCompare(b.nome, 'pt-BR'));
    sb.from('cargos').insert(cargoToRow(novo)).then(({error})=>{ if(error) avisarErro('criar o cargo', error); });
    return { ok:true, cargo: novo };
  },

  salvarCargo({id, nome, salario}){
    nome = (nome||'').trim();
    salario = parseFloat(salario) || 0;
    const c = this.data.cargos.find(x=>x.id===id);
    if(c){ c.nome = nome; c.salario = salario; }
    this.data.cargos.sort((a,b)=>a.nome.localeCompare(b.nome, 'pt-BR'));
    sb.from('cargos').update({ nome, salario }).eq('id', id).then(({error})=>{ if(error) avisarErro('salvar o cargo', error); });
  },

  removerCargo(id){
    this.data.cargos = this.data.cargos.filter(c=>c.id!==id);
    sb.from('cargos').delete().eq('id', id).then(({error})=>{ if(error) avisarErro('remover o cargo', error); });
  },

  getCargo(id){ return this.data.cargos.find(c=>c.id===id); },

  colaboradoresPorCargo(nomeCargo){
    return this.data.colaboradores.filter(c => c.cargo === nomeCargo).length;
  },

  // ---------------- Colaboradores ----------------
  salvarColaborador({id, nome, cargo, custoMensal, entradaAnoId, entradaMes, ativo, saidaAnoId, saidaMes}){
    custoMensal = parseFloat(custoMensal) || 0;
    entradaAnoId = entradaAnoId || null;
    entradaMes = entradaAnoId ? (parseInt(entradaMes,10) || 1) : null;
    ativo = ativo !== false;
    saidaAnoId = ativo ? null : (saidaAnoId || null);
    saidaMes = (!ativo && saidaAnoId) ? (parseInt(saidaMes,10) || 12) : null;
    let registro;
    if(id){
      const c = this.data.colaboradores.find(x=>x.id===id);
      if(c){
        c.nome=nome; c.cargo=cargo; c.custoMensal=custoMensal;
        c.entradaAnoId=entradaAnoId; c.entradaMes=entradaMes;
        c.ativo=ativo; c.saidaAnoId=saidaAnoId; c.saidaMes=saidaMes;
        registro = c;
      }
    }else{
      registro = { id: uid(), nome, cargo, custoMensal, entradaAnoId, entradaMes, ativo, saidaAnoId, saidaMes };
      this.data.colaboradores.push(registro);
    }
    if(registro){
      sb.from('colaboradores').upsert(colaboradorToRow(registro)).then(({error})=>{ if(error) avisarErro('salvar o colaborador', error); });
    }
  },

  colaboradorJaSaiu(colaborador, anoNum, mes){
    if(colaborador.ativo !== false) return false;
    if(!colaborador.saidaAnoId) return false;
    const anoSaida = this.getAno(colaborador.saidaAnoId);
    if(!anoSaida) return false;
    if(anoNum !== anoSaida.ano) return anoNum > anoSaida.ano;
    return mes > (colaborador.saidaMes || 12);
  },

  colaboradorJaEntrou(colaborador, anoNum, mes){
    if(!colaborador.entradaAnoId) return true;
    const anoEntrada = this.getAno(colaborador.entradaAnoId);
    if(!anoEntrada) return true;
    if(anoNum !== anoEntrada.ano) return anoNum > anoEntrada.ano;
    return mes >= (colaborador.entradaMes || 1);
  },

  removerColaborador(id){
    this.data.colaboradores = this.data.colaboradores.filter(c=>c.id!==id);
    this.data.alocacoes = this.data.alocacoes.filter(a=>a.colaboradorId!==id);
    this.data.salariosPontuais = this.data.salariosPontuais.filter(s=>s.colaboradorId!==id);
    this.data.mudancasCargo = this.data.mudancasCargo.filter(m=>m.colaboradorId!==id);
    sb.from('colaboradores').delete().eq('id', id).then(({error})=>{ if(error) avisarErro('remover o colaborador', error); });
  },

  // ---------------- Confirmação de preenchimento mensal ----------------
  getConfirmacao(colaboradorId, anoId, mes){
    return this.data.confirmacoes.find(c=>
      c.colaboradorId===colaboradorId && c.anoId===anoId && c.mes===mes);
  },

  confirmarPreenchimento(colaboradorId, anoId, mes){
    const reg = this.getConfirmacao(colaboradorId, anoId, mes);
    const agora = new Date().toISOString();
    let registro;
    if(reg){ reg.confirmadoEm = agora; registro = reg; }
    else{ registro = { id: uid(), colaboradorId, anoId, mes, confirmadoEm: agora }; this.data.confirmacoes.push(registro); }
    sb.from('confirmacoes').upsert(confirmacaoToRow(registro), { onConflict: 'colaborador_id,ano_id,mes' })
      .then(({error})=>{ if(error) avisarErro('registrar a confirmação', error); });
    return registro;
  },

  // ---------------- Projetos ----------------
  salvarProjeto({id, nome, anoId, mesInicio, mesFim, emAndamento, tipo, tornaImpactoAnoId, tornaImpactoMes}){
    let registro;
    if(id){
      const p = this.data.projetos.find(x=>x.id===id);
      if(p){
        p.nome = nome;
        if(anoId) p.anoId = anoId;
        if(mesInicio !== undefined) p.mesInicio = parseInt(mesInicio,10);
        p.emAndamento = !!emAndamento;
        p.mesFim = p.emAndamento ? null : parseInt(mesFim,10);
        if(tipo) p.tipo = tipo;
        // só o tipo Estrutural usa isso; qualquer outro tipo não tem
        // conversão agendada — limpa se o tipo mudou pra outra coisa.
        if(tipo === 'estrutural' && tornaImpactoAnoId){
          p.tornaImpactoAnoId = tornaImpactoAnoId;
          p.tornaImpactoMes = parseInt(tornaImpactoMes,10) || 1;
        }else{
          delete p.tornaImpactoAnoId;
          delete p.tornaImpactoMes;
        }
        registro = p;
      }
    }else{
      const cor = PROJECT_COLORS[this.data.projetos.length % PROJECT_COLORS.length];
      registro = {
        id: uid(), nome, anoId, cor,
        mesInicio: parseInt(mesInicio,10) || 1,
        emAndamento: !!emAndamento,
        mesFim: emAndamento ? null : (parseInt(mesFim,10) || 12),
        tipo: tipo || 'impacto'
      };
      if(tipo === 'estrutural' && tornaImpactoAnoId){
        registro.tornaImpactoAnoId = tornaImpactoAnoId;
        registro.tornaImpactoMes = parseInt(tornaImpactoMes,10) || 1;
      }
      this.data.projetos.push(registro);
    }
    if(registro){
      sb.from('projetos').upsert(projetoToRow(registro)).then(({error})=>{ if(error) avisarErro('salvar o projeto', error); });
    }
  },

  renovarProjeto(projetoId){
    const original = this.getProjeto(projetoId);
    if(!original) return { ok:false, msg:'Projeto não encontrado.' };
    if(original.renovadoParaId) return { ok:false, msg:'Esse projeto já foi continuado num ano seguinte.' };
    const anoAtual = this.getAno(original.anoId);
    if(!anoAtual) return { ok:false, msg:'Ano do projeto não encontrado.' };

    const proximoAnoNum = anoAtual.ano + 1;
    let proximoAno = this.getAnoPorNumero(proximoAnoNum);
    if(!proximoAno){
      const res = this.criarAno(proximoAnoNum);
      if(!res.ok) return res;
      proximoAno = res.ano;
    }

    const novo = {
      id: uid(),
      nome: original.nome,
      anoId: proximoAno.id,
      cor: original.cor,
      mesInicio: 1,
      emAndamento: true,
      mesFim: null,
      tipo: original.tipo || 'impacto',
      renovadoDeId: original.id
    };
    this.data.projetos.push(novo);
    original.renovadoParaId = novo.id;

    sb.from('projetos').insert(projetoToRow(novo)).then(({error})=>{ if(error) avisarErro('criar a continuação do projeto', error); });
    sb.from('projetos').update({ renovado_para_id: novo.id }).eq('id', original.id).then(({error})=>{ if(error) avisarErro('atualizar o projeto original', error); });

    return { ok:true, projeto: novo };
  },

  contarRegistrosDoProjetoNoAno(projetoId, anoId){
    return this.data.alocacoes.filter(a=>a.projetoId===projetoId && a.anoId===anoId).length
      + this.data.ganhos.filter(g=>g.projetoId===projetoId && g.anoId===anoId).length
      + this.data.gastosExtras.filter(g=>g.projetoId===projetoId && g.anoId===anoId).length;
  },
  projetosDoAno(anoId){
    return this.data.projetos.filter(p=>p.anoId===anoId);
  },

  getProjeto(id){ return this.data.projetos.find(p=>p.id===id); },

  removerProjeto(id){
    this.data.projetos = this.data.projetos.filter(p=>p.id!==id);
    this.data.projetos.forEach(p=>{
      if(p.renovadoDeId===id) delete p.renovadoDeId;
      if(p.renovadoParaId===id) delete p.renovadoParaId;
    });
    this.data.alocacoes = this.data.alocacoes.filter(a=>a.projetoId!==id);
    this.data.ganhos = this.data.ganhos.filter(g=>g.projetoId!==id);
    this.data.gastosExtras = this.data.gastosExtras.filter(g=>g.projetoId!==id);
    sb.from('projetos').delete().eq('id', id).then(({error})=>{ if(error) avisarErro('remover o projeto', error); });
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
      if(reg){
        this.data.alocacoes = this.data.alocacoes.filter(a=>a!==reg);
        sb.from('alocacoes').delete().eq('id', reg.id).then(({error})=>{ if(error) avisarErro('remover a alocação', error); });
      }
      return { ok:true };
    }
    const totalOutrosProjetos = this.totalAlocadoColaborador(anoId, mes, colaboradorId) - (reg ? reg.percentual : 0);
    if(totalOutrosProjetos + percentual > 100.001){
      const disponivel = Math.max(0, 100 - totalOutrosProjetos);
      return { ok:false, msg:`Isso passaria de 100%. Esse colaborador já tem ${totalOutrosProjetos}% em outros projetos neste mês (sobram ${disponivel}%).` };
    }
    let registro;
    if(reg){ reg.percentual = percentual; registro = reg; }
    else{ registro = { id:uid(), anoId, mes, colaboradorId, projetoId, percentual }; this.data.alocacoes.push(registro); }
    sb.from('alocacoes').upsert(alocacaoToRow(registro)).then(({error})=>{ if(error) avisarErro('salvar a alocação', error); });
    return { ok:true };
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
    const removidos = this.data.alocacoes.filter(a=>a.anoId===anoId && a.mes===mesDestino && a.projetoId===projetoId);
    this.data.alocacoes = this.data.alocacoes.filter(a=>!(a.anoId===anoId && a.mes===mesDestino && a.projetoId===projetoId));
    const novos = origem.map(a=>({ id:uid(), anoId, mes:mesDestino, colaboradorId:a.colaboradorId, projetoId, percentual:a.percentual }));
    this.data.alocacoes.push(...novos);

    (async ()=>{
      try{
        if(removidos.length) await sb.from('alocacoes').delete().in('id', removidos.map(r=>r.id));
        if(novos.length) await sb.from('alocacoes').insert(novos.map(alocacaoToRow));
      }catch(e){ avisarErro('copiar as alocações do mês anterior', e); }
    })();

    return { ok:true };
  },

  copiarAlocacaoColaboradorMesAnterior(anoId, colaboradorId, mesDestino){
    const mesOrigem = mesDestino - 1;
    if(mesOrigem < 1) return { ok:false, msg:'Não há mês anterior dentro do ano.' };
    const origem = this.data.alocacoes.filter(a=>a.anoId===anoId && a.mes===mesOrigem && a.colaboradorId===colaboradorId);
    if(origem.length===0) return { ok:false, msg:'O mês anterior está vazio para este colaborador.' };
    const removidos = this.data.alocacoes.filter(a=>a.anoId===anoId && a.mes===mesDestino && a.colaboradorId===colaboradorId);
    this.data.alocacoes = this.data.alocacoes.filter(a=>!(a.anoId===anoId && a.mes===mesDestino && a.colaboradorId===colaboradorId));
    const novos = origem.map(a=>({ id:uid(), anoId, mes:mesDestino, colaboradorId, projetoId:a.projetoId, percentual:a.percentual }));
    this.data.alocacoes.push(...novos);

    (async ()=>{
      try{
        if(removidos.length) await sb.from('alocacoes').delete().in('id', removidos.map(r=>r.id));
        if(novos.length) await sb.from('alocacoes').insert(novos.map(alocacaoToRow));
      }catch(e){ avisarErro('copiar as alocações do mês anterior', e); }
    })();

    return { ok:true };
  },

  // ---------------- Ganhos / Gastos extras ----------------
  _salvarLancamento(colecao, tabela, campos){
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
    sb.from(tabela).upsert(lancamentoToRow(registro)).then(({error})=>{ if(error) avisarErro('salvar o lançamento', error); });
    return registro;
  },

  salvarGanho(campos){
    if(campos.projetoId){
      const p = this.data.projetos.find(x=>x.id===campos.projetoId);
      if(p){
        const anoNum = this.getAno(campos.anoId)?.ano;
        const tipoEfetivo = this.tipoEfetivoProjeto(p.id, anoNum, parseInt(campos.mesInicio,10));
        if(tipoEfetivo === 'cultura') return { ok:false, msg:'Projetos de Cultura não têm ganhos — só gastos.' };
        if(tipoEfetivo === 'estrutural') return { ok:false, msg:'Este projeto ainda é Estrutural neste mês — só tem ganhos a partir do mês em que virar Impacto.' };
      }
    }
    return this._salvarLancamento('ganhos', 'ganhos', campos);
  },
  salvarGastoExtra(campos){ return this._salvarLancamento('gastosExtras', 'gastos_extras', campos); },

  removerGanho(id){
    this.data.ganhos = this.data.ganhos.filter(g=>g.id!==id);
    sb.from('ganhos').delete().eq('id', id).then(({error})=>{ if(error) avisarErro('remover o ganho', error); });
  },
  removerGastoExtra(id){
    this.data.gastosExtras = this.data.gastosExtras.filter(g=>g.id!==id);
    sb.from('gastos_extras').delete().eq('id', id).then(({error})=>{ if(error) avisarErro('remover o gasto', error); });
  },

  _lancamentoAplicaNoMes(l, mes){
    if(l.tipo==='pontual') return l.mesInicio === mes;
    return mes >= l.mesInicio && mes <= l.mesFim;
  },

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

  // ---------------- Cálculos agregados (tudo local, sem rede) ----------------

  getSalarioPontual(colaboradorId, anoId, mes){
    return this.data.salariosPontuais.find(s=>
      s.colaboradorId===colaboradorId && s.anoId===anoId && s.mes===mes);
  },

  setSalarioPontual(colaboradorId, anoId, mes, valor){
    const reg = this.getSalarioPontual(colaboradorId, anoId, mes);
    valor = valor==='' || valor===null || valor===undefined ? null : parseFloat(valor);
    if(valor===null || isNaN(valor)){
      if(reg){
        this.data.salariosPontuais = this.data.salariosPontuais.filter(s=>s!==reg);
        sb.from('salarios_pontuais').delete().eq('id', reg.id).then(({error})=>{ if(error) avisarErro('remover o ajuste de salário', error); });
      }
    }else if(reg){
      reg.valor = valor;
      sb.from('salarios_pontuais').update({ valor }).eq('id', reg.id).then(({error})=>{ if(error) avisarErro('salvar o ajuste de salário', error); });
    }else{
      const novo = { id:uid(), colaboradorId, anoId, mes, valor };
      this.data.salariosPontuais.push(novo);
      sb.from('salarios_pontuais').insert(salarioPontualToRow(novo)).then(({error})=>{ if(error) avisarErro('salvar o ajuste de salário', error); });
    }
  },

  custoMensalEfetivo(colaboradorId, anoId, mes){
    const colab = this.data.colaboradores.find(c=>c.id===colaboradorId);
    if(!colab) return 0;
    const ajuste = this.getSalarioPontual(colaboradorId, anoId, mes);
    if(ajuste) return ajuste.valor;
    return this.salarioBaseEfetivo(colaboradorId, anoId, mes);
  },

  _chaveAnoMes(anoId, mes){
    const ano = this.getAno(anoId)?.ano || 0;
    return ano*12 + mes;
  },

  getMudancaCargo(colaboradorId, anoId, mes){
    return this.data.mudancasCargo.find(m=>
      m.colaboradorId===colaboradorId && m.anoId===anoId && m.mes===mes);
  },

  setMudancaCargo(colaboradorId, anoId, mes, cargo, salario){
    const reg = this.getMudancaCargo(colaboradorId, anoId, mes);
    cargo = (cargo || '').trim();
    salario = (salario==='' || salario===null || salario===undefined) ? null : parseFloat(salario);
    if(salario!==null && isNaN(salario)) salario = null;
    if(!cargo){
      if(reg){
        this.data.mudancasCargo = this.data.mudancasCargo.filter(m=>m!==reg);
        sb.from('mudancas_cargo').delete().eq('id', reg.id).then(({error})=>{ if(error) avisarErro('remover a mudança de cargo', error); });
      }
    }else if(reg){
      reg.cargo = cargo; reg.salario = salario;
      sb.from('mudancas_cargo').update({ cargo, salario }).eq('id', reg.id).then(({error})=>{ if(error) avisarErro('salvar a mudança de cargo', error); });
    }else{
      const novo = { id:uid(), colaboradorId, anoId, mes, cargo, salario };
      this.data.mudancasCargo.push(novo);
      sb.from('mudancas_cargo').insert(mudancaCargoToRow(novo)).then(({error})=>{ if(error) avisarErro('salvar a mudança de cargo', error); });
    }
  },

  _mudancaCargoVigente(colaboradorId, anoId, mes){
    const alvo = this._chaveAnoMes(anoId, mes);
    const candidatas = this.data.mudancasCargo
      .filter(m=>m.colaboradorId===colaboradorId)
      .map(m=>({ ...m, chave: this._chaveAnoMes(m.anoId, m.mes) }))
      .filter(m=>m.chave <= alvo)
      .sort((a,b)=>b.chave-a.chave);
    return candidatas[0] || null;
  },

  cargoEfetivo(colaboradorId, anoId, mes){
    const colab = this.data.colaboradores.find(c=>c.id===colaboradorId);
    if(!colab) return '';
    const vigente = this._mudancaCargoVigente(colaboradorId, anoId, mes);
    return vigente ? vigente.cargo : colab.cargo;
  },

  salarioBaseEfetivo(colaboradorId, anoId, mes){
    const colab = this.data.colaboradores.find(c=>c.id===colaboradorId);
    if(!colab) return 0;
    const vigente = this._mudancaCargoVigente(colaboradorId, anoId, mes);
    return (vigente && vigente.salario!==null && vigente.salario!==undefined) ? vigente.salario : colab.custoMensal;
  },

  custoFolhaColaborador(anoId, mes, colaboradorId, projetoFiltro){
    const colab = this.data.colaboradores.find(c=>c.id===colaboradorId);
    if(!colab) return 0;
    const custoBase = this.custoMensalEfetivo(colaboradorId, anoId, mes);
    const alocs = this.getAlocacoesDoMes(anoId, mes).filter(a=>a.colaboradorId===colaboradorId
      && this._matchProjeto(a.projetoId, projetoFiltro));
    const pct = alocs.reduce((s,a)=>s+a.percentual,0);
    return custoBase * (pct/100);
  },

  _projetoEhCultura(projetoId){
    if(!projetoId) return false;
    const p = this.data.projetos.find(x=>x.id===projetoId);
    return !!(p && (p.tipo||'impacto')==='cultura');
  },

  // Tipo "de verdade" de um projeto num (ano, mês) específico. Só importa
  // pra projetos Estruturais: eles começam sem contar em nada (igual
  // Cultura), mas podem ter uma conversão agendada pra "Impacto" a partir
  // de um mês — a partir dali, o tipo efetivo já é 'impacto'. Se nunca foi
  // agendado (ou o projeto simplesmente terminou antes), continua
  // 'estrutural' pra sempre. Cultura e Impacto não têm essa conversão —
  // o tipo deles é sempre o mesmo, fixo.
  tipoEfetivoProjeto(projetoId, anoNum, mes){
    const p = this.data.projetos.find(x=>x.id===projetoId);
    if(!p) return 'impacto';
    const tipoBase = p.tipo || 'impacto';
    if(tipoBase !== 'estrutural') return tipoBase;
    if(!p.tornaImpactoAnoId) return 'estrutural';
    const anoConv = this.getAno(p.tornaImpactoAnoId)?.ano;
    if(anoConv===undefined || anoNum===undefined) return 'estrutural';
    const chaveAlvo = anoNum*12 + mes;
    const chaveConv = anoConv*12 + (p.tornaImpactoMes||1);
    return chaveAlvo >= chaveConv ? 'impacto' : 'estrutural';
  },

  // Diz se o gasto de um projeto deve contar nos totais agregados (Gasto
  // total, Saldo, ROI) num (ano, mês) — só conta se o tipo EFETIVO ali for
  // Impacto. Cultura nunca conta; Estrutural só conta depois de converter.
  _projetoContaComoImpacto(projetoId, anoId, mes){
    if(!projetoId) return true; // "Geral" (sem projeto) sempre conta
    const anoNum = this.getAno(anoId)?.ano;
    return this.tipoEfetivoProjeto(projetoId, anoNum, mes) === 'impacto';
  },

  gastoFolha(anoId, mes, projetoFiltro, semCultura){
    const alocs = this.getAlocacoesDoMes(anoId, mes)
      .filter(a=> this._matchProjeto(a.projetoId, projetoFiltro))
      .filter(a=> !semCultura || this._projetoContaComoImpacto(a.projetoId, anoId, mes));
    return alocs.reduce((sum, a)=>{
      const colab = this.data.colaboradores.find(c=>c.id===a.colaboradorId);
      if(!colab) return sum;
      const custoBase = this.custoMensalEfetivo(a.colaboradorId, anoId, mes);
      return sum + custoBase * (a.percentual/100);
    }, 0);
  },

  gastoExtra(anoId, mes, projetoFiltro, semCultura){
    return this.data.gastosExtras
      .filter(l => l.anoId===anoId && this._lancamentoAplicaNoMes(l, mes) && this._matchProjeto(l.projetoId, projetoFiltro))
      .filter(l => !semCultura || this._projetoContaComoImpacto(l.projetoId, anoId, mes))
      .reduce((s,l)=>s+l.valor, 0);
  },
  ganho(anoId, mes, projetoFiltro){ return this._somaLancamentos('ganhos', anoId, mes, projetoFiltro); },

  gastoTotal(anoId, mes, projetoFiltro, semCultura){
    return this.gastoFolha(anoId, mes, projetoFiltro, semCultura) + this.gastoExtra(anoId, mes, projetoFiltro, semCultura);
  },

  ehMesFuturo(anoId, mes){
    const anoObj = this.getAno(anoId);
    if(!anoObj) return false;
    const anoReal = new Date().getFullYear();
    const mesReal = new Date().getMonth() + 1;
    if(anoObj.ano !== anoReal) return anoObj.ano > anoReal;
    return mes > mesReal;
  },

  gastoFolhaProjetado(anoId, mesAlvo, projetoFiltro, semCultura){
    const anoObj = this.getAno(anoId);
    if(!anoObj) return 0;
    const anoReal = new Date().getFullYear();
    const mesReal = new Date().getMonth() + 1;
    const mesBase = (anoObj.ano === anoReal) ? mesReal : 12;
    const alocsBase = this.getAlocacoesDoMes(anoId, mesBase)
      .filter(a=> this._matchProjeto(a.projetoId, projetoFiltro))
      .filter(a=> !semCultura || this._projetoContaComoImpacto(a.projetoId, anoId, mesAlvo));
    return alocsBase.reduce((sum, a)=>{
      const colab = this.data.colaboradores.find(c=>c.id===a.colaboradorId);
      if(!colab) return sum;
      if(this.colaboradorJaSaiu(colab, anoObj.ano, mesAlvo)) return sum;
      const custoEfetivo = this.custoMensalEfetivo(a.colaboradorId, anoId, mesAlvo);
      return sum + custoEfetivo * (a.percentual/100);
    }, 0);
  },

  gastoTotalComPrevisao(anoId, mes, projetoFiltro, semCultura){
    if(this.ehMesFuturo(anoId, mes)){
      return this.gastoFolhaProjetado(anoId, mes, projetoFiltro, semCultura) + this.gastoExtra(anoId, mes, projetoFiltro, semCultura);
    }
    return this.gastoTotal(anoId, mes, projetoFiltro, semCultura);
  },

  gastoTotalParaRoi(anoId, mes, projetoFiltro){
    return this.gastoTotalComPrevisao(anoId, mes, projetoFiltro, true);
  },

  saldo(anoId, mes, projetoFiltro){
    return this.ganho(anoId, mes, projetoFiltro) - this.gastoTotal(anoId, mes, projetoFiltro);
  },

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
        cargoEfetivo: this.cargoEfetivo(colab.id, anoId, mes),
        custo: this.custoMensalEfetivo(colab.id, anoId, mes) * (a.percentual/100)
      });
    });
    return { linhas, totalColaboradores: vistos.size };
  },

  periodoColaboradorNoProjeto(anoId, colaboradorId, projetoId){
    const meses = this.data.alocacoes
      .filter(a=>a.anoId===anoId && a.colaboradorId===colaboradorId && a.projetoId===projetoId && a.percentual>0)
      .map(a=>a.mes);
    if(meses.length===0) return null;
    return { min: Math.min(...meses), max: Math.max(...meses) };
  },

  projetosDoColaborador(anoId, colaboradorId){
    return this.data.projetos
      .filter(p=>p.anoId===anoId)
      .map(p=>({ projeto:p, periodo: this.periodoColaboradorNoProjeto(anoId, colaboradorId, p.id) }))
      .filter(x=>x.periodo);
  }
};