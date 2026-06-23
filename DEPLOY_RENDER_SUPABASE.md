# Configurar Supabase e Render

Este guia parte de um projeto local já funcionando e explica a configuração completa de produção.

## 1. Criar o banco no Supabase

1. Acesse `https://supabase.com/dashboard`.
2. Clique em **New project**.
3. Escolha uma organização.
4. Defina:
   - nome do projeto, por exemplo `cha-lista`;
   - uma senha forte para o banco;
   - uma região próxima do público.
5. Guarde a senha do banco em um gerenciador de senhas.
6. Aguarde o projeto ficar disponível.

Não crie as tabelas manualmente neste momento. A aplicação consegue criá-las automaticamente.

A inicialização também habilita Row Level Security (RLS) sem políticas públicas. Assim, nomes e telefones não ficam acessíveis pela API pública do Supabase. O backend continua acessando as tabelas pela conexão PostgreSQL protegida.

## 2. Obter a conexão correta

1. Dentro do projeto Supabase, clique em **Connect**.
2. Abra a opção de conexão por URI.
3. Selecione **Session pooler**.
4. Copie a URI completa.
5. Substitua o marcador da senha pela senha real do banco.

O formato é semelhante a:

```text
postgresql://postgres.REFERENCIA:SENHA@aws-0-REGIAO.pooler.supabase.com:5432/postgres
```

Use a URI de **Session pooler**, normalmente na porta `5432`, pois o Render executa um servidor Node de longa duração. Não use a conexão direta se ela estiver disponível apenas por IPv6.

Se a senha tiver caracteres como `@`, `:`, `/`, `?` ou `#`, eles precisam estar codificados na URL. É possível gerar a versão codificada com:

```bash
node -e "console.log(encodeURIComponent('COLE-A-SENHA-AQUI'))"
```

Codifique somente a senha, não a URI inteira.

## 3. Testar o Supabase localmente

No arquivo `.env`, preencha:

```env
PORT=3000
ESPACO_MAE_PASSWORD=defina-uma-senha-diferente-da-senha-do-banco
ESPACO_MAE_SESSION_SECRET=cole-uma-chave-aleatoria-longa
DATABASE_URL=cole-a-uri-session-pooler
DATABASE_SSL=true
DATABASE_POOL_SIZE=5
NODE_ENV=development
SQLITE_SOURCE_PATH=./data/cha-lista.sqlite
MIGRATE_CONFIRM=NO
```

Gere o segredo:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Execute:

```bash
npm install
npm test
npm start
```

Abra:

```text
http://localhost:3000/api/health
```

O resultado esperado é:

```json
{"ok":true,"database":"connected"}
```

Depois confira:

```text
http://localhost:3000
http://localhost:3000/espaco-da-mae
```

## 4. Importar os dados antigos, se existirem

Se você já utilizou a versão SQLite:

1. Pare o servidor local.
2. Confirme que `DATABASE_URL` aponta para o projeto Supabase correto.
3. Confirme que `SQLITE_SOURCE_PATH` aponta para o arquivo antigo.
4. Altere `MIGRATE_CONFIRM=YES`.
5. Execute:

```bash
npm run migrate:sqlite
```

6. Confira a quantidade importada exibida no terminal.
7. Volte `MIGRATE_CONFIRM=NO`.
8. Inicie o site e confira os presentes e reservas.

A importação apaga os presentes, reservas e configurações existentes no PostgreSQL de destino antes de copiar o SQLite. Portanto, execute-a apenas no projeto Supabase correto.

## 5. Enviar o projeto para um repositório Git

O Render precisa acessar o código por GitHub, GitLab ou Bitbucket.

Antes do envio, confirme:

```bash
git status
```

O arquivo `.env` não deve aparecer entre os arquivos versionados. Ele já está incluído no `.gitignore`.

Fluxo comum:

```bash
git add .
git commit -m "Migra banco para Supabase e prepara deploy no Render"
git push
```

## 6. Criar o serviço no Render usando o Blueprint

1. Acesse `https://dashboard.render.com`.
2. Clique em **New**.
3. Escolha **Blueprint**.
4. Conecte o provedor Git.
5. Selecione o repositório deste projeto.
6. O Render detectará o arquivo `render.yaml`.
7. Confirme a criação do serviço `cha-lista`.
8. Quando solicitado, informe:

### `DATABASE_URL`

Cole a mesma URI **Session pooler** do Supabase usada localmente.

### `ESPACO_MAE_PASSWORD`

Defina a senha que será usada para entrar em:

```text
https://SEU-SERVICO.onrender.com/espaco-da-mae
```

O `ESPACO_MAE_SESSION_SECRET` será gerado automaticamente pelo Render.

O Blueprint também configura:

- Node.js 22.19.0;
- `NODE_ENV=production`;
- `DATABASE_SSL=true`;
- pool de até 5 conexões;
- build com `npm ci`;
- inicialização com `npm start`;
- health check em `/api/health`.

## 7. Acompanhar o primeiro deploy

No Render:

1. Abra o serviço.
2. Entre em **Logs**.
3. Aguarde a instalação das dependências.
4. Procure a mensagem:

```text
Chá Lista disponível em http://localhost:...
```

Na primeira execução, a aplicação cria as tabelas automaticamente. Se o banco estiver vazio, também cria os presentes de exemplo.

Se o deploy falhar com erro de autenticação do PostgreSQL:

- confira a senha;
- confira se os caracteres especiais estão codificados;
- copie novamente a URI Session pooler;
- confirme que não há espaços no início ou no fim da variável.

## 8. Validar a produção

Abra:

```text
https://SEU-SERVICO.onrender.com/api/health
```

Depois teste:

1. página inicial;
2. entrada no Espaço da mãe;
3. criação de um presente;
4. reserva pela página pública;
5. cancelamento da reserva no Espaço da mãe.

## 9. Configuração manual do Render, se não usar Blueprint

Crie um **Web Service** com:

```text
Runtime: Node
Build Command: npm ci
Start Command: npm start
Health Check Path: /api/health
```

Adicione estas variáveis:

```env
NODE_VERSION=22.19.0
NODE_ENV=production
DATABASE_URL=URI_SESSION_POOLER_DO_SUPABASE
DATABASE_SSL=true
DATABASE_POOL_SIZE=5
ESPACO_MAE_PASSWORD=SUA_SENHA
ESPACO_MAE_SESSION_SECRET=UMA_CHAVE_ALEATORIA_LONGA
```

Não defina `PORT` manualmente: o Render fornece essa variável.

## 10. Observações importantes

- O plano gratuito do Render pode suspender o serviço após um período sem acessos. O primeiro acesso depois disso pode demorar.
- O banco permanece no Supabase mesmo quando o Render reinicia.
- Não é necessário disco persistente no Render.
- Não coloque a URI do Supabase em JavaScript, HTML ou CSS.
- Não use a chave `service_role` do Supabase; este projeto não precisa dela.
- O arquivo `supabase/schema.sql` existe apenas para criação manual ou auditoria. A aplicação já executa o esquema automaticamente.
