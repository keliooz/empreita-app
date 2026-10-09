import { formatarNumero, formatarReais as r, reais } from '@/core/dinheiro';
import { etapasQuitadas } from '@/core/etapas';
import { extrairValor, interpretarLancamento, categorizar, extrairDescricao } from '@/core/mensagem';
import { calcularOrcamento } from '@/core/orcamento';
import { chaveComTipo, classificarChavePix, descreverChave, type ChavePix } from '@/core/pix';
import { SERVICOS, type ServicoId } from '@/core/servicos';
import { formatarTelefoneBR, linkWhatsApp, mesmoTelefone, normalizarTelefoneBR } from '@/core/telefone';
import { lerNumero, nomeProprio, normalizar } from '@/core/texto';
import type { Profissional, Sessao } from '@/db/schema';
import * as repo from './repo';
import * as t from './textos';
import type { Contexto, MensagemEntrada } from './tipos';

type Responder = (texto: string) => Promise<void>;

interface Turno {
  ctx: Contexto;
  msg: MensagemEntrada;
  prof: Profissional;
  responder: Responder;
}

/** Ponto de entrada: recebe uma mensagem do profissional e responde pelo canal. */
export async function processarMensagem(ctx: Contexto, msg: MensagemEntrada): Promise<void> {
  const { db, canal } = ctx;
  if (!(await repo.registrarMensagem(db, msg.id))) return;
  const responder: Responder = (texto) => canal.enviarTexto(msg.de, texto);

  if (ctx.testadores && !ctx.testadores.some((n) => mesmoTelefone(n, msg.de))) {
    await responder('Oi! A Empreita está em teste fechado com poucos profissionais. Avisamos por aqui quando abrir para todo mundo.');
    return;
  }

  let prof = await repo.buscarProfissional(db, msg.de);
  if (!prof) {
    prof = await repo.criarProfissional(db, msg.de);
    const sugestao = msg.nomePerfil?.trim() ? nomeProprio(msg.nomePerfil).slice(0, 60) : null;
    await repo.salvarSessao(db, msg.de, 'cadastro', 'nome', sugestao ? { sugestao } : {});
    await responder(
      [
        'Olá! Eu sou a *Empreita*. Organizo orçamento, gastos, lucro e cobrança das suas obras aqui no WhatsApp.',
        '',
        sugestao ? `Posso te chamar de *${sugestao}*? Mande *sim* ou escreva seu nome.` : 'Para começar, qual é o seu nome?',
      ].join('\n'),
    );
    return;
  }

  const turno: Turno = { ctx, msg, prof, responder };
  const sessao = await repo.lerSessao(db, msg.de);

  if (msg.tipo === 'outro') {
    await responder('Por enquanto eu entendo mensagens de texto e fotos de nota. Mande *menu* para ver o que eu faço.');
    return;
  }

  const n = msg.tipo === 'texto' ? normalizar(msg.texto) : '';

  if (/^(cancelar|cancela|sair|parar)$/.test(n)) {
    if (sessao?.fluxo === 'cadastro' && !prof.nome) {
      await responder('Preciso só do seu nome para começar. Como posso te chamar?');
      return;
    }
    await repo.limparSessao(db, msg.de);
    await responder('Pronto, cancelei. Mande *menu* para ver o que eu faço.');
    return;
  }

  if (msg.tipo === 'imagem') {
    if (sessao?.fluxo === 'cadastro' || sessao?.fluxo === 'orcamento') {
      await responder('Não guardei essa foto porque tem uma pergunta em aberto. Responda a pergunta ou mande *cancelar*, e depois mande a foto da nota de novo.');
      return;
    }
    await receberFoto(turno, msg.mediaId, msg.legenda);
    return;
  }

  const texto = msg.texto.trim();
  if (sessao?.fluxo) {
    await continuarFluxo(turno, sessao, texto);
    return;
  }
  await comando(turno, texto, n);
}

/* ====================== Comandos soltos ====================== */

