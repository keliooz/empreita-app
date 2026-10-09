import type { Centavos } from './dinheiro';
import { somenteAscii } from './texto';

/*
 * Pix "copia e cola" estático (BR Code), no padrão EMV QRCPS-MPM definido pelo Banco Central.
 * Cada campo é ID (2 dígitos) + tamanho (2 dígitos) + valor, e o código termina com CRC16-CCITT.
 */

export type TipoChavePix = 'cpf' | 'cnpj' | 'celular' | 'email' | 'aleatoria';

export interface ChavePix {
  tipo: TipoChavePix;
  chave: string;
}

export type ResultadoChave =
  | { ok: true; chave: ChavePix }
  | { ok: false; motivo: 'ambigua'; digitos: string }
  | { ok: false; motivo: 'invalida' };

function cpfValido(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const dig = (n: number) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(cpf[i]) * (n + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dig(9) === Number(cpf[9]) && dig(10) === Number(cpf[10]);
}

function cnpjValido(cnpj: string): boolean {
  if (!/^\d{14}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false;
  const calc = (n: number) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = pesos.reduce((t, p, i) => t + p * Number(cnpj[i]), 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(cnpj[12]) && calc(13) === Number(cnpj[13]);
}

/** Celular brasileiro: DDD válido + 9 dígitos começando com 9. Devolve no formato +55DDDNNNNNNNNN. */
function celularBR(digitos: string): string | null {
  let d = digitos;
  if (d.length === 13 && d.startsWith('55')) d = d.slice(2);
  if (d.length !== 11) return null;
  if (!/^[1-9][1-9]9\d{8}$/.test(d)) return null;
  return `+55${d}`;
}

/**
 * Descobre o tipo da chave a partir do que o profissional digitou.
 * Onze dígitos sem formatação podem ser CPF ou celular; nesse caso devolve `ambigua` para o bot perguntar.
 */
export function classificarChavePix(bruta: string): ResultadoChave {
  const t = bruta.trim();
  if (!t) return { ok: false, motivo: 'invalida' };

  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return { ok: true, chave: { tipo: 'email', chave: t.toLowerCase() } };
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t)) {
    return { ok: true, chave: { tipo: 'aleatoria', chave: t.toLowerCase() } };
  }

  const digitos = t.replace(/\D/g, '');
  const pareceTelefone = /^\+|\(\d{2}\)/.test(t);
  const pareceCpf = /^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(t);
  const pareceCnpj = /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(t);

  if (pareceCnpj || (digitos.length === 14 && !pareceTelefone)) {
    return cnpjValido(digitos) ? { ok: true, chave: { tipo: 'cnpj', chave: digitos } } : { ok: false, motivo: 'invalida' };
  }
  if (pareceCpf) {
    return cpfValido(digitos) ? { ok: true, chave: { tipo: 'cpf', chave: digitos } } : { ok: false, motivo: 'invalida' };
  }
  if (pareceTelefone || digitos.length === 13) {
    const cel = celularBR(digitos);
    return cel ? { ok: true, chave: { tipo: 'celular', chave: cel } } : { ok: false, motivo: 'invalida' };
  }
  if (digitos.length === 11 && digitos === t.replace(/[\s.-]/g, '')) {
    const cpf = cpfValido(digitos);
    const cel = celularBR(digitos);
    if (cpf && cel) return { ok: false, motivo: 'ambigua', digitos };
    if (cpf) return { ok: true, chave: { tipo: 'cpf', chave: digitos } };
    if (cel) return { ok: true, chave: { tipo: 'celular', chave: cel } };
  }
  return { ok: false, motivo: 'invalida' };
}

/** Resolve a ambiguidade depois que o profissional responde se é CPF ou celular. */
export function chaveComTipo(digitos: string, tipo: 'cpf' | 'celular'): ChavePix | null {
  if (tipo === 'cpf') return cpfValido(digitos) ? { tipo: 'cpf', chave: digitos } : null;
  const cel = celularBR(digitos);
  return cel ? { tipo: 'celular', chave: cel } : null;
}

export function descreverChave(c: ChavePix): string {
  const rotulo: Record<TipoChavePix, string> = {
    cpf: 'CPF',
    cnpj: 'CNPJ',
    celular: 'celular',
    email: 'e-mail',
    aleatoria: 'chave aleatória',
  };
  return `${rotulo[c.tipo]} ${c.chave}`;
}

/** CRC-16/CCITT-FALSE (polinômio 0x1021, início 0xFFFF), em 4 dígitos hexadecimais maiúsculos. */
export function crc16(payload: string): string {
  let crc = 0xffff;
  const bytes = new TextEncoder().encode(payload);
  for (const b of bytes) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function campo(id: string, valor: string): string {
  if (valor.length > 99) throw new Error(`Campo ${id} do Pix passou de 99 caracteres`);
  return `${id}${String(valor.length).padStart(2, '0')}${valor}`;
}

function limpar(texto: string, max: number): string {
  return somenteAscii(texto).replace(/\s+/g, ' ').trim().slice(0, max);
}

export interface DadosPix {
  chave: string;
  /** Nome de quem recebe (até 25 caracteres). */
  nome: string;
  /** Cidade de quem recebe (até 15 caracteres). */
  cidade: string;
  valor?: Centavos;
  /** Identificador da cobrança: letras e números, até 25. */
  txid?: string;
  /** Mensagem curta exibida no app do banco de quem paga. */
  descricao?: string;
}

export function gerarPixCopiaECola(d: DadosPix): string {
  const chave = d.chave.trim();
  const descricao = d.descricao ? limpar(d.descricao, 40) : '';
  const conta =
    campo('00', 'br.gov.bcb.pix') + campo('01', chave) + (descricao ? campo('02', descricao) : '');
  const txid = (d.txid ?? '').replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***';
  const nome = limpar(d.nome, 25) || 'RECEBEDOR';
  const cidade = limpar(d.cidade, 15) || 'BRASIL';

  let payload =
    campo('00', '01') +
    campo('26', conta) +
    campo('52', '0000') +
    campo('53', '986') +
    (d.valor && d.valor > 0 ? campo('54', (d.valor / 100).toFixed(2)) : '') +
    campo('58', 'BR') +
    campo('59', nome) +
    campo('60', cidade) +
    campo('62', campo('05', txid));
  payload += '6304';
  return payload + crc16(payload);
}
