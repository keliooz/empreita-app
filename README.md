# Empreita

Bot de WhatsApp para pedreiros, empreiteiros e outros profissionais de obra: orçamento com lista de material e PDF,
lançamento de gastos por mensagem, lucro de cada obra e cobrança por etapa com Pix copia e cola.

O profissional usa tudo pelo WhatsApp. O cliente recebe um link com o orçamento e o Pix da próxima etapa.

## Rodar no seu computador

Precisa do Node 20 ou mais novo.

```bash
npm install
npm run dev
```

Abra http://localhost:3000/simulador e mande "oi". Sem `DATABASE_URL`, o projeto usa um Postgres embutido (PGlite)
salvo na pasta `.pglite/`, então não precisa instalar banco para começar. Para zerar os dados, apague essa pasta.

```bash
npm test          # testes (regras, Pix, PDF e conversas completas com o bot)
npm run lint      # checagem de tipos
```

## Como o profissional usa

| Mensagem | O que acontece |
| --- | --- |
| `oi` (primeira vez) | Cadastro: nome, cidade e chave Pix |
| `orçamento` | Perguntas guiadas: serviço, área, preço por m², quem compra o material, cliente. Gera o PDF e o link |
| `150 diária ajudante` | Lança um gasto na obra ativa e responde com o lucro atualizado |
| `recebi 576 de entrada` | Lança um pagamento do cliente e avisa quais etapas foram quitadas |
| foto da nota | Pergunta o valor (ou lê da legenda, se tiver) |
| `resumo` / `extrato` | Lucro da obra por categoria / últimos lançamentos |
| `cobrar` | Mensagem pronta para o cliente, com Pix copia e cola e link do WhatsApp dele |
| `obras` / `obra 2` | Lista as obras / troca a obra ativa |
| `fechou` / `concluir` | Orçamento aprovado / obra entregue |
| `desfazer` | Apaga o último lançamento |
| `pix` | Troca a chave Pix |
| `cancelar` | Sai de qualquer pergunta |

Valores aceitos: `150`, `R$ 1.500,00`, `86,90`, `2 mil`, `2 diárias de 150`.

## Configurar o WhatsApp (Meta Cloud API)

1. Em [developers.facebook.com](https://developers.facebook.com), crie um app do tipo **Empresa** e adicione o produto **WhatsApp**.
2. Em **WhatsApp > Configuração da API** está o número de teste e o **ID do número de telefone** → `WHATSAPP_PHONE_NUMBER_ID`.
   Para produção, cadastre um número próprio. Ele não pode estar em uso no aplicativo comum do WhatsApp.
3. Crie um **token permanente**: no Gerenciador de Negócios, em Usuários do sistema, gere um token com as permissões
   `whatsapp_business_messaging` e `whatsapp_business_management` → `WHATSAPP_TOKEN`.
   (O token temporário do painel expira em 24 horas.)
4. Em **Configurações do app > Básico**, copie a **Chave secreta do app** → `WHATSAPP_APP_SECRET`.
5. Em **WhatsApp > Configuração > Webhook**, coloque a URL `https://SEU_DOMINIO/api/whatsapp/webhook`, o mesmo texto de
   `WHATSAPP_VERIFY_TOKEN` e assine o campo **messages**.
6. Enquanto o app estiver em modo de desenvolvimento, só números cadastrados como destinatários de teste recebem respostas.

O webhook confere a assinatura `X-Hub-Signature-256` de cada chamada, responde 200 na hora e processa a mensagem em
seguida. Mensagens repetidas pela Meta são ignoradas.

## Publicar (Vercel + Postgres)

1. Crie um banco Postgres (Neon e Supabase têm plano gratuito) e copie a URL de conexão.
2. Importe o repositório na Vercel e configure as variáveis do `.env.example`. `APP_URL` é o domínio do projeto.
3. Rode as migrações uma vez (e depois de cada mudança no banco):
   ```bash
   DATABASE_URL="postgres://..." npm run db:migrate
   ```
4. Configure o webhook na Meta com a URL de produção.

Use `TESTADORES` para liberar o bot só para os profissionais do teste piloto.

## Decisões da primeira versão

- **A cobrança sai do WhatsApp do profissional.** O bot monta a mensagem com o Pix e um link `wa.me` que abre a conversa
  com o cliente. Mandar pelo número da Empreita exigiria modelos de mensagem aprovados pela Meta, e o cliente confia mais
  no número de quem fez a obra.
- **Sem lembretes automáticos ainda.** Fora da janela de 24 horas, o WhatsApp só permite mensagens com modelo aprovado.
  Quando os modelos forem aprovados, os lembretes entram.
- **Foto da nota:** o bot guarda o ID da foto e pergunta o valor. Ler o valor da imagem automaticamente fica para depois.
- **Material:** quantidades por consumo médio e preços de referência em `src/core/servicos.ts`. A ideia é que os preços
  venham da loja parceira.
- **Lucro com material por conta do profissional:** enquanto as notas lançadas somam menos que a estimativa do orçamento,
  vale a estimativa. Assim a nota não é contada duas vezes e o lucro nunca aparece maior do que é.

## Estrutura

```
src/core/     regras puras: dinheiro, serviços e materiais, orçamento, etapas, leitura das mensagens, Pix, telefone
src/db/       esquema do banco (Drizzle) e conexão
src/bot/      conversa do bot, consultas ao banco, textos e integração com a Cloud API
src/pdf/      PDF do orçamento
src/app/      webhook, PDF, página do cliente (/o/[token]) e simulador
drizzle/      migrações SQL
tests/        testes com Vitest e PGlite
```