async function comando(tu: Turno, texto: string, n: string) {
  const { ctx, prof, responder } = tu;
  const { db } = ctx;

  if (/^(menu|ajuda|oi+|ola|bom dia|boa tarde|boa noite|e ai|eai|opa|comandos|\?)$/.test(n)) {
    await responder(t.menu(prof.nome));
    return;
  }
  if (/^((novo|fazer|criar) )?(orcamento|orcar)$|^nova obra$/.test(n)) {
    await iniciarOrcamento(tu);
    return;
  }
  if (/^(obras|minhas obras|lista|listar obras)$/.test(n)) {
    await responder(t.listaObrasTexto(await repo.listarObras(db, prof.id), prof.obraAtivaId));
    return;
  }
  const trocar = n.match(/^obra\s*(?:n|no|numero)?\s*(\d+)$/);
  if (trocar?.[1]) {
    const obra = await repo.obraPorNumero(db, prof.id, Number(trocar[1]));
    if (!obra) {
      await responder(`Não achei a obra ${trocar[1]}. Mande *obras* para ver a lista.`);
      return;
    }
    await repo.atualizarProfissional(db, prof.id, { obraAtivaId: obra.id });
    await responder(`Obra ativa agora: *${t.rotuloObra(obra)}* (${t.numeroObra(obra)}). Os lançamentos caem nela.`);
    return;
  }
  if (/^pix\b/.test(n)) {
    const resto = texto.replace(/^\s*pix\s*:?\s*/i, '').trim();
    if (!resto) {
      await repo.salvarSessao(db, prof.waId, 'pix', 'chave', {});
      await responder(
        `${prof.pixChave ? `Sua chave hoje: ${descreverChave({ tipo: prof.pixTipo as ChavePix['tipo'], chave: prof.pixChave })}.\n` : ''}Qual é a sua chave Pix? Pode ser CPF, CNPJ, celular, e-mail ou chave aleatória.`,
      );
      return;
    }
    await tratarChavePix(tu, resto, 'pix', null);
    return;
  }

  const fone = texto.match(/^\s*telefone(?:\s+do\s+cliente)?\s*:?\s*(.+)$/i);
  if (fone?.[1]) {
    const obra = await exigirObra(tu);
    if (!obra) return;
    const numero = normalizarTelefoneBR(fone[1]);
    if (!numero) {
      await responder('Não entendi o número. Mande assim: *telefone do cliente 62 99999-0000*');
      return;
    }
    await repo.atualizarTelefoneCliente(db, obra.id, numero);
    await responder(`Telefone de ${obra.clienteNome} salvo: ${formatarTelefoneBR(numero)}.`);
    return;
  }

  // A partir daqui todos os comandos usam a obra ativa.
  if (/^(resumo|lucro|saldo|situacao|como esta a obra|como ta a obra)$/.test(n)) {
    const obra = await exigirObra(tu);
    if (!obra) return;
    const c = (await repo.carregarObra(db, obra.id))!;
    await responder(t.resumoTexto(c.obra, c.resumo));
    return;
  }
  if (/^(extrato|lancamentos|gastos|ultimos lancamentos)$/.test(n)) {
    const obra = await exigirObra(tu);
    if (!obra) return;
    await responder(t.extratoTexto(obra, await repo.ultimosLancamentos(db, obra.id, 10)));
    return;
  }
  if (/^(desfazer|apagar ultimo|apaga o ultimo|errei)$/.test(n)) {
    const obra = await exigirObra(tu);
    if (!obra) return;
    const apagado = await repo.desfazerUltimo(db, obra.id);
    if (!apagado) {
      await responder('Não há lançamento para apagar nessa obra.');
      return;
    }
    const c = (await repo.carregarObra(db, obra.id))!;
    await responder(`Apaguei: ${apagado.descricao}, ${r(apagado.valor)}.\n${t.linhaLucro(c.resumo)}`);
    return;
  }
  if (/^(cobrar|cobranca|cobrar cliente|cobrar o cliente)$/.test(n)) {
    await cobrar(tu);
    return;
  }
  if (/^(fechou|fechado|aprovado|aprovou|cliente aprovou|fechei)$/.test(n)) {
    const obra = await exigirObra(tu);
    if (!obra) return;
    await repo.atualizarStatusObra(db, obra.id, 'em_andamento');
    await responder(`Boa! *${t.rotuloObra(obra)}* agora está em andamento. Mande *cobrar* para pedir a entrada.`);
    return;
  }
  if (/^(concluir|concluida|terminei|obra concluida|entreguei|finalizar)$/.test(n)) {
    const obra = await exigirObra(tu);
    if (!obra) return;
    await repo.atualizarStatusObra(db, obra.id, 'concluida');
    const c = (await repo.carregarObra(db, obra.id))!;
    await responder(
      [`Obra *${t.rotuloObra(obra)}* concluída.`, t.linhaLucro(c.resumo), c.resumo.faltaReceber > 0 ? `Ainda falta receber ${r(c.resumo.faltaReceber)}. Mande *cobrar*.` : 'Tudo recebido.']
        .join('\n'),
    );
    return;
  }
  if (/^(link|pdf|reenviar|reenviar orcamento|mandar orcamento)$/.test(n)) {
    const obra = await exigirObra(tu);
    if (!obra) return;
    await enviarOrcamento(tu, obra.id, false);
    return;
  }

  await lancar(tu, texto);
}

