import { formatarNumero, formatarPercentual, formatarReais as r } from '@/core/dinheiro';
import type { SituacaoEtapa } from '@/core/etapas';
import { gerarPixCopiaECola } from '@/core/pix';
import type { ResumoObra } from '@/core/resumo';
import { linkWhatsApp } from '@/core/telefone';
import type { Lancamento, Obra, Profissional } from '@/db/schema';

/* Formatação do WhatsApp: *negrito*, _itálico_. Mensagens curtas, uma ideia por vez. */

export const numeroObra = (o: Pick<Obra, 'numero'>) => `nº ${String(o.numero).padStart(4, '0')}`;
export const rotuloObra = (o: Pick<Obra, 'titulo' | 'clienteNome'>) => `${o.titulo} · ${o.clienteNome}`;

export function menu(nome?: string | null): string {
  return [
    `${nome ? `${nome}, ` : ''}é só me mandar uma mensagem como estas:`,
    '',
    '*orçamento*: cria um orçamento novo',
    '*150 diária ajudante*: lança um gasto na obra',
    '*recebi 500*: lança um pagamento do cliente',
    '📷 *foto da nota*: eu pergunto o valor',
    '*resumo*: quanto a obra está dando de lucro',
    '*cobrar*: mensagem de cobrança com Pix',
    '*obras*: suas obras (mande *obra 2* para trocar)',
    '*extrato*: últimos lançamentos',
    '*desfazer*: apaga o último lançamento',
    '*fechou*: o cliente aprovou o orçamento',
    '*concluir*: obra entregue',
    '*pix*: troca sua chave Pix',
    '',
    'Para sair de qualquer pergunta, mande *cancelar*.',
  ].join('\n');
}

export function resumoTexto(o: Obra, res: ResumoObra): string {
  const linhas = [
    `*${rotuloObra(o)}* (${numeroObra(o)})`,
    `Valor fechado: ${r(res.valorFechado)}`,
    `Gastos: ${r(res.gastos)}`,
    ...res.porCategoria.map(
      (c) => `   ${c.categoria}: ${r(c.valor)}${c.categoria === 'Material' && res.materialEstimado ? ' (estimativa do orçamento)' : ''}`,
    ),
    `${res.lucro >= 0 ? 'Lucro previsto' : 'Prejuízo previsto'}: *${r(res.lucro)}* (${formatarPercentual(res.margem)})`,
    `Recebido: ${r(res.recebido)} · Falta receber: ${r(res.faltaReceber)}`,
  ];
  if (res.margem < 0) linhas.push('', 'Os gastos já passaram do valor fechado.');
  else if (res.margem < 0.2) linhas.push('', 'Margem apertada. Vale rever o preço do próximo orçamento.');
  return linhas.join('\n');
}

export function linhaLucro(res: ResumoObra): string {
  return `${res.lucro >= 0 ? 'Lucro previsto' : 'Prejuízo previsto'} da obra: *${r(res.lucro)}* (${formatarPercentual(res.margem)}).`;
}

export function extratoTexto(o: Obra, lancs: Lancamento[]): string {
  if (!lancs.length) return `Nenhum lançamento em *${rotuloObra(o)}* ainda.`;
  const fmtData = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });
  return [
    `*Últimos lançamentos · ${rotuloObra(o)}*`,
    ...lancs.map(
      (l) => `${fmtData.format(l.criadoEm)}  ${l.natureza === 'recebimento' ? '+' : '-'}${r(l.valor)}  ${l.descricao}${l.origem === 'foto' ? ' (nota)' : ''}`,
    ),
  ].join('\n');
}

export function listaObrasTexto(obras: Obra[], ativaId: string | null): string {
  if (!obras.length) return 'Você ainda não tem obras. Mande *orçamento* para criar a primeira.';
  const status: Record<string, string> = { orcamento: 'orçamento', em_andamento: 'em andamento', concluida: 'concluída' };
  return [
    '*Suas obras*',
    ...obras.map(
      (o) => `${o.numero}. ${rotuloObra(o)} · ${status[o.status] ?? o.status}${o.id === ativaId ? '  ← ativa' : ''}`,
    ),
    '',
    'Para trocar a obra ativa, mande *obra* e o número. Exemplo: *obra 2*',
  ].join('\n');
}

/** Mensagem que o profissional manda para o cliente com o orçamento. */
export function mensagemOrcamentoParaCliente(o: Obra, p: Profissional, link: string): string {
  return [
    `Olá, ${o.clienteNome}! Aqui é ${p.nome ?? 'seu profissional'}.`,
    `Segue o orçamento ${numeroObra(o)}: ${o.titulo}, ${formatarNumero(o.areaM2)} m².`,
    `Total: ${r(o.valorFechado)}. Prazo: ${o.dias} ${o.dias === 1 ? 'dia' : 'dias'} de trabalho.`,
    `Veja os detalhes e a lista de material: ${link}`,
  ].join('\n');
}

function abertura(e: SituacaoEtapa, o: Obra): string {
  if (e.ordem === 1) return `Para reservar a data e começar a obra (${o.titulo}), a entrada fica em ${r(e.falta)}.`;
  if (e.nome === 'Entrega da obra') return `A obra (${o.titulo}) está pronta. Falta o valor final de ${r(e.falta)}.`;
  return `Chegamos na etapa "${e.nome}" da obra (${o.titulo}). O valor desta etapa é ${r(e.falta)}.`;
}

export function txidEtapa(o: Obra, e: SituacaoEtapa): string {
  return `EMP${String(o.numero).padStart(4, '0')}E${e.ordem}`;
}

export function pixDaEtapa(o: Obra, p: Profissional, e: SituacaoEtapa): string | null {
  if (!p.pixChave) return null;
  return gerarPixCopiaECola({
    chave: p.pixChave,
    nome: p.nome ?? 'Profissional',
    cidade: p.cidade ?? 'Brasil',
    valor: e.falta,
    txid: txidEtapa(o, e),
  });
}

/** Mensagem de cobrança pronta para o cliente, com Pix copia e cola quando houver chave. */
export function mensagemCobranca(o: Obra, p: Profissional, e: SituacaoEtapa, link: string): string {
  const pix = pixDaEtapa(o, p, e);
  return [
    `Oi, ${o.clienteNome}! ${abertura(e, o)}`,
    pix ? `\nPix copia e cola:\n${pix}` : '',
    `\nDetalhes do orçamento e dos pagamentos: ${link}`,
    '\nObrigado pela confiança!',
  ]
    .filter(Boolean)
    .join('\n');
}

export function instrucaoCobranca(o: Obra, e: SituacaoEtapa, textoCliente: string, temPix: boolean): string {
  const linhas = [`Próxima etapa: *${e.nome}* · ${r(e.falta)}${e.status === 'parcial' ? ` (já entrou ${r(e.pago)})` : ''}`, ''];
  if (o.clienteTelefone) {
    linhas.push('Toque no link para abrir a conversa com o cliente com a mensagem pronta:', linkWhatsApp(textoCliente, o.clienteTelefone));
  } else {
    linhas.push('Encaminhe a próxima mensagem para o cliente. Para eu já abrir a conversa com ele, mande *telefone do cliente 62 99999-0000*.');
  }
  if (!temPix) linhas.push('', 'Dica: cadastre sua chave Pix mandando *pix* e o Pix copia e cola vai junto na cobrança.');
  linhas.push('', `Quando o dinheiro cair, me mande: *recebi ${(e.falta / 100).toFixed(2).replace('.', ',').replace(/,00$/, '')}*`);
  return linhas.join('\n');
}
