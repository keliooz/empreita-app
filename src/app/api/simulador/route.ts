import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { appUrl, simuladorAtivo, testadores } from '@/config';
import { processarMensagem } from '@/bot/processar';
import { CanalMemoria, type MensagemEntrada } from '@/bot/tipos';
import { getDb } from '@/db/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Entrada = z.object({
  de: z.string().regex(/^\d{10,15}$/),
  nomePerfil: z.string().max(60).optional(),
  tipo: z.enum(['texto', 'imagem']),
  texto: z.string().max(1000).optional(),
  legenda: z.string().max(200).optional(),
});

/** Conversa com o bot sem passar pela Meta. Só existe fora de produção (ou com SIMULADOR_ATIVO=1). */
export async function POST(req: Request) {
  if (!simuladorAtivo()) return new NextResponse('Não encontrado', { status: 404 });
  const parse = Entrada.safeParse(await req.json().catch(() => null));
  if (!parse.success) return NextResponse.json({ erro: 'Mensagem inválida' }, { status: 400 });
  const e = parse.data;

  const id = `sim.${randomUUID()}`;
  const msg: MensagemEntrada =
    e.tipo === 'imagem'
      ? { id, de: e.de, nomePerfil: e.nomePerfil, tipo: 'imagem', mediaId: `sim-${randomUUID()}`, legenda: e.legenda || undefined }
      : { id, de: e.de, nomePerfil: e.nomePerfil, tipo: 'texto', texto: e.texto ?? '' };

  const canal = new CanalMemoria();
  await processarMensagem({ db: await getDb(), canal, appUrl: appUrl(), testadores: testadores() }, msg);
  return NextResponse.json({ saidas: canal.saidas });
}
