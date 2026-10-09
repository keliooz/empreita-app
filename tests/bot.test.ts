import { createHmac } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { processarMensagem } from '@/bot/processar';
import { CanalMemoria, type Contexto, type MensagemEntrada } from '@/bot/tipos';
import { assinaturaValida, dividirTexto, lerWebhook } from '@/bot/whatsapp';
import { crc16 } from '@/core/pix';
import { bancoDeTeste } from './ajuda-db';

const PRO = '5562986014789';
type SemIdDe<T> = T extends unknown ? Omit<T, 'id' | 'de'> : never;
let seq = 0;

function conversa(ctx: Contexto, de = PRO) {
  const canal = ctx.canal as CanalMemoria;
  const enviar = async (m: SemIdDe<MensagemEntrada> & { id?: string }) => {
    const antes = canal.saidas.length;
    await processarMensagem(ctx, { ...m, id: m.id ?? `wamid.${++seq}`, de } as MensagemEntrada);
    return canal.saidas.slice(antes);
  };
  const texto = async (t: string, id?: string) => {
    const saidas = await enviar({ tipo: 'texto', texto: t, id });
    return saidas.map((s) => (s.tipo === 'texto' ? s.texto : `[documento ${s.nomeArquivo} ${s.url}]`));
  };
  return { enviar, texto };
}

describe('conversa completa com o bot', () => {
  let ctx: Contexto;
  let fala: ReturnType<typeof conversa>;

  beforeAll(async () => {
    ctx = { db: await bancoDeTeste(), canal: new CanalMemoria(), appUrl: 'https://app.exemplo.com', testadores: null };
    fala = conversa(ctx);
  });

  it('faz o cadastro com nome do perfil, cidade e Pix', async () => {
    const [boasVindas] = (await fala.enviar({ tipo: 'texto', texto: 'oi', nomePerfil: 'carlos souza' })).map((s) => (s.tipo === 'texto' ? s.texto : ''));
    expect(boasVindas).toContain('Posso te chamar de *Carlos Souza*?');
    expect((await fala.texto('sim'))[0]).toContain('Em que cidade');
    expect((await fala.texto('goiânia'))[0]).toContain('chave Pix');
    const [fim] = await fala.texto('62986014789');
    expect(fim).toContain('Chave Pix salva: celular +5562986014789');
    expect(fim).toContain('*orçamento*');
  });

  it('monta o orçamento guiado e envia o PDF', async () => {
    expect((await fala.texto('orçamento'))[0]).toContain('Qual é o serviço?');
    expect((await fala.texto('1'))[0]).toContain('área em m²');
    expect((await fala.texto('32'))[0]).toContain('R$ 60,00');
    expect((await fala.texto('ok'))[0]).toContain('Quem compra o material?');
    expect((await fala.texto('1'))[0]).toContain('nome do cliente');
    expect((await fala.texto('dona célia'))[0]).toContain('WhatsApp de Dona Célia');
    const [conf] = await fala.texto('62 99999-0000');
    expect(conf).toContain('Total: *R$ 1.920,00*');
    expect(conf).toContain('Prazo: 4 dias');
    const saidas = await fala.texto('sim');
    expect(saidas[0]).toBe('[documento Orcamento-0001.pdf https://app.exemplo.com/api/orcamentos/' + saidas[0]!.split('/orcamentos/')[1]);
    expect(saidas[0]).toMatch(/\/api\/orcamentos\/[A-Za-z0-9_-]+\/pdf\]$/);
    expect(saidas[1]).toContain('Orçamento *nº 0001* criado');
    expect(saidas[1]).toContain('https://wa.me/5562999990000?text=');
  });

  it('lança recebimento, gastos e foto de nota com o lucro atualizado', async () => {
    const [rec] = await fala.texto('recebi 576 de entrada');
    expect(rec).toContain('Recebimento de *R$ 576,00* lançado');
    expect(rec).toContain('Etapa *Entrada* quitada.');
    expect(rec).toContain('Falta receber R$ 1.344,00.');
    expect(rec).toContain('em andamento');

    expect((await fala.texto('150 diária ajudante'))[0]).toBe(
      'Lançado em *Mão de obra*: Diária ajudante, R$ 150,00.\nLucro previsto da obra: *R$ 1.770,00* (92%).',
    );

    const [pergunta] = (await fala.enviar({ tipo: 'imagem', mediaId: 'MEDIA1' })).map((s) => (s.tipo === 'texto' ? s.texto : ''));
    expect(pergunta).toContain('Qual é o valor total');
    expect((await fala.texto('89,90'))[0]).toBe('Nota lançada em *Material*: Nota da loja, R$ 89,90.\nLucro previsto da obra: *R$ 1.680,10* (88%).');

    expect((await fala.texto('86 gasolina'))[0]).toContain('*R$ 1.594,10* (83%)');
  });

  it('mostra o resumo e o extrato', async () => {
    const [res] = await fala.texto('resumo');
    expect(res).toContain('Gastos: R$ 325,90');
    expect(res).toContain('   Mão de obra: R$ 150,00');
    expect(res).toContain('Recebido: R$ 576,00 · Falta receber: R$ 1.344,00');
    const [ext] = await fala.texto('extrato');
    expect(ext).toContain('-R$ 89,90  Nota da loja (nota)');
  });

  it('gera a cobrança da próxima etapa com Pix válido', async () => {
    const [instrucao, paraCliente] = await fala.texto('cobrar');
    expect(instrucao).toContain('Próxima etapa: *Metade do serviço* · R$ 768,00');
    expect(instrucao).toContain('https://wa.me/5562999990000?text=');
    expect(instrucao).toContain('*recebi 768*');
    const pix = paraCliente!.split('\n').find((l) => l.startsWith('000201'))!;
    expect(pix).toContain('0114+5562986014789');
    expect(pix).toContain('5406768.00');
    expect(pix).toContain('6007Goiania');
    expect(pix.slice(-4)).toBe(crc16(pix.slice(0, -4)));
  });

  it('desfaz o último lançamento', async () => {
    expect((await fala.texto('desfazer'))[0]).toContain('Apaguei: Gasolina, R$ 86,00.');
  });

  it('ignora a mesma mensagem reenviada pela Meta', async () => {
    expect(await fala.texto('50 almoço', 'wamid.repetido')).toHaveLength(1);
    expect(await fala.texto('50 almoço', 'wamid.repetido')).toHaveLength(0);
  });

  it('cria uma segunda obra e troca a obra ativa', async () => {
    await fala.texto('orçamento');
    await fala.texto('4');
    await fala.texto('troca de fiação');
    await fala.texto('1');
    expect((await fala.texto('2.500'))[0]).toContain('nome do cliente');
    await fala.texto('seu joão');
    const [conf] = await fala.texto('pular');
    expect(conf).toContain('Total: *R$ 2.500,00*');
    expect(conf).not.toContain('m²');
    await fala.texto('sim');
    const [lista] = await fala.texto('obras');
    expect(lista).toContain('2. Troca de fiação · Seu João · orçamento  ← ativa');
    expect(lista).toContain('1. Assentamento de piso · Dona Célia · em andamento');
    expect((await fala.texto('obra 1'))[0]).toContain('Obra ativa agora: *Assentamento de piso · Dona Célia*');
  });

  it('pergunta se 11 dígitos são CPF ou celular quando os dois fecham', async () => {
    // 52998224725 é CPF válido e também tem formato de celular (DDD 52, começa com 9)
    expect((await fala.texto('pix 52998224725'))[0]).toContain('*CPF* ou o seu *celular*');
    expect((await fala.texto('1'))[0]).toBe('Chave Pix salva: CPF 52998224725.');
  });

  it('responde com ajuda quando não entende', async () => {
    expect((await fala.texto('bla bla'))[0]).toContain('Não entendi');
  });
});

