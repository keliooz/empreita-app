/** Minúsculas, sem acento e com espaços simples, para comparar comandos digitados de qualquer jeito. */
export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Remove tudo que não é letra ou número ASCII (usado em campos do Pix). */
export function somenteAscii(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7e]/g, '');
}

export function primeiraMaiuscula(texto: string): string {
  const t = texto.trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

/** "joão da silva" -> "João da Silva" (preposições ficam minúsculas). */
export function nomeProprio(texto: string): string {
  const minusculas = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);
  return texto
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((p, i) => {
      const baixa = p.toLowerCase();
      if (i > 0 && minusculas.has(baixa)) return baixa;
      return baixa.charAt(0).toUpperCase() + baixa.slice(1);
    })
    .join(' ');
}

/** Lê números escritos como "32", "32,5", "32.5", "32m2" ou "32 m²". */
export function lerNumero(texto: string): number | null {
  const m = texto.replace(/\s/g, '').match(/^(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)/);
  if (!m || !m[1]) return null;
  let v = m[1];
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(v)) v = v.replace(/\./g, '').replace(',', '.');
  else v = v.replace(',', '.');
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
