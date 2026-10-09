import Link from 'next/link';
import { configWhatsApp, simuladorAtivo } from '@/config';

export const dynamic = 'force-dynamic';

export default function Inicio() {
  const whatsapp = Boolean(configWhatsApp());
  const simulador = simuladorAtivo();
  return (
    <main className="pagina" style={{ maxWidth: 640 }}>
      <p className="eyebrow">Empreita</p>
      <h1 style={{ fontSize: 'clamp(2.6rem, 9vw, 4rem)' }}>Sua obra organizada pelo WhatsApp</h1>
      <p className="muted">
        Este é o servidor do bot. Os profissionais usam tudo pelo WhatsApp; os clientes recebem o link do orçamento.
      </p>
      {simulador && (
        <>
          <ul className="cartao" style={{ listStyle: 'none', margin: 0 }}>
            <li>
              WhatsApp:{' '}
              <span className={`chip ${whatsapp ? 'ok' : 'warn'}`}>{whatsapp ? 'configurado' : 'faltam as credenciais da Meta'}</span>
            </li>
            <li>
              Banco: <span className="chip neutro">{process.env.DATABASE_URL ? 'Postgres' : 'local (.pglite)'}</span>
            </li>
          </ul>
          <p>
            <Link className="btn btn-primario" href="/simulador">
              Abrir o simulador
            </Link>
          </p>
        </>
      )}
    </main>
  );
}
