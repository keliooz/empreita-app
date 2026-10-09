'use client';

import { useRef, useState } from 'react';

/** Mostra o Pix copia e cola com um botão de copiar. Se o navegador não deixar copiar, seleciona o texto. */
export function CopiarPix({ codigo }: { codigo: string }) {
  const [aviso, setAviso] = useState('');
  const ref = useRef<HTMLPreElement>(null);

  const selecionar = () => {
    const el = ref.current;
    if (!el) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  };

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(codigo);
      setAviso('Código copiado. Agora é só colar no app do banco, na opção Pix copia e cola.');
    } catch {
      selecionar();
      setAviso('Selecionei o código. Use a opção Copiar do seu celular.');
    }
  };

  return (
    <div className="pix-caixa">
      <pre className="pix-codigo" ref={ref}>
        {codigo}
      </pre>
      <button type="button" className="btn btn-primario" onClick={copiar}>
        Copiar código Pix
      </button>
      <p className="muted" role="status" style={{ fontSize: '0.9rem' }}>
        {aviso}
      </p>
    </div>
  );
}