async function exigirObra(tu: Turno) {
  const obra = await repo.obraAtiva(tu.ctx.db, tu.prof);
  if (!obra) await tu.responder('Você ainda não tem uma obra ativa. Mande *orçamento* para criar a primeira.');
  return obra;
}

/* ====================== Lançamentos ====================== */

async function lancar(tu: Turno, texto: string) {
  const { ctx, responder } = tu;
  const leitura = interpretarLancamento(texto);
  if (leitura.tipo === 'sem_valor') {
    await responder('Não entendi. Para lançar um gasto, mande o valor e o que foi, por exemplo: *150 diária ajudante*.\nMande *menu* para ver tudo o que eu faço.');
    return;
  }
  const obra = await exigirObra(tu);
  if (!obra) return;

  await repo.inserirLancamento(ctx.db, obra.id, {
    natureza: leitura.natureza,
    categoria: leitura.natureza === 'gasto' ? leitura.categoria : null,
    descricao: leitura.descricao,
    valor: leitura.valor,
  });
  const c = (await repo.carregarObra(ctx.db, obra.id))!;

  if (leitura.natureza === 'gasto') {
    await responder(`Lançado em *${leitura.categoria}*: ${leitura.descricao}, ${r(leitura.valor)}.\n${t.linhaLucro(c.resumo)}`);
    return;
  }

  const linhas = [`Recebimento de *${r(leitura.valor)}* lançado (${leitura.descricao.toLowerCase()}).`];
  for (const e of etapasQuitadas(c.etapas, c.resumo.recebido - leitura.valor, c.resumo.recebido)) {
    linhas.push(`Etapa *${e.nome}* quitada.`);
  }
  linhas.push(c.resumo.faltaReceber > 0 ? `Falta receber ${r(c.resumo.faltaReceber)}.` : 'A obra está toda paga.');
  if (c.obra.status === 'orcamento') {
    await repo.atualizarStatusObra(ctx.db, obra.id, 'em_andamento');
    linhas.push('Marquei a obra como em andamento.');
  }
  await responder(linhas.join('\n'));
}

async function receberFoto(tu: Turno, mediaId: string, legenda?: string) {
  const { ctx, prof, responder } = tu;
  const obra = await exigirObra(tu);
  if (!obra) return;
  const valor = legenda ? extrairValor(legenda) : null;
  if (valor) {
    await lancarNota(tu, obra.id, mediaId, valor, legenda ?? '');
    return;
  }
  await repo.salvarSessao(ctx.db, prof.waId, 'foto', 'valor', { mediaId, obraId: obra.id });
  await responder(`Recebi a nota para *${t.rotuloObra(obra)}*. Qual é o valor total dela?`);
}

