import { relations } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/** Profissional que usa o bot. O número do WhatsApp (wa_id) é a identidade. */
export const profissionais = pgTable('profissionais', {
  id: uuid('id').primaryKey().defaultRandom(),
  waId: text('wa_id').notNull().unique(),
  nome: text('nome'),
  cidade: text('cidade'),
  pixTipo: text('pix_tipo'),
  pixChave: text('pix_chave'),
  /** Obra em que os lançamentos caem por padrão. */
  obraAtivaId: uuid('obra_ativa_id'),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
});

export const obras = pgTable(
  'obras',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profissionalId: uuid('profissional_id')
      .notNull()
      .references(() => profissionais.id, { onDelete: 'cascade' }),
    /** Número sequencial por profissional, mostrado como "nº 0042". */
    numero: integer('numero').notNull(),
    /** Identificador secreto usado no link público do orçamento. */
    token: text('token').notNull().unique(),
    titulo: text('titulo').notNull(),
    servico: text('servico').notNull(),
    descricaoServico: text('descricao_servico'),
    areaM2: doublePrecision('area_m2').notNull(),
    precoM2: integer('preco_m2_centavos').notNull(),
    materialPorConta: boolean('material_por_conta').notNull().default(false),
    maoDeObra: integer('mao_de_obra_centavos').notNull(),
    totalMateriais: integer('total_materiais_centavos').notNull(),
    valorFechado: integer('valor_fechado_centavos').notNull(),
    dias: integer('dias').notNull(),
    clienteNome: text('cliente_nome').notNull(),
    clienteTelefone: text('cliente_telefone'),
    /** orcamento | em_andamento | concluida */
    status: text('status').notNull().default('orcamento'),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('obras_profissional_numero').on(t.profissionalId, t.numero)],
);

export const materiais = pgTable(
  'materiais',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    obraId: uuid('obra_id')
      .notNull()
      .references(() => obras.id, { onDelete: 'cascade' }),
    ordem: integer('ordem').notNull(),
    nome: text('nome').notNull(),
    quantidade: doublePrecision('quantidade').notNull(),
    unidade: text('unidade').notNull(),
    precoUnitario: integer('preco_unitario_centavos'),
  },
  (t) => [index('materiais_obra').on(t.obraId)],
);

/** Etapas de pagamento combinadas com o cliente. O que está pago sai da soma dos recebimentos. */
export const etapas = pgTable(
  'etapas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    obraId: uuid('obra_id')
      .notNull()
      .references(() => obras.id, { onDelete: 'cascade' }),
    ordem: integer('ordem').notNull(),
    nome: text('nome').notNull(),
    pontosBase: integer('pontos_base').notNull(),
    valor: integer('valor_centavos').notNull(),
  },
  (t) => [uniqueIndex('etapas_obra_ordem').on(t.obraId, t.ordem)],
);

export const lancamentos = pgTable(
  'lancamentos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Ordem de chegada (desempata lançamentos feitos no mesmo instante). */
    seq: serial('seq').notNull(),
    obraId: uuid('obra_id')
      .notNull()
      .references(() => obras.id, { onDelete: 'cascade' }),
    /** gasto | recebimento */
    natureza: text('natureza').notNull(),
    categoria: text('categoria'),
    descricao: text('descricao').notNull(),
    valor: integer('valor_centavos').notNull(),
    /** texto | foto */
    origem: text('origem').notNull().default('texto'),
    /** ID da foto da nota no WhatsApp, quando houver. */
    mediaId: text('media_id'),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('lancamentos_obra').on(t.obraId, t.seq)],
);

/** Onde o profissional está numa conversa guiada (cadastro, orçamento, foto aguardando valor). */
export const sessoes = pgTable('sessoes', {
  waId: text('wa_id').primaryKey(),
  fluxo: text('fluxo'),
  passo: text('passo'),
  dados: jsonb('dados').$type<Record<string, unknown>>().notNull().default({}),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
});

/** A Meta pode reenviar o mesmo webhook; guardamos o ID de cada mensagem para não processar duas vezes. */
export const mensagensProcessadas = pgTable('mensagens_processadas', {
  id: text('id').primaryKey(),
  recebidaEm: timestamp('recebida_em', { withTimezone: true }).notNull().defaultNow(),
});

export const profissionaisRelations = relations(profissionais, ({ many }) => ({ obras: many(obras) }));
export const obrasRelations = relations(obras, ({ one, many }) => ({
  profissional: one(profissionais, { fields: [obras.profissionalId], references: [profissionais.id] }),
  materiais: many(materiais),
  etapas: many(etapas),
  lancamentos: many(lancamentos),
}));
export const materiaisRelations = relations(materiais, ({ one }) => ({
  obra: one(obras, { fields: [materiais.obraId], references: [obras.id] }),
}));
export const etapasRelations = relations(etapas, ({ one }) => ({
  obra: one(obras, { fields: [etapas.obraId], references: [obras.id] }),
}));
export const lancamentosRelations = relations(lancamentos, ({ one }) => ({
  obra: one(obras, { fields: [lancamentos.obraId], references: [obras.id] }),
}));

export type Profissional = typeof profissionais.$inferSelect;
export type Obra = typeof obras.$inferSelect;
export type Material = typeof materiais.$inferSelect;
export type EtapaDb = typeof etapas.$inferSelect;
export type Lancamento = typeof lancamentos.$inferSelect;
export type Sessao = typeof sessoes.$inferSelect;
