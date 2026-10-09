import type { Centavos } from './dinheiro';
import { proximaEtapa, situacaoDasEtapas, type Etapa, type SituacaoEtapa } from './etapas';
import { CATEGORIAS, type Categoria } from './mensagem';

export interface LancamentoBase {
  natureza: string;
  categoria: string | null;
  valor: Centavos;
}

export interface ResumoObra {
  valorFechado: Centavos;
  gastos: Centavos;
  porCategoria: { categoria: Categoria; valor: Centavos }[];
  recebido: Centavos;
  faltaReceber: Centavos;
  lucro: Centavos;
  /** Lucro sobre o valor fechado (0,83 = 83%). */
  margem: number;
  /** O material ainda está contado pela estimativa do orçamento (as notas lançadas somam menos). */
  materialEstimado: boolean;
  etapas: SituacaoEtapa[];
  proxima: SituacaoEtapa | null;
}

/**
 * Quando o profissional compra o material e repassa, o total de materiais entra como gasto
 * da obra (ele recebe esse dinheiro do cliente, mas não é lucro).
 */
export function calcularResumo(
  obra: { valorFechado: Centavos; materialPorConta: boolean; totalMateriais: Centavos },
  lancamentos: LancamentoBase[],
  etapas: Etapa[],
): ResumoObra {
  const soma = new Map<Categoria, Centavos>();
  let gastos = 0;
  let recebido = 0;
  for (const l of lancamentos) {
    if (l.natureza === 'recebimento') {
      recebido += l.valor;
      continue;
    }
    gastos += l.valor;
    const cat = (CATEGORIAS as readonly string[]).includes(l.categoria ?? '') ? (l.categoria as Categoria) : 'Outros';
    soma.set(cat, (soma.get(cat) ?? 0) + l.valor);
  }
  let materialEstimado = false;
  if (obra.materialPorConta && obra.totalMateriais > 0) {
    // Enquanto as notas reais não somam o previsto, vale a estimativa do orçamento.
    // Assim a nota da loja não é contada duas vezes e o lucro nunca aparece inflado.
    const lancado = soma.get('Material') ?? 0;
    if (obra.totalMateriais > lancado) {
      gastos += obra.totalMateriais - lancado;
      soma.set('Material', obra.totalMateriais);
      materialEstimado = true;
    }
  }
  const lucro = obra.valorFechado - gastos;
  const situacao = situacaoDasEtapas(etapas, recebido);
  return {
    valorFechado: obra.valorFechado,
    gastos,
    porCategoria: CATEGORIAS.filter((c) => (soma.get(c) ?? 0) > 0).map((c) => ({ categoria: c, valor: soma.get(c) ?? 0 })),
    recebido,
    faltaReceber: Math.max(0, obra.valorFechado - recebido),
    lucro,
    margem: obra.valorFechado > 0 ? lucro / obra.valorFechado : 0,
    materialEstimado,
    etapas: situacao,
    proxima: proximaEtapa(situacao),
  };
}