async function lancarNota(tu: Turno, obraId: string, mediaId: string, valor: number, texto: string) {
  const { ctx, responder } = tu;
  const n = normalizar(texto);
  const cat = n ? categorizar(n) : 'Material';
  const categoria = cat === 'Outros' ? 'Material' : cat;
  const descricao = extrairDescricao(texto) || 'Nota da loja';
  await repo.inserirLancamento(ctx.db, obraId, { natureza: 'gasto', categoria, descricao, valor, origem: 'foto', mediaId });
  const c = (await repo.carregarObra(ctx.db, obraId))!;
  await responder(`Nota lançada em *${categoria}*: ${descricao}, ${r(valor)}.\n${t.linhaLucro(c.resumo)}`);
}

/* ====================== Cobrança ====================== */

async function cobrar(tu: Turno) {
  const { ctx, prof, responder } = tu;
  const obra = await exigirObra(tu);
  if (!obra) return;
  const c = (await repo.carregarObra(ctx.db, obra.id))!;
  const proxima = c.resumo.proxima;
  if (!proxima) {
    await responder(`*${t.rotuloObra(obra)}* está toda paga. ${t.linhaLucro(c.resumo)}`);
    return;
  }
  const link = `${ctx.appUrl}/o/${obra.token}`;
  const paraCliente = t.mensagemCobranca(obra, prof, proxima, link);
  await responder(t.instrucaoCobranca(obra, proxima, paraCliente, Boolean(prof.pixChave)));
  await responder(paraCliente);
}

/* ====================== Fluxos guiados ====================== */

async function continuarFluxo(tu: Turno, sessao: Sessao, texto: string) {
  switch (sessao.fluxo) {
    case 'cadastro':
      return fluxoCadastro(tu, sessao, texto);
    case 'pix':
      return tratarChavePix(tu, texto, 'pix', sessao);
    case 'orcamento':
      return fluxoOrcamento(tu, sessao, texto);
    case 'foto':
      return fluxoFoto(tu, sessao, texto);
    default:
      await repo.limparSessao(tu.ctx.db, tu.prof.waId);
      return comando(tu, texto, normalizar(texto));
  }
}

async function fluxoCadastro(tu: Turno, sessao: Sessao, texto: string) {
  const { ctx, prof, responder } = tu;
  const db = ctx.db;
  const n = normalizar(texto);

  if (sessao.passo === 'nome') {
    const sugestao = typeof sessao.dados.sugestao === 'string' ? sessao.dados.sugestao : null;
    const nome = sugestao && /^(sim|s|pode|isso|ok|claro)$/.test(n) ? sugestao : nomeProprio(texto).slice(0, 60);
    if (nome.length < 2 || /\d/.test(nome)) {
      await responder('Me diga só o seu nome, por favor.');
      return;
    }
    await repo.atualizarProfissional(db, prof.id, { nome });
    await repo.salvarSessao(db, prof.waId, 'cadastro', 'cidade', {});
    await responder(`Prazer, ${nome.split(' ')[0]}! Em que cidade você trabalha?`);
    return;
  }
  if (sessao.passo === 'cidade') {
    const cidade = nomeProprio(texto).slice(0, 40);
    if (cidade.length < 2) {
      await responder('Qual é a sua cidade?');
      return;
    }
    await repo.atualizarProfissional(db, prof.id, { cidade });
    await repo.salvarSessao(db, prof.waId, 'cadastro', 'chave', {});
    await responder('Qual é a sua chave Pix? Ela vai junto nas cobranças para o cliente pagar mais rápido.\nSe preferir cadastrar depois, mande *depois*.');
    return;
  }
  return tratarChavePix(tu, texto, 'cadastro', sessao);
}

