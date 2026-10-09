import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import { formatarNumero, formatarReais as r } from '@/core/dinheiro';
import { totalDoItem } from '@/core/orcamento';
import { descreverChave, type ChavePix } from '@/core/pix';
import { SERVICOS, type ServicoId } from '@/core/servicos';
import { formatarTelefoneBR } from '@/core/telefone';
import type { ObraCompleta } from '@/bot/repo';

const AMARELO = rgb(0.953, 0.757, 0.11);
const TINTA = rgb(0.11, 0.125, 0.137);
const APAGADO = rgb(0.35, 0.376, 0.4);
const LINHA = rgb(0.8, 0.82, 0.79);
const CARBONO = rgb(0.165, 0.294, 0.608);

const A4: [number, number] = [595.28, 841.89];
const MARGEM = 48;

/** As fontes padrão do PDF só têm o alfabeto latino (WinAnsi). Troca o que não cabe, como emojis. */
export function textoSeguro(s: string): string {
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/ /g, ' ')
    .replace(/[^ -~¡-ÿ€]/gu, '');
}

class Pagina {
  page: PDFPage;
  y: number;
  constructor(
    private readonly doc: PDFDocument,
    readonly fonte: PDFFont,
    readonly negrito: PDFFont,
  ) {
    this.page = doc.addPage(A4);
    this.y = A4[1] - MARGEM;
  }

  get largura() {
    return A4[0] - MARGEM * 2;
  }

  /** Abre uma página nova quando o conteúdo não cabe. */
  garantir(altura: number) {
    if (this.y - altura < MARGEM + 30) {
      this.page = this.doc.addPage(A4);
      this.y = A4[1] - MARGEM;
    }
  }

  texto(t: string, x: number, o: { tamanho?: number; negrito?: boolean; cor?: RGB; direita?: number } = {}) {
    const tamanho = o.tamanho ?? 10;
    const fonte = o.negrito ? this.negrito : this.fonte;
    // "²" e "³" são desenhados como números pequenos e elevados: nem todo leitor de PDF mostra esses glifos.
    const partes = textoSeguro(t)
      .split(/([²³])/)
      .filter(Boolean)
      .map((s) => (s === '²' || s === '³' ? { s: s === '²' ? '2' : '3', sobrescrito: true } : { s, sobrescrito: false }));
    const larguraDe = (p: { s: string; sobrescrito: boolean }) => fonte.widthOfTextAtSize(p.s, p.sobrescrito ? tamanho * 0.62 : tamanho);
    const total = partes.reduce((soma, p) => soma + larguraDe(p), 0);
    let posX = o.direita != null ? o.direita - total : x;
    for (const p of partes) {
      this.page.drawText(p.s, {
        x: posX,
        y: p.sobrescrito ? this.y + tamanho * 0.38 : this.y,
        size: p.sobrescrito ? tamanho * 0.62 : tamanho,
        font: fonte,
        color: o.cor ?? TINTA,
      });
      posX += larguraDe(p);
    }
  }

  quebrar(t: string, largura: number, tamanho = 10, negrito = false): string[] {
    const fonte = negrito ? this.negrito : this.fonte;
    const palavras = textoSeguro(t).split(/\s+/);
    const linhas: string[] = [];
    let atual = '';
    for (const p of palavras) {
      const teste = atual ? `${atual} ${p}` : p;
      if (fonte.widthOfTextAtSize(teste, tamanho) <= largura || !atual) atual = teste;
      else {
        linhas.push(atual);
        atual = p;
      }
    }
    if (atual) linhas.push(atual);
    return linhas;
  }

  linha(cor = LINHA, espessura = 0.6) {
    this.page.drawLine({ start: { x: MARGEM, y: this.y }, end: { x: A4[0] - MARGEM, y: this.y }, thickness: espessura, color: cor });
  }
}

