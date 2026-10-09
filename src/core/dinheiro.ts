/** Valores em dinheiro são sempre inteiros em centavos para não acumular erro de ponto flutuante. */
export type Centavos = number;

export function reais(valor: number): Centavos {
  return Math.round(valor * 100);
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** "R$ 1.234,56" com espaço comum (o Intl usa espaço inseparável, que atrapalha no WhatsApp e no PDF). */
export function formatarReais(valor: Centavos): string {
  return brl.format(valor / 100).replace(/ /g, ' ');
}

/** Percentual em pontos-base (3000 = 30%). */
export function aplicarPercentual(valor: Centavos, pontosBase: number): Centavos {
  return Math.round((valor * pontosBase) / 10000);
}

export function formatarPercentual(fracao: number): string {
  return `${Math.round(fracao * 100)}%`;
}

const numero = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

export function formatarNumero(valor: number): string {
  return numero.format(valor).replace(/ /g, ' ');
}
