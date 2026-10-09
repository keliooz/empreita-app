import { randomBytes } from 'node:crypto';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { DB } from '@/db/client';
import {
  etapas,
  lancamentos,
  materiais,
  mensagensProcessadas,
  obras,
  profissionais,
  sessoes,
  type EtapaDb,
  type Lancamento,
  type Material,
  type Obra,
  type Profissional,
  type Sessao,
} from '@/db/schema';
import type { Centavos } from '@/core/dinheiro';
import { dividirEtapas, ETAPAS_PADRAO } from '@/core/etapas';
import { calcularOrcamento, type EntradaOrcamento } from '@/core/orcamento';
import { calcularResumo, type ResumoObra } from '@/core/resumo';
import { SERVICOS } from '@/core/servicos';

/* ---------- Idempotência ---------- */

/** `true` se a mensagem é nova; `false` se a Meta está reenviando uma que já tratamos. */
export async function registrarMensagem(db: DB, id: string): Promise<boolean> {
  const r = await db.insert(mensagensProcessadas).values({ id }).onConflictDoNothing().returning({ id: mensagensProcessadas.id });
  return r.length > 0;
}

/* ---------- Profissionais ---------- */

export async function buscarProfissional(db: DB, waId: string): Promise<Profissional | null> {
  const [p] = await db.select().from(profissionais).where(eq(profissionais.waId, waId)).limit(1);
  return p ?? null;
}

export async function criarProfissional(db: DB, waId: string): Promise<Profissional> {
  const [p] = await db.insert(profissionais).values({ waId }).onConflictDoNothing().returning();
  return p ?? (await buscarProfissional(db, waId))!;
}

export async function atualizarProfissional(
  db: DB,
  id: string,
  dados: Partial<Pick<Profissional, 'nome' | 'cidade' | 'pixTipo' | 'pixChave' | 'obraAtivaId'>>,
): Promise<void> {
  await db.update(profissionais).set(dados).where(eq(profissionais.id, id));
}

/* ---------- Sessão da conversa ---------- */

export async function lerSessao(db: DB, waId: string): Promise<Sessao | null> {
  const [s] = await db.select().from(sessoes).where(eq(sessoes.waId, waId)).limit(1);
  return s ?? null;
}

export async function salvarSessao(db: DB, waId: string, fluxo: string, passo: string, dados: Record<string, unknown>) {
  await db
    .insert(sessoes)
    .values({ waId, fluxo, passo, dados, atualizadoEm: new Date() })
    .onConflictDoUpdate({ target: sessoes.waId, set: { fluxo, passo, dados, atualizadoEm: new Date() } });
}

export async function limparSessao(db: DB, waId: string) {
  await db.delete(sessoes).where(eq(sessoes.waId, waId));
}

/* ---------- Obras ---------- */

export interface NovaObra {
  entrada: EntradaOrcamento;
  descricaoServico?: string;
  clienteNome: string;
  clienteTelefone?: string | null;
}

export async function criarObra(db: DB, p: Profissional, dados: NovaObra): Promise<Obra> {
  const orc = calcularOrcamento(dados.entrada);
  const servico = SERVICOS[dados.entrada.servico];
  const titulo = dados.descricaoServico ? dados.descricaoServico : servico.tituloObra;

  return db.transaction(async (tx) => {
    const [ultimo] = await tx
      .select({ n: sql<number>`coalesce(max(${obras.numero}), 0)` })
      .from(obras)
      .where(eq(obras.profissionalId, p.id));
    const numero = Number(ultimo?.n ?? 0) + 1;

    const [obra] = await tx
      .insert(obras)
      .values({
        profissionalId: p.id,
        numero,
        token: randomBytes(12).toString('base64url'),
        titulo,
        servico: dados.entrada.servico,
        descricaoServico: dados.descricaoServico ?? null,
        areaM2: dados.entrada.areaM2,
        precoM2: dados.entrada.precoM2,
        materialPorConta: dados.entrada.materialPorConta,
        maoDeObra: orc.maoDeObra,
        totalMateriais: orc.totalMateriais,
        valorFechado: orc.valorFechado,
        dias: orc.dias,
        clienteNome: dados.clienteNome,
        clienteTelefone: dados.clienteTelefone ?? null,
      })
      .returning();
    if (!obra) throw new Error('Falha ao criar a obra');

    if (orc.materiais.length) {
      await tx.insert(materiais).values(
        orc.materiais.map((m, i) => ({
          obraId: obra.id,
          ordem: i + 1,
          nome: m.nome,
          quantidade: m.quantidade,
          unidade: m.unidade,
          precoUnitario: m.precoUnitario,
        })),
      );
    }
    await tx.insert(etapas).values(
      dividirEtapas(orc.valorFechado, ETAPAS_PADRAO).map((e) => ({
        obraId: obra.id,
        ordem: e.ordem,
        nome: e.nome,
        pontosBase: e.pontosBase,
        valor: e.valor,
      })),
    );
    await tx.update(profissionais).set({ obraAtivaId: obra.id }).where(eq(profissionais.id, p.id));
    return obra;
  });
}

