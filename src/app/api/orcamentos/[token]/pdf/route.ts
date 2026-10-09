import { NextResponse } from 'next/server';
import { obraPorToken } from '@/bot/repo';
import { getDb } from '@/db/client';
import { gerarPdfOrcamento } from '@/pdf/orcamento-pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** PDF do orçamento. O WhatsApp baixa daqui quando o bot manda o documento. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const obra = await obraPorToken(await getDb(), token);
  if (!obra) return new NextResponse('Orçamento não encontrado', { status: 404 });
  const pdf = await gerarPdfOrcamento(obra);
  const nome = `Orcamento-${String(obra.obra.numero).padStart(4, '0')}.pdf`;
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${nome}"`,
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex',
    },
  });
}
