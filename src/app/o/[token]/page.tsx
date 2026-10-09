import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { obraPorToken } from '@/bot/repo';
import { pixDaEtapa } from '@/bot/textos';
import { formatarNumero, formatarReais as r } from '@/core/dinheiro';
import { totalDoItem } from '@/core/orcamento';
import { SERVICOS, type ServicoId } from '@/core/servicos';
import { formatarTelefoneBR } from '@/core/telefone';
import { getDb } from '@/db/client';
import { CopiarPix } from './CopiarPix';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Orçamento',
  robots: { index: false, follow: false },
};

/** Página que o cliente abre pelo link: orçamento, lista de material e Pix da próxima etapa. */
export default async function PaginaOrcamento({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const c = await obraPorToken(await getDb(), token);
  if (!c) notFound();
  const { obra, profissional: p, materiais, resumo } = c;
  const servico = SERVICOS[obra.servico as ServicoId] ?? SERVICOS.outro;
  const porMetro = !(obra.servico === 'outro' && obra.areaM2 === 1);
  const numero = String(obra.numero).padStart(4, '0');
  const data = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: 'America/Sao_Paulo' }).format(obra.criadoEm);
  const proxima = resumo.proxima;
  const pix = proxima ? pixDaEtapa(obra, p, proxima) : null;

  return (
    <main className="pagina">
      <header style={{ display: 'grid', gap: 10 }}>
        <p className="eyebrow">
          Orçamento nº {numero} · {data}
        </p>
        <h1 style={{ fontSize: 'clamp(2.4rem, 8vw, 3.6rem)' }}>{obra.descricaoServico ?? servico.nome}</h1>
        <p className="muted">
          Para <strong style={{ color: 'var(--ink)' }}>{obra.clienteNome}</strong>, por{' '}
          <strong style={{ color: 'var(--ink)' }}>{p.nome ?? 'profissional'}</strong>
          {p.cidade ? ` · ${p.cidade}` : ''}
        </p>
      </header>

      <section className="cartao" aria-labelledby="itens">
        <h2 id="itens" style={{ fontSize: '1.6rem' }}>
          O que está incluído
        </h2>
        <dl style={{ display: 'grid', gap: 4, margin: 0 }}>
          {porMetro && (
            <div style={{ display: 'flex', gap: 8 }}>
              <dt className="muted">Área:</dt>
              <dd style={{ margin: 0 }}>{formatarNumero(obra.areaM2)} m²</dd>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <dt className="muted">Prazo estimado:</dt>
            <dd style={{ margin: 0 }}>
              {obra.dias} {obra.dias === 1 ? 'dia' : 'dias'} de trabalho
            </dd>
          </div>
        </dl>
        <div className="tabela-wrap">
          <table className="tabela">
            <thead>
              <tr>
                <th scope="col">Item</th>
                <th scope="col" className="num">
                  Qtd.
                </th>
                <th scope="col" className="num">
                  Valor
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{porMetro ? `Mão de obra (${r(obra.precoM2)} por m²)` : 'Mão de obra'}</td>
                <td className="num">{porMetro ? `${formatarNumero(obra.areaM2)} m²` : '1'}</td>
                <td className="num">{r(obra.maoDeObra)}</td>
              </tr>
              {materiais.length > 0 && (
                <tr className="sub">
                  <th colSpan={3} scope="rowgroup">
                    {obra.materialPorConta ? 'Material incluso no serviço' : 'Lista de material para comprar na loja'}
                  </th>
                </tr>
              )}
              {materiais.map((m) => (
                <tr key={m.id}>
                  <td>{m.nome}</td>
                  <td className="num">
                    {formatarNumero(m.quantidade)} {m.unidade}
                  </td>
                  <td className="num">
                    {m.precoUnitario == null ? <span className="muted">você escolhe</span> : r(totalDoItem({ ...m, precoUnitario: m.precoUnitario }))}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              {materiais.length > 0 && !obra.materialPorConta && (
                <tr>
                  <td colSpan={2} className="muted">
                    Material estimado (você paga direto na loja)
                  </td>
                  <td className="num muted">{r(obra.totalMateriais)}</td>
                </tr>
              )}
              <tr className="total">
                <td colSpan={2}>Total do orçamento</td>
                <td className="num">{r(obra.valorFechado)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="muted" style={{ fontSize: '0.88rem' }}>
          Quantidades e preços de material são estimativas e podem variar conforme a obra e a loja.
        </p>
      </section>

      <section className="cartao" aria-labelledby="pagamento">
        <h2 id="pagamento" style={{ fontSize: '1.6rem' }}>
          Pagamento em etapas
        </h2>
        <ol className="etapas">
          {resumo.etapas.map((e) => {
            const atual = proxima?.ordem === e.ordem;
            return (
              <li key={e.ordem} className={`etapa${atual ? ' atual' : ''}`}>
                <div>
                  <strong>{e.nome}</strong>
                  <div className="muted mono" style={{ fontSize: '0.88rem' }}>
                    {Math.round(e.pontosBase / 100)}% · {r(e.valor)}
                  </div>
                </div>
                {e.status === 'paga' ? (
                  <span className="chip ok">Paga</span>
                ) : e.status === 'parcial' ? (
                  <span className="chip warn">Falta {r(e.falta)}</span>
                ) : (
                  <span className={`chip ${atual ? 'warn' : 'neutro'}`}>{atual ? 'Próxima' : 'A pagar'}</span>
                )}
                {atual && pix && (
                  <div className="pix">
                    <p style={{ marginBottom: 8 }}>
                      Pague {r(e.falta)} com o Pix copia e cola:
                    </p>
                    <CopiarPix codigo={pix} />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
        {!proxima && <p>Tudo pago. Obrigado!</p>}
      </section>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <a className="btn" href={`/api/orcamentos/${obra.token}/pdf`}>
          Baixar PDF
        </a>
        <a className="btn btn-zap" href={`https://wa.me/${p.waId}`} target="_blank" rel="noopener noreferrer">
          Falar com {p.nome?.split(' ')[0] ?? 'o profissional'} · {formatarTelefoneBR(p.waId)}
        </a>
      </div>

      <footer className="muted" style={{ fontSize: '0.85rem' }}>
        Feito com Empreita
      </footer>
    </main>
  );
}