describe('teste fechado', () => {
  it('só atende os números liberados', async () => {
    const ctx: Contexto = { db: await bancoDeTeste(), canal: new CanalMemoria(), appUrl: 'http://x', testadores: ['5562988887777'] };
    const [r] = await conversa(ctx, '5511912345678').texto('oi');
    expect(r).toContain('teste fechado');
    // número liberado, mesmo chegando sem o 9 extra
    const [ok] = await conversa(ctx, '556288887777').texto('oi');
    expect(ok).toContain('Eu sou a *Empreita*');
  });
});

describe('webhook da Meta', () => {
  it('valida a assinatura', () => {
    const corpo = '{"a":1}';
    const sig = 'sha256=' + createHmac('sha256', 'segredo').update(corpo).digest('hex');
    expect(assinaturaValida(corpo, sig, 'segredo')).toBe(true);
    expect(assinaturaValida(corpo, sig, 'outro')).toBe(false);
    expect(assinaturaValida(corpo, null, 'segredo')).toBe(false);
  });

  it('extrai texto, imagem e ignora status', () => {
    const corpo = {
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              field: 'messages',
              value: {
                contacts: [{ wa_id: '5562986014789', profile: { name: 'Carlos' } }],
                messages: [
                  { id: 'w1', from: '5562986014789', type: 'text', text: { body: '150 ajudante' } },
                  { id: 'w2', from: '5562986014789', type: 'image', image: { id: 'm1', caption: '89,90' } },
                  { id: 'w3', from: '5562986014789', type: 'sticker' },
                ],
              },
            },
            { field: 'messages', value: { statuses: [{ id: 'x', status: 'read' }] } },
          ],
        },
      ],
    };
    expect(lerWebhook(corpo)).toEqual([
      { id: 'w1', de: '5562986014789', nomePerfil: 'Carlos', tipo: 'texto', texto: '150 ajudante' },
      { id: 'w2', de: '5562986014789', nomePerfil: 'Carlos', tipo: 'imagem', mediaId: 'm1', legenda: '89,90' },
      { id: 'w3', de: '5562986014789', nomePerfil: 'Carlos', tipo: 'outro' },
    ]);
    expect(lerWebhook({ object: 'page' })).toEqual([]);
  });

  it('divide textos longos', () => {
    const partes = dividirTexto(`${'a'.repeat(30)}\n${'b'.repeat(30)}`, 40);
    expect(partes).toEqual(['a'.repeat(30), 'b'.repeat(30)]);
  });
});
