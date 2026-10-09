'use client';

import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';

type Saida =
  | { tipo: 'texto'; texto: string }
  | { tipo: 'documento'; url: string; nomeArquivo: string; legenda?: string };

interface Bolha {
  id: number;
  de: 'eu' | 'bot';
  conteudo: Saida | { tipo: 'foto'; legenda?: string };
  hora: string;
}

const hora = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
let proximoId = 1;

/** Converte *negrito*, _itálico_ e links do WhatsApp em elementos, sem HTML cru. */
function formatar(texto: string): ReactNode[] {
  const partes = texto.split(/(https?:\/\/\S+|\*[^*\n]+\*|_[^_\n]+_)/g);
  return partes.map((p, i) => {
    if (/^https?:\/\//.test(p)) {
      return (
        <a key={i} href={p} target="_blank" rel="noopener noreferrer" style={{ wordBreak: 'break-all' }}>
          {p.length > 70 ? `${p.slice(0, 70)}…` : p}
        </a>
      );
    }
    if (/^\*[^*]+\*$/.test(p)) return <strong key={i}>{p.slice(1, -1)}</strong>;
    if (/^_[^_]+_$/.test(p)) return <em key={i}>{p.slice(1, -1)}</em>;
    return <Fragment key={i}>{p}</Fragment>;
  });
}

