/**
 * Telefones no formato que o WhatsApp usa: DDI + DDD + número, só dígitos (ex.: 5562986014789).
 * Celulares antigos às vezes aparecem no WhatsApp sem o 9 extra (556286014789); por isso as variantes.
 */
export function normalizarTelefoneBR(bruto: string): string | null {
  let d = bruto.replace(/\D/g, '');
  if (d.startsWith('0')) d = d.replace(/^0+/, '');
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  if (!/^55[1-9][1-9]\d{8,9}$/.test(d)) return null;
  return d;
}

export function variantesTelefoneBR(numero: string): string[] {
  const d = numero.replace(/\D/g, '');
  const m = d.match(/^55(\d{2})(\d{8,9})$/);
  if (!m || !m[1] || !m[2]) return [d];
  const [, ddd, resto] = m;
  if (resto.length === 9 && resto.startsWith('9')) return [d, `55${ddd}${resto.slice(1)}`];
  if (resto.length === 8 && /^[6-9]/.test(resto)) return [d, `55${ddd}9${resto}`];
  return [d];
}

export function mesmoTelefone(a: string, b: string): boolean {
  const vb = new Set(variantesTelefoneBR(b));
  return variantesTelefoneBR(a).some((v) => vb.has(v));
}

/** (62) 98601-4789 */
export function formatarTelefoneBR(numero: string): string {
  const m = numero.replace(/\D/g, '').match(/^(?:55)?(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : numero;
}

/** Link que abre uma conversa no WhatsApp com a mensagem já escrita. */
export function linkWhatsApp(texto: string, numero?: string | null): string {
  const base = numero ? `https://wa.me/${numero.replace(/\D/g, '')}` : 'https://wa.me/';
  return `${base}?text=${encodeURIComponent(texto)}`;
}