export async function obraAtiva(db: DB, p: Profissional): Promise<Obra | null> {
  if (!p.obraAtivaId) return null;
  const [o] = await db
    .select()
    .from(obras)
    .where(and(eq(obras.id, p.obraAtivaId), eq(obras.profissionalId, p.id)))
    .limit(1);
  return o ?? null;
}

export async function listarObras(db: DB, profissionalId: string): Promise<Obra[]> {
  return db.select().from(obras).where(eq(obras.profissionalId, profissionalId)).orderBy(desc(obras.numero)).limit(20);
}

export async function obraPorNumero(db: DB, profissionalId: string, numero: number): Promise<Obra | null> {
  const [o] = await db
    .select()
    .from(obras)
    .where(and(eq(obras.profissionalId, profissionalId), eq(obras.numero, numero)))
    .limit(1);
  return o ?? null;
}

export async function atualizarStatusObra(db: DB, obraId: string, status: 'orcamento' | 'em_andamento' | 'concluida') {
  await db.update(obras).set({ status }).where(eq(obras.id, obraId));
}

export async function atualizarTelefoneCliente(db: DB, obraId: string, telefone: string) {
  await db.update(obras).set({ clienteTelefone: telefone }).where(eq(obras.id, obraId));
}

export interface ObraCompleta {
  obra: Obra;
  profissional: Profissional;
  materiais: Material[];
  etapas: EtapaDb[];
  lancamentos: Lancamento[];
  resumo: ResumoObra;
}

export async function carregarObra(db: DB, obraId: string): Promise<ObraCompleta | null> {
  const [obra] = await db.select().from(obras).where(eq(obras.id, obraId)).limit(1);
  if (!obra) return null;
  return completar(db, obra);
}

export async function obraPorToken(db: DB, token: string): Promise<ObraCompleta | null> {
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(token)) return null;
  const [obra] = await db.select().from(obras).where(eq(obras.token, token)).limit(1);
  if (!obra) return null;
  return completar(db, obra);
}

async function completar(db: DB, obra: Obra): Promise<ObraCompleta> {
  const [profissional] = await db.select().from(profissionais).where(eq(profissionais.id, obra.profissionalId)).limit(1);
  const mats = await db.select().from(materiais).where(eq(materiais.obraId, obra.id)).orderBy(asc(materiais.ordem));
  const ets = await db.select().from(etapas).where(eq(etapas.obraId, obra.id)).orderBy(asc(etapas.ordem));
  const lancs = await db.select().from(lancamentos).where(eq(lancamentos.obraId, obra.id)).orderBy(asc(lancamentos.seq));
  const resumo = calcularResumo(obra, lancs, ets);
  return { obra, profissional: profissional!, materiais: mats, etapas: ets, lancamentos: lancs, resumo };
}

/* ---------- Lançamentos ---------- */

export interface NovoLancamento {
  natureza: 'gasto' | 'recebimento';
  categoria?: string | null;
  descricao: string;
  valor: Centavos;
  origem?: 'texto' | 'foto';
  mediaId?: string | null;
}

export async function inserirLancamento(db: DB, obraId: string, l: NovoLancamento): Promise<Lancamento> {
  const [r] = await db
    .insert(lancamentos)
    .values({
      obraId,
      natureza: l.natureza,
      categoria: l.natureza === 'gasto' ? (l.categoria ?? 'Outros') : null,
      descricao: l.descricao,
      valor: l.valor,
      origem: l.origem ?? 'texto',
      mediaId: l.mediaId ?? null,
    })
    .returning();
  return r!;
}

export async function ultimosLancamentos(db: DB, obraId: string, limite = 10): Promise<Lancamento[]> {
  return db
    .select()
    .from(lancamentos)
    .where(eq(lancamentos.obraId, obraId))
    .orderBy(desc(lancamentos.seq))
    .limit(limite);
}

export async function desfazerUltimo(db: DB, obraId: string): Promise<Lancamento | null> {
  const [ultimo] = await ultimosLancamentos(db, obraId, 1);
  if (!ultimo) return null;
  await db.delete(lancamentos).where(eq(lancamentos.id, ultimo.id));
  return ultimo;
}
