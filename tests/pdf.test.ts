import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import * as repo from '@/bot/repo';
import { gerarPdfOrcamento, textoSeguro } from '@/pdf/orcamento-pdf';
import { bancoDeTeste } from './ajuda-db';

describe('PDF do orçamento', () => {
  it('troca caracteres que a fonte do PDF não tem', () => {
    expect(textoSeguro('Dona Célia 🏠 “casa” – 32 m²')).toBe('Dona Célia  "casa" - 32 m²');
  });

  it('gera um PDF válido com materiais e nome com emoji', async () => {
    const db = await bancoDeTeste();
    const p = await repo.criarProfissional(db, '5562986014789');
    await repo.atualizarProfissional(db, p.id, { nome: 'Carlos Souza', cidade: 'Goiânia', pixTipo: 'celular', pixChave: '+5562986014789' });
    const prof = (await repo.buscarProfissional(db, p.waId))!;
    const obra = await repo.criarObra(db, prof, {
      entrada: { servico: 'alvenaria', areaM2: 48, precoM2: 5500, materialPorConta: true },
      clienteNome: 'Seu Zé 👷',
      clienteTelefone: '5562999990000',
    });
    const completa = (await repo.carregarObra(db, obra.id))!;
    const bytes = await gerarPdfOrcamento(completa);
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-');
    const lido = await PDFDocument.load(bytes);
    expect(lido.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(lido.getTitle()).toBe('Orçamento 0001 - Seu Zé ');
  });
});
