CREATE TABLE "etapas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"obra_id" uuid NOT NULL,
	"ordem" integer NOT NULL,
	"nome" text NOT NULL,
	"pontos_base" integer NOT NULL,
	"valor_centavos" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lancamentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" serial NOT NULL,
	"obra_id" uuid NOT NULL,
	"natureza" text NOT NULL,
	"categoria" text,
	"descricao" text NOT NULL,
	"valor_centavos" integer NOT NULL,
	"origem" text DEFAULT 'texto' NOT NULL,
	"media_id" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "materiais" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"obra_id" uuid NOT NULL,
	"ordem" integer NOT NULL,
	"nome" text NOT NULL,
	"quantidade" double precision NOT NULL,
	"unidade" text NOT NULL,
	"preco_unitario_centavos" integer
);
--> statement-breakpoint
CREATE TABLE "mensagens_processadas" (
	"id" text PRIMARY KEY NOT NULL,
	"recebida_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "obras" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profissional_id" uuid NOT NULL,
	"numero" integer NOT NULL,
	"token" text NOT NULL,
	"titulo" text NOT NULL,
	"servico" text NOT NULL,
	"descricao_servico" text,
	"area_m2" double precision NOT NULL,
	"preco_m2_centavos" integer NOT NULL,
	"material_por_conta" boolean DEFAULT false NOT NULL,
	"mao_de_obra_centavos" integer NOT NULL,
	"total_materiais_centavos" integer NOT NULL,
	"valor_fechado_centavos" integer NOT NULL,
	"dias" integer NOT NULL,
	"cliente_nome" text NOT NULL,
	"cliente_telefone" text,
	"status" text DEFAULT 'orcamento' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "obras_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "profissionais" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wa_id" text NOT NULL,
	"nome" text,
	"cidade" text,
	"pix_tipo" text,
	"pix_chave" text,
	"obra_ativa_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profissionais_wa_id_unique" UNIQUE("wa_id")
);
--> statement-breakpoint
CREATE TABLE "sessoes" (
	"wa_id" text PRIMARY KEY NOT NULL,
	"fluxo" text,
	"passo" text,
	"dados" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "etapas" ADD CONSTRAINT "etapas_obra_id_obras_id_fk" FOREIGN KEY ("obra_id") REFERENCES "public"."obras"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_obra_id_obras_id_fk" FOREIGN KEY ("obra_id") REFERENCES "public"."obras"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materiais" ADD CONSTRAINT "materiais_obra_id_obras_id_fk" FOREIGN KEY ("obra_id") REFERENCES "public"."obras"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obras" ADD CONSTRAINT "obras_profissional_id_profissionais_id_fk" FOREIGN KEY ("profissional_id") REFERENCES "public"."profissionais"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "etapas_obra_ordem" ON "etapas" USING btree ("obra_id","ordem");--> statement-breakpoint
CREATE INDEX "lancamentos_obra" ON "lancamentos" USING btree ("obra_id","seq");--> statement-breakpoint
CREATE INDEX "materiais_obra" ON "materiais" USING btree ("obra_id");--> statement-breakpoint
CREATE UNIQUE INDEX "obras_profissional_numero" ON "obras" USING btree ("profissional_id","numero");