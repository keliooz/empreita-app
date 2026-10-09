import { after, NextResponse } from 'next/server';
import { appUrl, configWhatsApp, testadores } from '@/config';
import { processarMensagem } from '@/bot/processar';
import { assinaturaValida, CanalWhatsApp, ErroWhatsApp, lerWebhook } from '@/bot/whatsapp';
import { getDb } from '@/db/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Verificação do webhook: a Meta chama com hub.challenge ao salvar a URL no painel. */
export async function GET(req: Request) {
  const cfg = configWhatsApp();
  if (!cfg) return new NextResponse('WhatsApp não configurado', { status: 503 });
  const p = new URL(req.url).searchParams;
  if (p.get('hub.mode') === 'subscribe' && p.get('hub.verify_token') === cfg.verifyToken) {
    return new NextResponse(p.get('hub.challenge') ?? '', { status: 200, headers: { 'Content-Type': 'text/plain' } });
  }
  return new NextResponse('Token de verificação inválido', { status: 403 });
}

/** Mensagens recebidas. Respondemos 200 na hora e processamos em seguida, para a Meta não reenviar. */
export async function POST(req: Request) {
  const cfg = configWhatsApp();
  if (!cfg) return new NextResponse('WhatsApp não configurado', { status: 503 });

  const cru = await req.text();
  if (!assinaturaValida(cru, req.headers.get('x-hub-signature-256'), cfg.appSecret)) {
    return new NextResponse('Assinatura inválida', { status: 401 });
  }

  let corpo: unknown;
  try {
    corpo = JSON.parse(cru);
  } catch {
    return new NextResponse('JSON inválido', { status: 400 });
  }

  const mensagens = lerWebhook(corpo);
  if (mensagens.length) {
    after(async () => {
      const ctx = { db: await getDb(), canal: new CanalWhatsApp(cfg), appUrl: appUrl(), testadores: testadores() };
      for (const msg of mensagens) {
        try {
          await processarMensagem(ctx, msg);
        } catch (err) {
          console.error('Erro ao processar mensagem', msg.id, err);
          // Se o que falhou foi o envio da resposta, a mensagem já foi registrada: não pedir para reenviar.
          if (err instanceof ErroWhatsApp) continue;
          await ctx.canal
            .enviarTexto(msg.de, 'Tive um problema para registrar isso. Pode mandar de novo daqui a pouco?')
            .catch(() => undefined);
        }
      }
    });
  }
  return NextResponse.json({ ok: true });
}
