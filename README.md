# Chá Lista

Sistema mobile-first para lista de presentes de chá de bebê. O backend usa Node.js + Express e o banco usa PostgreSQL, compatível com Supabase e Render.

## Recursos

- Lista pública responsiva com imagens, categorias, quantidades e status.
- Reserva sem recarregar a página.
- Transação PostgreSQL com bloqueio de linha para impedir reservas acima do estoque.
- Dados dos convidados visíveis somente no Espaço da mãe.
- Espaço da mãe em `/espaco-da-mae`, protegido por senha.
- Cadastro, edição e remoção de presentes.
- Busca de imagens pelo Wikimedia Commons com crédito da fonte.
- Consulta e cancelamento de reservas.
- Criação automática das tabelas e dos dados iniciais.
- RLS habilitado sem políticas públicas, impedindo acesso direto pelos clientes do Supabase.
- Importador opcional do banco SQLite usado pela versão anterior.
- Blueprint `render.yaml` pronto para implantação no Render.

## Requisitos

- Node.js 20 ou mais recente.
- npm.
- Um banco PostgreSQL. Para produção, a configuração recomendada é Supabase.

## Configuração local

Instale as dependências:

```bash
npm install
```

Copie o arquivo de exemplo:

```powershell
Copy-Item .env.example .env
```

Configure o `.env`:

```env
PORT=3000
ESPACO_MAE_PASSWORD=uma-senha-forte-e-exclusiva
ESPACO_MAE_SESSION_SECRET=uma-chave-longa-e-aleatoria
DATABASE_URL=postgresql://usuario:senha@host:5432/postgres
DATABASE_SSL=true
DATABASE_POOL_SIZE=5
NODE_ENV=development

SQLITE_SOURCE_PATH=./data/cha-lista.sqlite
MIGRATE_CONFIRM=NO
```

Gere o segredo da sessão:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Inicie:

```bash
npm run dev
```

Acesse:

- Lista pública: `http://localhost:3000`
- Espaço da mãe: `http://localhost:3000/espaco-da-mae`
- Saúde da aplicação: `http://localhost:3000/api/health`

Na primeira inicialização, as tabelas e os presentes de exemplo são criados automaticamente.

## Migrar os dados do SQLite antigo

Use esta etapa somente se o arquivo `data/cha-lista.sqlite` já contém presentes ou reservas que precisam ser mantidos.

1. Configure `DATABASE_URL` com o banco PostgreSQL de destino.
2. Confira `SQLITE_SOURCE_PATH`.
3. Feche a aplicação durante a importação.
4. Altere temporariamente:

```env
MIGRATE_CONFIRM=YES
```

5. Execute:

```bash
npm run migrate:sqlite
```

6. Após a mensagem de sucesso, volte para:

```env
MIGRATE_CONFIRM=NO
```

O importador substitui o conteúdo das tabelas PostgreSQL pelos dados do SQLite, preservando identificadores, presentes, reservas, cancelamentos e configurações.

## Testes

```bash
npm test
```

Os testes usam PostgreSQL em memória e validam:

- privacidade dos convidados;
- login no Espaço da mãe;
- criação e cancelamento de reservas;
- metadados das imagens;
- concorrência sobre a última unidade.

## Estrutura

```text
public/                    frontend público e Espaço da mãe
scripts/
  migrate-sqlite-to-postgres.js
src/
  app.js                   API REST e regras de negócio
  auth.js                  sessão do Espaço da mãe
  database.js              PostgreSQL, esquema e dados iniciais
  server.js                inicialização do servidor
supabase/
  schema.sql               esquema para execução manual opcional
test/
  app.test.js
render.yaml                configuração do Render
```

## API REST

Rotas públicas:

- `GET /api/settings`
- `GET /api/gifts`
- `POST /api/reservations`
- `GET /api/health`

Rotas do Espaço da mãe:

- `POST /api/espaco-da-mae/login`
- `POST /api/espaco-da-mae/logout`
- `GET /api/espaco-da-mae/session`
- `GET /api/espaco-da-mae/dashboard`
- `GET /api/espaco-da-mae/images/search?q=nome`
- `PUT /api/espaco-da-mae/settings`
- `POST /api/espaco-da-mae/gifts`
- `PUT /api/espaco-da-mae/gifts/:id`
- `DELETE /api/espaco-da-mae/gifts/:id`
- `DELETE /api/espaco-da-mae/reservations/:id`

## Implantação: Supabase + Render

O guia completo está em [DEPLOY_RENDER_SUPABASE.md](DEPLOY_RENDER_SUPABASE.md).

Resumo:

1. Crie um projeto no Supabase.
2. Copie a conexão **Session pooler** para `DATABASE_URL`.
3. Migre o SQLite antigo, caso necessário.
4. Envie o projeto para GitHub, GitLab ou Bitbucket.
5. No Render, crie um Blueprint usando `render.yaml`.
6. Informe `DATABASE_URL` e `ESPACO_MAE_PASSWORD`.

Não é necessário configurar chave `anon`, `service_role` ou acesso do Supabase no frontend. O navegador conversa apenas com o Express; a senha do banco permanece no backend.

## Docker

```bash
docker build -t cha-lista .
docker run --rm \
  --env-file .env \
  -p 3000:3000 \
  cha-lista
```

Como os dados ficam no Supabase, não é necessário montar volume para o banco.

## Segurança

- Nunca envie `.env` para o repositório.
- Use senhas diferentes para Supabase e Espaço da mãe.
- Mantenha `NODE_ENV=production` no Render para ativar cookie `Secure`.
- Ao trocar `ESPACO_MAE_SESSION_SECRET`, as sessões existentes serão encerradas.
- Faça backups pelo painel do Supabase conforme a política do plano contratado.
