import type { Centavos } from './dinheiro';

export type ServicoId = 'piso' | 'pintura' | 'alvenaria' | 'outro';

export interface ItemMaterial {
  nome: string;
  quantidade: number;
  unidade: string;
  /** Preço de referência por unidade. `null` quando o cliente escolhe o produto (ex.: o piso). */
  precoUnitario: Centavos | null;
}

export interface Servico {
  id: ServicoId;
  nome: string;
  /** Nome curto usado como título da obra. */
  tituloObra: string;
  maoDeObraPadraoM2: Centavos;
  /** Produtividade média para estimar o prazo. */
  m2PorDia: number;
  materiais: (areaM2: number) => ItemMaterial[];
}

/** Arredonda para cima sem cair em erro de ponto flutuante (35,2000001 vira 35,2, e não 35,3). */
export function arredondarParaCima(valor: number, casas = 0): number {
  const fator = 10 ** casas;
  return Math.ceil(Math.round(valor * fator * 1000) / 1000) / fator;
}

const up = arredondarParaCima;

/*
 * Consumos aproximados de referência. Cada obra varia; o profissional confere na hora de comprar.
 * - Argamassa AC-III em porcelanato: ~7 kg/m² (dupla colagem).
 * - Rejunte: ~0,4 kg/m² para peças médias com junta de 2 a 3 mm.
 * - Tinta acrílica: galão de 3,6 L rende ~40 m² por demão (valor conservador).
 * - Bloco cerâmico 14x19x29: ~17 blocos/m² com junta de 1 cm.
 * - Argamassa de assentamento 1:2:8: ~2 kg de cimento, ~1,7 kg de cal e ~0,015 m³ de areia por m².
 * Os preços são apenas referência; a ideia é que venham da loja parceira.
 */
export const SERVICOS: Record<ServicoId, Servico> = {
  piso: {
    id: 'piso',
    nome: 'Assentamento de piso',
    tituloObra: 'Assentamento de piso',
    maoDeObraPadraoM2: 6000,
    m2PorDia: 10,
    materiais: (a) => [
      { nome: 'Piso ou porcelanato (+10% de perda)', quantidade: up(a * 1.1, 1), unidade: 'm²', precoUnitario: null },
      { nome: 'Argamassa AC-III, saco 20 kg', quantidade: up((a * 7) / 20), unidade: 'sc', precoUnitario: 3890 },
      { nome: 'Rejunte, pacote 1 kg', quantidade: up(a * 0.4), unidade: 'pct', precoUnitario: 1490 },
      { nome: 'Espaçador e cunha niveladora (kit)', quantidade: Math.max(1, up(a / 40)), unidade: 'kit', precoUnitario: 4990 },
    ],
  },
  pintura: {
    id: 'pintura',
    nome: 'Pintura de parede, 2 demãos',
    tituloObra: 'Pintura',
    maoDeObraPadraoM2: 2500,
    m2PorDia: 30,
    materiais: (a) => [
      { nome: 'Tinta acrílica, galão 3,6 L', quantidade: Math.max(1, up((a * 2) / 40)), unidade: 'gl', precoUnitario: 11990 },
      { nome: 'Selador acrílico, galão 3,6 L', quantidade: Math.max(1, up(a / 50)), unidade: 'gl', precoUnitario: 7990 },
      { nome: 'Rolo, fita crepe e lixa (kit)', quantidade: Math.max(1, up(a / 120)), unidade: 'kit', precoUnitario: 5990 },
    ],
  },
  alvenaria: {
    id: 'alvenaria',
    nome: 'Alvenaria de bloco cerâmico',
    tituloObra: 'Alvenaria',
    maoDeObraPadraoM2: 5500,
    m2PorDia: 12,
    materiais: (a) => [
      { nome: 'Bloco cerâmico 14x19x29 (+5% de perda)', quantidade: up(a * 17 * 1.05), unidade: 'un', precoUnitario: 235 },
      { nome: 'Cimento CP-II, saco 50 kg', quantidade: Math.max(1, up((a * 2) / 50)), unidade: 'sc', precoUnitario: 3990 },
      { nome: 'Cal hidratada, saco 20 kg', quantidade: Math.max(1, up((a * 1.7) / 20)), unidade: 'sc', precoUnitario: 2290 },
      { nome: 'Areia média', quantidade: Math.max(0.5, up(a * 0.015 * 2) / 2), unidade: 'm³', precoUnitario: 16000 },
    ],
  },
  outro: {
    id: 'outro',
    nome: 'Outro serviço',
    tituloObra: 'Serviço',
    maoDeObraPadraoM2: 5000,
    m2PorDia: 15,
    materiais: () => [],
  },
};

export function servicoPorId(id: string): Servico | null {
  return id in SERVICOS ? SERVICOS[id as ServicoId] : null;
}
