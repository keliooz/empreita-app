import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { simuladorAtivo } from '@/config';
import { Simulador } from './Simulador';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Simulador', robots: { index: false } };

export default function PaginaSimulador() {
  if (!simuladorAtivo()) notFound();
  return (
    <main className="pagina" style={{ maxWidth: 560 }}>
      <header style={{ display: 'grid', gap: 8 }}>
        <p className="eyebrow">Ambiente de teste</p>
        <h1 style={{ fontSize: '2.6rem' }}>Simulador do WhatsApp</h1>
        <p className="muted">
          Converse com o bot como se fosse um profissional. As mensagens passam pelo mesmo código do webhook e ficam salvas no banco
          de desenvolvimento.
        </p>
      </header>
      <Simulador />
    </main>
  );
}