export function Simulador() {
  const [numero, setNumero] = useState('5562900000001');
  const [nome, setNome] = useState('Carlos Souza');
  const [texto, setTexto] = useState('');
  const [legenda, setLegenda] = useState('');
  const [bolhas, setBolhas] = useState<Bolha[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const log = useRef<HTMLDivElement>(null);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [bolhas, enviando]);

  async function enviar(corpo: { tipo: 'texto'; texto: string } | { tipo: 'imagem'; legenda?: string }) {
    setErro('');
    setEnviando(true);
    setBolhas((b) => [
      ...b,
      { id: proximoId++, de: 'eu', hora: hora(), conteudo: corpo.tipo === 'texto' ? { tipo: 'texto', texto: corpo.texto } : { tipo: 'foto', legenda: corpo.legenda } },
    ]);
    try {
      const resp = await fetch('/api/simulador', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ de: numero.replace(/\D/g, ''), nomePerfil: nome || undefined, ...corpo }),
      });
      if (!resp.ok) throw new Error(`O servidor respondeu ${resp.status}`);
      const dados = (await resp.json()) as { saidas: (Saida & { para: string })[] };
      setBolhas((b) => [...b, ...dados.saidas.map((s) => ({ id: proximoId++, de: 'bot' as const, hora: hora(), conteudo: s }))]);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao enviar');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <label style={{ display: 'grid', gap: 4, fontWeight: 700, fontSize: '0.9rem' }}>
          Seu número (simulado)
          <input className="campo" id="sim-numero" value={numero} onChange={(e) => setNumero(e.target.value)} inputMode="numeric" />
        </label>
        <label style={{ display: 'grid', gap: 4, fontWeight: 700, fontSize: '0.9rem' }}>
          Nome no perfil
          <input className="campo" id="sim-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
        </label>
      </div>

      <div className="sim-zap">
        <div className="sim-topo">
          <span className="sim-avatar">E</span>
          <div>
            <strong>Empreita</strong>
            <small>{enviando ? 'digitando…' : 'online'}</small>
          </div>
        </div>
        <div className="sim-log" ref={log} role="log" aria-label="Conversa">
          {bolhas.length === 0 && <p className="sim-vazio">Mande um “oi” para começar o cadastro.</p>}
          {bolhas.map((b) => (
            <div key={b.id} className={`sim-msg ${b.de}`}>
              {b.conteudo.tipo === 'texto' && <span className="sim-txt">{formatar(b.conteudo.texto)}</span>}
              {b.conteudo.tipo === 'foto' && (
                <span className="sim-txt">
                  <span className="sim-nota" aria-hidden="true" />
                  Foto da nota{b.conteudo.legenda ? `: ${b.conteudo.legenda}` : ''}
                </span>
              )}
              {b.conteudo.tipo === 'documento' && (
                <a className="sim-doc" href={b.conteudo.url} target="_blank" rel="noopener noreferrer">
                  <span className="sim-doc-icone">PDF</span>
                  <span>
                    <strong>{b.conteudo.nomeArquivo}</strong>
                    {b.conteudo.legenda && <small>{b.conteudo.legenda}</small>}
                  </span>
                </a>
              )}
              <span className="sim-hora">{b.hora}</span>
            </div>
          ))}
        </div>
        <form
          className="sim-entrada"
          onSubmit={(e) => {
            e.preventDefault();
            if (!texto.trim() || enviando) return;
            const t = texto;
            setTexto('');
            void enviar({ tipo: 'texto', texto: t });
          }}
        >
          <label htmlFor="sim-texto" className="sr-only">
            Mensagem
          </label>
          <input id="sim-texto" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Mensagem" autoComplete="off" />
          <button type="submit" disabled={enviando} aria-label="Enviar">
            ➤
          </button>
        </form>
      </div>

      <form
        style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }}
        onSubmit={(e) => {
          e.preventDefault();
          if (enviando) return;
          void enviar({ tipo: 'imagem', legenda: legenda.trim() || undefined });
          setLegenda('');
        }}
      >
        <label style={{ display: 'grid', gap: 4, fontWeight: 700, fontSize: '0.9rem', flex: '1 1 200px' }}>
          Legenda da foto (opcional)
          <input className="campo" id="sim-legenda" value={legenda} onChange={(e) => setLegenda(e.target.value)} placeholder="Ex.: 89,90 cimento" />
        </label>
        <button type="submit" className="btn" disabled={enviando}>
          Enviar foto de nota
        </button>
      </form>
      {erro && (
        <p role="alert" style={{ color: 'var(--warn)' }}>
          {erro}
        </p>
      )}

      <style>{`
        .sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}
        .campo{font:inherit;font-size:16px;font-weight:400;padding:10px 12px;border:1.5px solid var(--line);border-radius:6px;background:var(--paper);color:var(--ink);min-width:0}
        .sim-zap{border:1px solid var(--line);border-radius:12px;overflow:hidden;background:var(--zap-bg);display:flex;flex-direction:column}
        .sim-topo{display:flex;gap:10px;align-items:center;padding:10px 14px;background:var(--zap-head);color:var(--zap-head-ink)}
        .sim-topo strong{display:block;line-height:1.2}
        .sim-topo small{display:block;font-size:.78rem;opacity:.85}
        .sim-avatar{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:var(--trena);color:var(--trena-ink);font:800 1.05rem/1 var(--f-display)}
        .sim-log{height:min(62vh,560px);overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:6px}
        .sim-vazio{margin:auto;color:var(--muted);font-size:.92rem}
        .sim-msg{position:relative;max-width:88%;padding:7px 10px 20px;border-radius:9px;background:var(--zap-in);font-size:.95rem;line-height:1.42;box-shadow:0 1px 0 rgba(0,0,0,.08);overflow-wrap:anywhere}
        .sim-msg.eu{align-self:flex-end;background:var(--zap-out)}
        .sim-msg.bot{align-self:flex-start}
        .sim-txt{white-space:pre-wrap;display:block}
        .sim-hora{position:absolute;right:8px;bottom:4px;font:500 .68rem/1 var(--f-mono);color:var(--muted)}
        .sim-nota{display:block;width:120px;height:72px;margin-bottom:6px;border-radius:6px;border:1px solid var(--line);background:repeating-linear-gradient(to bottom,var(--paper) 0 8px,var(--line) 8px 10px)}
        .sim-doc{display:flex;gap:10px;align-items:center;text-decoration:none;color:var(--ink)}
        .sim-doc small{display:block;color:var(--muted);font-size:.8rem}
        .sim-doc-icone{display:grid;place-items:center;width:40px;height:48px;border-radius:4px;background:#c0392b;color:#fff;font:700 .72rem/1 var(--f-mono)}
        .sim-entrada{display:flex;gap:8px;padding:10px 12px}
        .sim-entrada input{flex:1;min-width:0;font:inherit;font-size:16px;padding:11px 14px;border-radius:999px;border:1px solid var(--line);background:var(--zap-in);color:var(--ink)}
        .sim-entrada button{width:46px;height:46px;border-radius:50%;border:0;background:var(--zap-btn);color:var(--zap-btn-ink);font-size:1.1rem;cursor:pointer}
        .sim-entrada button:disabled,.btn:disabled{opacity:.6;cursor:wait}
      `}</style>
    </section>
  );
}