export async function gerarPdfOrcamento(c: ObraCompleta): Promise<Uint8Array> {
  const { obra, profissional: p, materiais, resumo } = c;
  const doc = await PDFDocument.create();
  doc.setTitle(textoSeguro(`Orçamento ${String(obra.numero).padStart(4, '0')} - ${obra.clienteNome}`));
  doc.setAuthor(textoSeguro(p.nome ?? 'Empreita'));
  doc.setCreator('Empreita');
  const fonte = await doc.embedFont(StandardFonts.Helvetica);
  const negrito = await doc.embedFont(StandardFonts.HelveticaBold);
  const pg = new Pagina(doc, fonte, negrito);
  const dir = A4[0] - MARGEM;

  // Faixa de fita métrica no topo
  pg.page.drawRectangle({ x: 0, y: A4[1] - 14, width: A4[0], height: 14, color: AMARELO });
  for (let x = 0; x < A4[0]; x += 7) {
    const alto = x % 35 === 0 ? 7 : 4;
    pg.page.drawLine({ start: { x, y: A4[1] }, end: { x, y: A4[1] - alto }, thickness: 0.6, color: TINTA });
  }

  pg.y -= 16;
  pg.texto('ORÇAMENTO', MARGEM, { tamanho: 22, negrito: true });
  pg.texto(`Nº ${String(obra.numero).padStart(4, '0')}`, 0, { tamanho: 12, negrito: true, cor: CARBONO, direita: dir });
  pg.y -= 16;
  const data = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' }).format(obra.criadoEm);
  pg.texto(`Emitido em ${data} · válido por 15 dias`, 0, { tamanho: 9, cor: APAGADO, direita: dir });
  pg.y -= 22;
  pg.linha(TINTA, 1.2);

  // Profissional e cliente lado a lado
  pg.y -= 20;
  const meio = MARGEM + pg.largura / 2 + 10;
  pg.texto('PROFISSIONAL', MARGEM, { tamanho: 8, negrito: true, cor: APAGADO });
  pg.texto('CLIENTE', meio, { tamanho: 8, negrito: true, cor: APAGADO });
  pg.y -= 15;
  pg.texto(p.nome ?? 'Profissional', MARGEM, { tamanho: 12, negrito: true });
  pg.texto(obra.clienteNome, meio, { tamanho: 12, negrito: true });
  pg.y -= 14;
  pg.texto(`WhatsApp ${formatarTelefoneBR(p.waId)}${p.cidade ? ` · ${p.cidade}` : ''}`, MARGEM, { tamanho: 9, cor: APAGADO });
  if (obra.clienteTelefone) pg.texto(`WhatsApp ${formatarTelefoneBR(obra.clienteTelefone)}`, meio, { tamanho: 9, cor: APAGADO });

  // Serviço
  pg.y -= 28;
  const servico = SERVICOS[obra.servico as ServicoId] ?? SERVICOS.outro;
  const porMetro = !(obra.servico === 'outro' && obra.areaM2 === 1);
  pg.texto('SERVIÇO', MARGEM, { tamanho: 8, negrito: true, cor: APAGADO });
  pg.y -= 15;
  pg.texto(`${obra.descricaoServico ?? servico.nome}${porMetro ? ` · ${formatarNumero(obra.areaM2)} m²` : ''}`, MARGEM, { tamanho: 12, negrito: true });
  pg.y -= 14;
  pg.texto(`Prazo estimado: ${obra.dias} ${obra.dias === 1 ? 'dia' : 'dias'} de trabalho`, MARGEM, { tamanho: 9, cor: APAGADO });

  // Tabela de itens
  const colQtd = dir - 150;
  const colValor = dir;
  const larguraItem = colQtd - MARGEM - 60;
  pg.y -= 30;
  pg.texto('ITEM', MARGEM, { tamanho: 8, negrito: true, cor: APAGADO });
  pg.texto('QTD.', 0, { tamanho: 8, negrito: true, cor: APAGADO, direita: colQtd });
  pg.texto('VALOR', 0, { tamanho: 8, negrito: true, cor: APAGADO, direita: colValor });
  pg.y -= 7;
  pg.linha(TINTA, 0.8);

  const linhaItem = (nome: string, qtd: string, valor: string, o: { negrito?: boolean; cor?: RGB } = {}) => {
    const linhas = pg.quebrar(nome, larguraItem, 10, o.negrito);
    pg.garantir(linhas.length * 13 + 10);
    pg.y -= 16;
    linhas.forEach((l, i) => {
      if (i > 0) pg.y -= 13;
      pg.texto(l, MARGEM, { negrito: o.negrito });
    });
    const yFinal = pg.y;
    pg.y += (linhas.length - 1) * 13;
    pg.texto(qtd, 0, { direita: colQtd });
    pg.texto(valor, 0, { direita: colValor, negrito: o.negrito, cor: o.cor });
    pg.y = yFinal - 6;
    pg.linha();
  };

  linhaItem(
    porMetro ? `Mão de obra (${r(obra.precoM2)} por m²)` : 'Mão de obra',
    porMetro ? `${formatarNumero(obra.areaM2)} m²` : '1',
    r(obra.maoDeObra),
    { negrito: true },
  );

  if (materiais.length) {
    pg.garantir(40);
    pg.y -= 20;
    pg.texto(obra.materialPorConta ? 'MATERIAL INCLUSO NO SERVIÇO' : 'LISTA DE MATERIAL PARA O CLIENTE COMPRAR', MARGEM, {
      tamanho: 8,
      negrito: true,
      cor: CARBONO,
    });
    for (const m of materiais) {
      const item = { nome: m.nome, quantidade: m.quantidade, unidade: m.unidade, precoUnitario: m.precoUnitario };
      linhaItem(m.nome, `${formatarNumero(m.quantidade)} ${m.unidade}`, m.precoUnitario == null ? 'cliente escolhe' : r(totalDoItem(item)), {
        cor: m.precoUnitario == null ? APAGADO : undefined,
      });
    }
    pg.garantir(20);
    pg.y -= 16;
    pg.texto(obra.materialPorConta ? 'Total de material' : 'Material estimado (pago pelo cliente na loja)', MARGEM, { cor: APAGADO });
    pg.texto(r(obra.totalMateriais), 0, { direita: colValor, cor: APAGADO });
  }

  pg.garantir(40);
  pg.y -= 14;
  pg.linha(TINTA, 1.2);
  pg.y -= 20;
  pg.texto('TOTAL DO ORÇAMENTO', MARGEM, { tamanho: 12, negrito: true });
  pg.texto(r(obra.valorFechado), 0, { tamanho: 14, negrito: true, direita: colValor });

  // Etapas de pagamento
  pg.garantir(30 + resumo.etapas.length * 18);
  pg.y -= 34;
  pg.texto('PAGAMENTO EM ETAPAS', MARGEM, { tamanho: 8, negrito: true, cor: APAGADO });
  for (const e of resumo.etapas) {
    pg.y -= 17;
    pg.texto(`${e.ordem}. ${e.nome}`, MARGEM);
    pg.texto(`${Math.round(e.pontosBase / 100)}%`, 0, { direita: colQtd, cor: APAGADO });
    pg.texto(r(e.valor), 0, { direita: colValor });
  }
  if (p.pixChave && p.pixTipo) {
    pg.y -= 20;
    pg.texto(`Pix: ${descreverChave({ tipo: p.pixTipo as ChavePix['tipo'], chave: p.pixChave })}`, MARGEM, { negrito: true });
  }

  // Observações
  pg.garantir(60);
  pg.y -= 30;
  for (const l of pg.quebrar(
    'Quantidades e preços de material são estimativas de referência e podem variar conforme a obra e a loja. Serviços não descritos neste orçamento são cobrados à parte.',
    pg.largura,
    8,
  )) {
    pg.texto(l, MARGEM, { tamanho: 8, cor: APAGADO });
    pg.y -= 11;
  }

  // Rodapé em todas as páginas
  const paginas = doc.getPages();
  paginas.forEach((pagina, i) => {
    const t = textoSeguro(`Feito com Empreita · página ${i + 1} de ${paginas.length}`);
    pagina.drawText(t, { x: MARGEM, y: 26, size: 8, font: fonte, color: APAGADO });
  });

  return doc.save();
}