/** Recebe a chave Pix (no cadastro ou no comando *pix*), resolvendo a dúvida CPF x celular quando precisa. */
async function tratarChavePix(tu: Turno, texto: string, fluxo: 'cadastro' | 'pix', sessao: Sessao | null) {
  const { ctx, prof, responder } = tu;
  const db = ctx.db;
  const n = normalizar(texto);

  const concluir = async (chave: ChavePix | null) => {
    if (chave) await repo.atualizarProfissional(db, prof.id, { pixTipo: chave.tipo, pixChave: chave.chave });
    await repo.limparSessao(db, prof.waId);
    if (fluxo === 'cadastro') {
      const atualizado = (await repo.buscarProfissional(db, prof.waId))!;
      await responder(
        [chave ? `Chave Pix salva: ${descreverChave(chave)}.` : 'Sem problema, depois é só mandar *pix*.', '', 'Tudo pronto!', t.menu(atualizado.nome?.split(' ')[0])].join('\n'),
      );
    } else {
      await responder(chave ? `Chave Pix salva: ${descreverChave(chave)}.` : 'Ok, mantive como estava.');
    }
  };

  if (sessao?.passo === 'tipo') {
    const digitos = String(sessao.dados.digitos ?? '');
    const tipo = /^(1|cpf)$/.test(n) ? 'cpf' : /^(2|celular|cel|telefone|fone)$/.test(n) ? 'celular' : null;
    if (!tipo) {
      await responder('Mande *1* se for CPF ou *2* se for celular.');
      return;
    }
    const chave = chaveComTipo(digitos, tipo);
    if (!chave) {
      await responder('Esse número não fecha como chave desse tipo. Mande a chave de novo.');
      await repo.salvarSessao(db, prof.waId, fluxo, 'chave', {});
      return;
    }
    await concluir(chave);
    return;
  }

  if (/^(depois|pular|agora nao|nao)$/.test(n)) {
    await concluir(null);
    return;
  }
  const res = classificarChavePix(texto);
  if (res.ok) {
    await concluir(res.chave);
    return;
  }
  if (res.motivo === 'ambigua') {
    await repo.salvarSessao(db, prof.waId, fluxo, 'tipo', { digitos: res.digitos });
    await responder('Esse número é o seu *CPF* ou o seu *celular*? Mande *1* para CPF ou *2* para celular.');
    return;
  }
  await repo.salvarSessao(db, prof.waId, fluxo, 'chave', {});
  await responder('Não reconheci essa chave. Pode ser CPF, CNPJ, celular com DDD, e-mail ou chave aleatória. Tente de novo ou mande *depois*.');
}

async function fluxoFoto(tu: Turno, sessao: Sessao, texto: string) {
  const { ctx, prof, responder } = tu;
  const valor = extrairValor(texto);
  if (!valor) {
    await responder('Não achei o valor. Mande só o número, por exemplo *89,90*. Ou mande *cancelar*.');
    return;
  }
  const obraId = String(sessao.dados.obraId ?? '');
  const mediaId = String(sessao.dados.mediaId ?? '');
  await repo.limparSessao(ctx.db, prof.waId);
  await lancarNota(tu, obraId, mediaId, valor, texto);
}

/* ---------- Orçamento guiado ---------- */

interface RascunhoOrcamento {
  servico?: ServicoId;
  descricao?: string;
  area?: number;
  precoM2?: number;
  materialPorConta?: boolean;
  cliente?: string;
  telefone?: string | null;
}

const PERGUNTA_SERVICO = [
  'Vamos montar o orçamento. Qual é o serviço?',
  '1. Assentamento de piso',
  '2. Pintura de parede',
  '3. Alvenaria de bloco',
  '4. Outro serviço',
].join('\n');

async function iniciarOrcamento(tu: Turno) {
  await repo.salvarSessao(tu.ctx.db, tu.prof.waId, 'orcamento', 'servico', {});
  await tu.responder(PERGUNTA_SERVICO);
}

function lerServico(n: string): ServicoId | null {
  if (/^1$|piso|porcelanato|ceramica/.test(n)) return 'piso';
  if (/^2$|pint/.test(n)) return 'pintura';
  if (/^3$|alvenaria|bloco|tijolo|levantar parede|muro/.test(n)) return 'alvenaria';
  if (/^4$|outro/.test(n)) return 'outro';
  return null;
}

async function perguntar(tu: Turno, passo: string, dados: RascunhoOrcamento, texto: string) {
  await repo.salvarSessao(tu.ctx.db, tu.prof.waId, 'orcamento', passo, dados as Record<string, unknown>);
  await tu.responder(texto);
}

