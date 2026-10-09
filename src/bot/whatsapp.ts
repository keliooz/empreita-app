import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ConfigWhatsApp } from '@/config';
import type { Canal, MensagemEntrada } from './tipos';

/** Falha ao entregar a resposta (a mensagem recebida já foi processada). */
export class ErroWhatsApp extends Error {}

/** Envia mensagens pela WhatsApp Cloud API (Graph API da Meta). */
export class CanalWhatsApp implements Canal {
  constructor(private readonly cfg: ConfigWhatsApp) {}

  private async enviar(corpo: Record<string, unknown>): Promise<void> {
    const url = `https://graph.facebook.com/${this.cfg.graphVersion}/${this.cfg.phoneNumberId}/messages`;
    let resp: Response;
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.cfg.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', ...corpo }),
      });
    } catch (err) {
      throw new ErroWhatsApp(`Sem conexão com a API do WhatsApp: ${String(err)}`);
    }
    if (!resp.ok) {
      const detalhe = await resp.text().catch(() => '');
      throw new ErroWhatsApp(`WhatsApp respondeu ${resp.status}: ${detalhe.slice(0, 500)}`);
    }
  }

  async enviarTexto(para: string, texto: string) {
    // O limite da API é 4096 caracteres por mensagem de texto.
    for (const parte of dividirTexto(texto, 4000)) {
      await this.enviar({ to: para, type: 'text', text: { body: parte, preview_url: false } });
    }
  }

  async enviarDocumento(para: string, d: { url: string; nomeArquivo: string; legenda?: string }) {
    await this.enviar({ to: para, type: 'document', document: { link: d.url, filename: d.nomeArquivo, caption: d.legenda } });
  }
}

export function dividirTexto(texto: string, max: number): string[] {
  if (texto.length <= max) return [texto];
  const partes: string[] = [];
  let resto = texto;
  while (resto.length > max) {
    let corte = resto.lastIndexOf('\n', max);
    if (corte < max / 2) corte = max;
    partes.push(resto.slice(0, corte));
    resto = resto.slice(corte).replace(/^\n/, '');
  }
  if (resto) partes.push(resto);
  return partes;
}

/** Confere o cabeçalho X-Hub-Signature-256 (HMAC-SHA256 do corpo cru com o App Secret). */
export function assinaturaValida(corpoCru: string, cabecalho: string | null, appSecret: string): boolean {
  if (!cabecalho?.startsWith('sha256=')) return false;
  const esperado = createHmac('sha256', appSecret).update(corpoCru, 'utf8').digest('hex');
  const recebido = cabecalho.slice('sha256='.length);
  if (recebido.length !== esperado.length) return false;
  return timingSafeEqual(Buffer.from(recebido, 'hex'), Buffer.from(esperado, 'hex'));
}

interface WebhookMeta {
  object?: string;
  entry?: {
    changes?: {
      field?: string;
      value?: {
        contacts?: { wa_id?: string; profile?: { name?: string } }[];
        messages?: {
          id: string;
          from: string;
          type: string;
          text?: { body?: string };
          image?: { id?: string; caption?: string };
          document?: { id?: string; caption?: string; mime_type?: string };
          interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
          button?: { text?: string };
        }[];
      };
    }[];
  }[];
}

/** Extrai as mensagens de um webhook da Meta. Atualizações de status (entregue, lida) são ignoradas. */
export function lerWebhook(corpo: unknown): MensagemEntrada[] {
  const w = corpo as WebhookMeta;
  if (w?.object !== 'whatsapp_business_account') return [];
  const saida: MensagemEntrada[] = [];
  for (const entrada of w.entry ?? []) {
    for (const mudanca of entrada.changes ?? []) {
      const valor = mudanca.value;
      if (!valor?.messages) continue;
      const nomes = new Map((valor.contacts ?? []).map((c) => [c.wa_id ?? '', c.profile?.name]));
      for (const m of valor.messages) {
        const base = { id: m.id, de: m.from, nomePerfil: nomes.get(m.from) ?? undefined };
        if (m.type === 'text' && m.text?.body) saida.push({ ...base, tipo: 'texto', texto: m.text.body });
        else if (m.type === 'image' && m.image?.id) saida.push({ ...base, tipo: 'imagem', mediaId: m.image.id, legenda: m.image.caption });
        else if (m.type === 'document' && m.document?.id && /^image\/|pdf/.test(m.document.mime_type ?? '')) {
          saida.push({ ...base, tipo: 'imagem', mediaId: m.document.id, legenda: m.document.caption });
        } else if (m.type === 'interactive') {
          const titulo = m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title;
          saida.push(titulo ? { ...base, tipo: 'texto', texto: titulo } : { ...base, tipo: 'outro' });
        } else if (m.type === 'button' && m.button?.text) saida.push({ ...base, tipo: 'texto', texto: m.button.text });
        else saida.push({ ...base, tipo: 'outro' });
      }
    }
  }
  return saida;
}
