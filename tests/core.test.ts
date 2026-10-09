import { describe, expect, it } from 'vitest';
import { formatarReais } from '@/core/dinheiro';
import { calcularOrcamento } from '@/core/orcamento';
import { dividirEtapas, etapasQuitadas, proximaEtapa, situacaoDasEtapas } from '@/core/etapas';
import { extrairValor, interpretarLancamento } from '@/core/mensagem';
import { classificarChavePix, crc16, gerarPixCopiaECola } from '@/core/pix';
import { arredondarParaCima } from '@/core/servicos';
import { lerNumero, nomeProprio } from '@/core/texto';

describe('dinheiro', () => {
  it('formata em reais com espaço comum', () => {
    expect(formatarReais(192000)).toBe('R$ 1.920,00');
    expect(formatarReais(8990)).toBe('R$ 89,90');
  });
});

describe('texto', () => {
  it('lê números do jeito que o profissional digita', () => {
    expect(lerNumero('32')).toBe(32);
    expect(lerNumero('32,5')).toBe(32.5);
    expect(lerNumero('32m2')).toBe(32);
    expect(lerNumero('32 m²')).toBe(32);
    expect(lerNumero('1.500')).toBe(1500);
    expect(lerNumero('abc')).toBeNull();
  });
  it('formata nomes próprios', () => {
    expect(nomeProprio('  joão DA silva ')).toBe('João da Silva');
  });
});

describe('orçamento', () => {
  it('calcula piso de 32 m² com material pago pelo cliente', () => {
    const o = calcularOrcamento({ servico: 'piso', areaM2: 32, precoM2: 6000, materialPorConta: false });
    expect(o.maoDeObra).toBe(192000);
    expect(o.valorFechado).toBe(192000);
    expect(o.dias).toBe(4);
    const piso = o.materiais[0]!;
    expect(piso.quantidade).toBe(35.2); // sem o erro de ponto flutuante que daria 35,3
    expect(o.materiais[1]!.quantidade).toBe(12); // 32 * 7 kg / 20 kg = 11,2 -> 12 sacos
    expect(o.totalMateriais).toBe(12 * 3890 + 13 * 1490 + 1 * 4990);
  });
  it('soma o material quando o profissional compra', () => {
    const o = calcularOrcamento({ servico: 'pintura', areaM2: 80, precoM2: 2500, materialPorConta: true });
    expect(o.valorFechado).toBe(o.maoDeObra + o.totalMateriais);
    expect(o.materiais[0]!.quantidade).toBe(4);
  });
  it('arredonda para cima sem erro de ponto flutuante', () => {
    expect(arredondarParaCima(32 * 1.1, 1)).toBe(35.2);
    expect(arredondarParaCima(11.2)).toBe(12);
    expect(arredondarParaCima(12)).toBe(12);
  });
});

describe('etapas de pagamento', () => {
  it('divide e fecha no centavo', () => {
    const e = dividirEtapas(100001);
    expect(e.map((x) => x.valor)).toEqual([30000, 40000, 30001]);
    expect(e.reduce((t, x) => t + x.valor, 0)).toBe(100001);
  });
  it('quita as etapas em ordem', () => {
    const e = dividirEtapas(192000);
    const s = situacaoDasEtapas(e, 57600 + 10000);
    expect(s.map((x) => x.status)).toEqual(['paga', 'parcial', 'aberta']);
    expect(proximaEtapa(s)?.falta).toBe(76800 - 10000);
    expect(etapasQuitadas(e, 0, 57600).map((x) => x.nome)).toEqual(['Entrada']);
  });
});

describe('leitura das mensagens', () => {
  it('acha o valor em vários formatos', () => {
    expect(extrairValor('150 diária ajudante')).toBe(15000);
    expect(extrairValor('R$ 1.500,00 de entrada')).toBe(150000);
    expect(extrairValor('gasolina 86,90')).toBe(8690);
    expect(extrairValor('gasolina 86.90')).toBe(8690);
    expect(extrairValor('recebi 2 mil')).toBe(200000);
    expect(extrairValor('recebi 1,5 mil')).toBe(150000);
    expect(extrairValor('2 diárias de 150 ajudante')).toBe(30000);
    expect(extrairValor('comprei cimento')).toBeNull();
  });
  it('separa gasto de recebimento e categoriza', () => {
    expect(interpretarLancamento('150 diária ajudante')).toEqual({
      tipo: 'lancamento', natureza: 'gasto', valor: 15000, categoria: 'Mão de obra', descricao: 'Diária ajudante',
    });
    expect(interpretarLancamento('120 frete do entulho')).toMatchObject({ categoria: 'Transporte', descricao: 'Frete do entulho' });
    expect(interpretarLancamento('80 aluguel da betoneira')).toMatchObject({ categoria: 'Ferramentas' });
    expect(interpretarLancamento('35 almoço da equipe')).toMatchObject({ categoria: 'Alimentação' });
    expect(interpretarLancamento('412,30 cimento e areia')).toMatchObject({ categoria: 'Material', valor: 41230 });
    expect(interpretarLancamento('recebi 576 de entrada')).toEqual({
      tipo: 'lancamento', natureza: 'recebimento', valor: 57600, descricao: 'Entrada do cliente',
    });
    expect(interpretarLancamento('paguei 150 ajudante')).toMatchObject({ natureza: 'gasto' });
    expect(interpretarLancamento('bom dia')).toEqual({ tipo: 'sem_valor' });
  });
});

describe('Pix copia e cola', () => {
  it('calcula o CRC16-CCITT-FALSE de referência', () => {
    expect(crc16('123456789')).toBe('29B1');
  });
  it('reproduz o exemplo do manual do Banco Central', () => {
    const codigo = gerarPixCopiaECola({
      chave: '123e4567-e12b-12d1-a456-426655440000',
      nome: 'Fulano de Tal',
      cidade: 'BRASILIA',
    });
    expect(codigo).toBe(
      '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D',
    );
  });
  it('inclui valor e txid e remove acentos', () => {
    const codigo = gerarPixCopiaECola({ chave: '+5562986014789', nome: 'João Conceição', cidade: 'Goiânia', valor: 76800, txid: 'EMP0042E2' });
    expect(codigo).toContain('5406768.00');
    expect(codigo).toContain('5914Joao Conceicao');
    expect(codigo).toContain('6007Goiania');
    expect(codigo).toContain('0509EMP0042E2');
    expect(codigo.slice(-4)).toBe(crc16(codigo.slice(0, -4)));
  });
  it('classifica as chaves', () => {
    expect(classificarChavePix('fulano@Email.com')).toEqual({ ok: true, chave: { tipo: 'email', chave: 'fulano@email.com' } });
    expect(classificarChavePix('(62) 98601-4789')).toEqual({ ok: true, chave: { tipo: 'celular', chave: '+5562986014789' } });
    expect(classificarChavePix('529.982.247-25')).toEqual({ ok: true, chave: { tipo: 'cpf', chave: '52998224725' } });
    expect(classificarChavePix('529.982.247-26')).toEqual({ ok: false, motivo: 'invalida' });
    expect(classificarChavePix('11.222.333/0001-81')).toEqual({ ok: true, chave: { tipo: 'cnpj', chave: '11222333000181' } });
    expect(classificarChavePix('62986014789')).toEqual({ ok: true, chave: { tipo: 'celular', chave: '+5562986014789' } });
  });
});