function perguntaPreco(d: RascunhoOrcamento): string {
  if (d.servico === 'outro' && d.area === 1) return 'Qual é o valor total da mão de obra?';
  const sugestao = SERVICOS[d.servico ?? 'outro'].maoDeObraPadraoM2;
  return d.servico === 'outro'
    ? 'Quanto você cobra de mão de obra por m²?'
    : `Quanto você cobra de mão de obra por m²? Média de referência: ${r(sugestao)}.\nMande o valor ou *ok* para usar a referência.`;
}

async function fluxoOrcamento(tu: Turno, sessao: Sessao, texto: string) {
  const d = sessao.dados as RascunhoOrcamento;
  const n = normalizar(texto);

  switch (sessao.passo) {
    case 'servico': {
      const servico = lerServico(n);
      if (!servico) return tu.responder(`Mande o número do serviço.\n\n${PERGUNTA_SERVICO.split('\n').slice(1).join('\n')}`);
      d.servico = servico;
      if (servico === 'outro') return perguntar(tu, 'descricao', d, 'Descreva o serviço em poucas palavras. Exemplo: *reboco da fachada*');
      return perguntar(tu, 'area', d, 'Qual é a área em m²?');
    }
    case 'descricao': {
      const desc = texto.trim().replace(/\s+/g, ' ').slice(0, 60);
      if (desc.length < 3) return tu.responder('Descreva o serviço em poucas palavras.');
      d.descricao = desc.charAt(0).toUpperCase() + desc.slice(1);
      return perguntar(tu, 'area', d, 'Qual é a medida em m²?\nSe o serviço não for cobrado por metro, mande *1* e na próxima pergunta coloque o valor total.');
    }
    case 'area': {
      const area = lerNumero(n);
      if (!area || area <= 0 || area > 10000) return tu.responder('Mande só o número da área em m². Exemplo: *32* ou *32,5*');
      d.area = area;
      return perguntar(tu, 'preco', d, perguntaPreco(d));
    }
    case 'preco': {
      let preco: number | null = null;
      if (/^(ok|sim|pode|isso|beleza|blz)$/.test(n) && d.servico && d.servico !== 'outro') preco = SERVICOS[d.servico].maoDeObraPadraoM2;
      else {
        const v = extrairValor(texto);
        if (v && v > 0 && v <= reais(1_000_000)) preco = v;
      }
      if (!preco) return tu.responder('Mande só o valor em reais. Exemplo: *60*');
      d.precoM2 = preco;
      if (d.servico === 'outro') {
        d.materialPorConta = false;
        return perguntar(tu, 'cliente', d, 'Qual é o nome do cliente?');
      }
      return perguntar(tu, 'material', d, 'Quem compra o material?\n1. O cliente\n2. Eu compro e repasso no preço');
    }
    case 'material': {
      if (/^(1|cliente|o cliente|ele)/.test(n)) d.materialPorConta = false;
      else if (/^(2|eu|eu compro)/.test(n)) d.materialPorConta = true;
      else return tu.responder('Mande *1* se o cliente compra ou *2* se você compra e repassa.');
      return perguntar(tu, 'cliente', d, 'Qual é o nome do cliente?');
    }
    case 'cliente': {
      const nome = nomeProprio(texto).slice(0, 50);
      if (nome.length < 2) return tu.responder('Qual é o nome do cliente?');
      d.cliente = nome;
      return perguntar(tu, 'telefone', d, `Qual é o WhatsApp de ${nome}, com DDD? Ele é usado nas cobranças.\nSe não tiver agora, mande *pular*.`);
    }
    case 'telefone': {
      if (/^(pular|nao tenho|depois|nao|sem)$/.test(n)) d.telefone = null;
      else {
        const tel = normalizarTelefoneBR(texto);
        if (!tel) return tu.responder('Não entendi o número. Mande com DDD, por exemplo *62 99999-0000*, ou mande *pular*.');
        d.telefone = tel;
      }
      return perguntar(tu, 'confirmar', d, textoConfirmacao(d));
    }
    case 'confirmar': {
      if (/^(sim|s|confirmar|confirmo|ok|gerar|pode|isso)$/.test(n)) return finalizarOrcamento(tu, d);
      if (/^(nao|n|refazer|errado)$/.test(n)) {
        await repo.salvarSessao(tu.ctx.db, tu.prof.waId, 'orcamento', 'servico', {});
        return tu.responder(`Vamos refazer.\n\n${PERGUNTA_SERVICO}`);
      }
      return tu.responder('Mande *sim* para gerar o orçamento, *não* para refazer ou *cancelar*.');
    }
    default:
      await repo.limparSessao(tu.ctx.db, tu.prof.waId);
      return tu.responder('Me perdi aqui. Mande *orçamento* para começar de novo.');
  }
}

