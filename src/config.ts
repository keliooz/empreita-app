import { normalizarTelefoneBR } from './core/telefone';

/** URL pública do app, usada nos links de orçamento e no PDF enviado pelo WhatsApp. */
export function appUrl(): string {
  return (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
}

/**
 * Lista de números liberados durante o teste fechado (TESTADORES=5562999990000,5562988880000).
 * Vazia ou ausente: qualquer número pode usar.
 */
export function testadores(): string[] | null {
  const bruto = process.env.TESTADORES?.trim();
  if (!bruto) return null;
  const lista = bruto
    .split(/[,;\s]+/)
    .map((n) => normalizarTelefoneBR(n))
    .filter((n): n is string => Boolean(n));
  return lista.length ? lista : null;
}

export interface ConfigWhatsApp {
  token: string;
  phoneNumberId: string;
  verifyToken: string;
  appSecret: string;
  graphVersion: string;
}

/** Credenciais da WhatsApp Cloud API. `null` enquanto não estiverem todas configuradas. */
export function configWhatsApp(): ConfigWhatsApp | null {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!token || !phoneNumberId || !verifyToken || !appSecret) return null;
  return { token, phoneNumberId, verifyToken, appSecret, graphVersion: process.env.WHATSAPP_GRAPH_VERSION || 'v23.0' };
}

/** O simulador permite falar com o bot sem a Meta. Fica desligado em produção, a não ser que SIMULADOR_ATIVO=1. */
export function simuladorAtivo(): boolean {
  if (process.env.SIMULADOR_ATIVO === '1') return true;
  if (process.env.SIMULADOR_ATIVO === '0') return false;
  return process.env.NODE_ENV !== 'production';
}
