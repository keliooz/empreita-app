import type { DB } from '@/db/client';

/** Mensagem recebida, já separada do formato do webhook da Meta. */
export type MensagemEntrada =
  | { id: string; de: string; nomePerfil?: string; tipo: 'texto'; texto: string }
  | { id: string; de: string; nomePerfil?: string; tipo: 'imagem'; mediaId: string; legenda?: string }
  | { id: string; de: string; nomePerfil?: string; tipo: 'outro' };

/** Por onde o bot responde. Em produção é a WhatsApp Cloud API; no simulador e nos testes, uma lista em memória. */
export interface Canal {
  enviarTexto(para: string, texto: string): Promise<void>;
  enviarDocumento(para: string, documento: { url: string; nomeArquivo: string; legenda?: string }): Promise<void>;
}

export interface Contexto {
  db: DB;
  canal: Canal;
  appUrl: string;
  /** Números liberados no teste fechado; `null` libera todos. */
  testadores: string[] | null;
}

export type MensagemSaida =
  | { tipo: 'texto'; para: string; texto: string }
  | { tipo: 'documento'; para: string; url: string; nomeArquivo: string; legenda?: string };

/** Canal que só guarda o que seria enviado. Usado no simulador e nos testes. */
export class CanalMemoria implements Canal {
  saidas: MensagemSaida[] = [];
  async enviarTexto(para: string, texto: string) {
    this.saidas.push({ tipo: 'texto', para, texto });
  }
  async enviarDocumento(para: string, d: { url: string; nomeArquivo: string; legenda?: string }) {
    this.saidas.push({ tipo: 'documento', para, ...d });
  }
}