function textoConfirmacao(d: RascunhoOrcamento): string {
  const servico = SERVICOS[d.servico!];
  const o = calcularOrcamento({ servico: d.servico!, areaM2: d.area!, precoM2: d.precoM2!, materialPorConta: Boolean(d.materialPorConta) });
  const porMetro = !(d.servico === 'outro' && d.area === 1);
  const linhas = [
    '*Confira o orçamento*',
    `Serviço: ${d.descricao ?? servico.nome}${porMetro ? `, ${formatarNumero(d.area!)} m²` : ''}`,
    porMetro ? `Mão de obra: ${r(d.precoM2!)}/m² = ${r(o.maoDeObra)}` : `Mão de obra: ${r(o.maoDeObra)}`,
  ];
  if (o.materiais.length) {
    linhas.push(d.materialPorConta ? `Material incluso: ${r(o.totalMateriais)}` : `Material: o cliente compra (estimativa de ${r(o.totalMateriais)})`);
  }
  linhas.push(
    `Total: *${r(o.valorFechado)}*`,
    `Prazo: ${o.dias} ${o.dias === 1 ? 'dia' : 'dias'} de trabalho`,
    `Cliente: ${d.cliente}${d.telefone ? ` · ${formatarTelefoneBR(d.telefone)}` : ''}`,
    'Pagamento: 30% de entrada, 40% na metade e 30% na entrega.',
    '',
    'Mande *sim* para gerar o orçamento, *não* para refazer ou *cancelar*.',
  );
  return linhas.join('\n');
}

async function finalizarOrcamento(tu: Turno, d: RascunhoOrcamento) {
  const { ctx, prof } = tu;
  const obra = await repo.criarObra(ctx.db, prof, {
    entrada: { servico: d.servico!, areaM2: d.area!, precoM2: d.precoM2!, materialPorConta: Boolean(d.materialPorConta) },
    descricaoServico: d.descricao,
    clienteNome: d.cliente!,
    clienteTelefone: d.telefone ?? null,
  });
  await repo.limparSessao(ctx.db, prof.waId);
  await enviarOrcamento(tu, obra.id, true);
}

async function enviarOrcamento(tu: Turno, obraId: string, novo: boolean) {
  const { ctx, msg, responder } = tu;
  const c = (await repo.carregarObra(ctx.db, obraId))!;
  const { obra, profissional } = c;
  const link = `${ctx.appUrl}/o/${obra.token}`;
  await ctx.canal.enviarDocumento(msg.de, {
    url: `${ctx.appUrl}/api/orcamentos/${obra.token}/pdf`,
    nomeArquivo: `Orcamento-${String(obra.numero).padStart(4, '0')}.pdf`,
    legenda: `Orçamento ${t.numeroObra(obra)} · ${obra.clienteNome}`,
  });
  const paraCliente = t.mensagemOrcamentoParaCliente(obra, profissional, link);
  const linhas = [
    novo ? `Pronto! Orçamento *${t.numeroObra(obra)}* criado. Agora essa é a sua obra ativa: os gastos que você mandar caem nela.` : `Orçamento *${t.numeroObra(obra)}* de novo:`,
    '',
    obra.clienteTelefone
      ? `Toque para mandar ao cliente com a mensagem pronta:\n${linkWhatsApp(paraCliente, obra.clienteTelefone)}`
      : `Encaminhe o PDF ao cliente ou mande este link:\n${link}`,
  ];
  if (novo) linhas.push('', 'Quando o cliente aprovar, mande *fechou*.');
  await responder(linhas.join('\n'));
}
