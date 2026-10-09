import type { Centavos } from './dinheiro';
import { SERVICOS, type ItemMaterial, type ServicoId } from './servicos';

export interface EntradaOrcamento {
  servico: ServicoId;
  areaM2: number;
  precoM2: Centavos;
  /** O profissional compra o material e repassa no valor do serviço. */
  materialPorConta: boolean;
}

export interface Orcamento {
  maoDeObra: Centavos;
  materiais: ItemMaterial[];
  /** Soma só dos itens com preço de referência. */
  totalMateriais: Centavos;
  /** O que o cliente paga ao profissional. */
  valorFechado: Centavos;
  dias: number;
}

export function totalDoItem(item: ItemMaterial): Centavos {
  return item.precoUnitario == null ? 0 : Math.round(item.quantidade * item.precoUnitario);
}

export function calcularOrcamento(e: EntradaOrcamento): Orcamento {
  const servico = SERVICOS[e.servico];
  const materiais = servico.materiais(e.areaM2);
  const totalMateriais = materiais.reduce((t, m) => t + totalDoItem(m), 0);
  const maoDeObra = Math.round(e.areaM2 * e.precoM2);
  const valorFechado = maoDeObra + (e.materialPorConta ? totalMateriais : 0);
  const dias = Math.max(1, Math.ceil(e.areaM2 / servico.m2PorDia));
  return { maoDeObra, materiais, totalMateriais, valorFechado, dias };
}
