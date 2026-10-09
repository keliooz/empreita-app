import { reais, type Centavos } from './dinheiro';
import { normalizar, primeiraMaiuscula } from './texto';

export const CATEGORIAS = ['Mão de obra', 'Material', 'Transporte', 'Ferramentas', 'Alimentação', 'Outros'] as const;
export type Categoria = (typeof CATEGORIAS)[number];

export type Interpretacao =
  | { tipo: 'lancamento'; natureza: 'gasto'; valor: Centavos; categoria: Categoria; descricao: string }
  | { tipo: 'lancamento'; natureza: 'recebimento'; valor: Centavos; descricao: string }
  | { tipo: 'sem_valor' };

const NUMERO = /(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+,\d{1,2}|\d+\.\d{1,2}(?!\d)|\d+)/;

function numeroBR(bruto: string): number {
  let v = bruto;
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(v)) v = v.replace(/\./g, '').replace(',', '.');
  else if (/^\d+,\d{1,2}$/.test(v)) v = v.replace(',', '.');
  return Number(v);
}

/**
 * Acha o valor em reais dentro de uma mensagem curta.
 * Aceita "150", "R$ 1.500,00", "86,90", "86.90", "2 mil", "1,5 mil" e "2 diárias de 150" (= 300).
 */
export function extrairValor(texto: string): Centavos | null {
  const t = normalizar(texto).replace(/r\$\s*/g, '');

  const diarias = t.match(/(\d+)\s*(?:diarias|diaria|dias)\s*(?:de|a|x)\s*(\d+(?:[.,]\d{1,2})?)/);
  if (diarias && diarias[1] && diarias[2]) {
    const qtd = Number(diarias[1]);
    const unit = numeroBR(diarias[2]);
    if (qtd > 0 && qtd <= 60 && unit > 0) return reais(qtd * unit);
  }

  const mil = t.match(/(\d+(?:[.,]\d+)?)\s*mil\b/);
  if (mil && mil[1]) {
    const n = Number(mil[1].replace(',', '.'));
    if (Number.isFinite(n) && n > 0) return reais(n * 1000);
  }

  const m = t.match(NUMERO);
  if (!m || !m[1]) return null;
  const n = numeroBR(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  return reais(n);
}

const RECEBIMENTO = /\b(recebi|recebido|recebemos|entrada|caiu|adiantamento|sinal|pagou)\b/;

export function categorizar(textoNormalizado: string): Categoria {
  const n = textoNormalizado;
  if (/(ajudante|diaria|servente|pedreiro|mao de obra|eletricista|encanador|pintor|azulejista|gesseiro|empreita)/.test(n)) return 'Mão de obra';
  if (/(gasolina|combustivel|diesel|etanol|uber|frete|carreto|transporte|onibus|pedagio|estacionamento)/.test(n)) return 'Transporte';
  if (/(ferramenta|furadeira|esmerilhadeira|serra|aluguel|betoneira|andaime|martelete|lixadeira)/.test(n)) return 'Ferramentas';
  if (/(almoco|marmita|lanche|comida|\bagua\b|cafe|refrigerante|janta)/.test(n)) return 'Alimentação';
  if (/(nota|loja|material|cimento|areia|argamassa|bloco|tijolo|piso|porcelanato|tinta|rejunte|\bcal\b|ferro|vergalhao|cano|tubo|\bfio\b|disco|broca|parafuso|massa|selador|lixa|brita|telha|madeira|prego|cola)/.test(n)) return 'Material';
  return 'Outros';
}

/** Tira o valor e palavras de ligação do começo para sobrar a descrição: "150 diária ajudante" -> "Diária ajudante". */
export function extrairDescricao(texto: string): string {
  let s = texto
    .replace(/r\$\s*/gi, ' ')
    .replace(/\b\d+\s*(?:diárias|diarias|diária|diaria|dias)\s*(?:de|a|x)\s*\d+(?:[.,]\d{1,2})?/i, ' diárias ')
    .replace(/\d+(?:[.,]\d+)?\s*mil\b/i, ' ')
    .replace(NUMERO, ' ')
    .replace(/\breais\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(de|do|da|com|em|no|na|pra|para|pro)\s+/i, '')
    .replace(/^[-–:,.;]+|[-–:,.;]+$/g, '')
    .trim();
  if (s.length > 80) s = s.slice(0, 80).trim();
  return primeiraMaiuscula(s);
}

export function interpretarLancamento(texto: string): Interpretacao {
  const valor = extrairValor(texto);
  if (valor == null) return { tipo: 'sem_valor' };
  const n = normalizar(texto);
  if (RECEBIMENTO.test(n) && !/\bpaguei\b/.test(n)) {
    const descricao = /entrada|sinal/.test(n) ? 'Entrada do cliente' : 'Pagamento do cliente';
    return { tipo: 'lancamento', natureza: 'recebimento', valor, descricao };
  }
  const categoria = categorizar(n);
  return { tipo: 'lancamento', natureza: 'gasto', valor, categoria, descricao: extrairDescricao(texto) || categoria };
}
