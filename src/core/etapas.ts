import { aplicarPercentual, type Centavos } from './dinheiro';

export interface DefinicaoEtapa {
  nome: string;
  /** 3000 = 30% */
  pontosBase: number;
}

export const ETAPAS_PADRAO: DefinicaoEtapa[] = [
  { nome: 'Entrada', pontosBase: 3000 },
  { nome: 'Metade do serviço', pontosBase: 4000 },
  { nome: 'Entrega da obra', pontosBase: 3000 },
];

export interface Etapa {
  ordem: number;
  nome: string;
  pontosBase: number;
  valor: Centavos;
}

export type StatusEtapa = 'paga' | 'parcial' | 'aberta';

export interface SituacaoEtapa extends Etapa {
  pago: Centavos;
  falta: Centavos;
  status: StatusEtapa;
}

/** Divide o valor fechado pelas etapas. A última fica com o resto, para a soma bater no centavo. */
export function dividirEtapas(valorFechado: Centavos, definicoes: DefinicaoEtapa[] = ETAPAS_PADRAO): Etapa[] {
  let acumulado = 0;
  return definicoes.map((d, i) => {
    const ultima = i === definicoes.length - 1;
    const valor = ultima ? valorFechado - acumulado : aplicarPercentual(valorFechado, d.pontosBase);
    acumulado += valor;
    return { ordem: i + 1, nome: d.nome, pontosBase: d.pontosBase, valor };
  });
}

/** Os recebimentos quitam as etapas em ordem: primeiro a entrada, depois as seguintes. */
export function situacaoDasEtapas(etapas: Etapa[], totalRecebido: Centavos): SituacaoEtapa[] {
  let resto = Math.max(0, totalRecebido);
  return etapas.map((e) => {
    const pago = Math.min(e.valor, resto);
    resto -= pago;
    const falta = e.valor - pago;
    const status: StatusEtapa = falta <= 0 ? 'paga' : pago > 0 ? 'parcial' : 'aberta';
    return { ...e, pago, falta, status };
  });
}

export function proximaEtapa(situacao: SituacaoEtapa[]): SituacaoEtapa | null {
  return situacao.find((e) => e.status !== 'paga') ?? null;
}

/** Etapas que passaram a ficar pagas com um novo recebimento (para avisar "Entrada quitada"). */
export function etapasQuitadas(etapas: Etapa[], antes: Centavos, depois: Centavos): SituacaoEtapa[] {
  const a = situacaoDasEtapas(etapas, antes);
  const d = situacaoDasEtapas(etapas, depois);
  return d.filter((e, i) => e.status === 'paga' && a[i]?.status !== 'paga');
}
