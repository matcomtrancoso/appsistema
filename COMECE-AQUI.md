# FlowPlanner: comece aqui

Este é um app de gestão de obra que **já existe**, pronto para usar. O que falta é ligar ele ao
**seu** banco de dados e colocar no ar. Isso se faz com **um prompt só**, colado no Cowork. Ele
cria o banco, liga o app e te guia a guardar o código no GitHub e a publicar na Vercel.

**O caminho ideal é outro:** montar o seu próprio app do zero, desde o começo, pelo manual (no
portal, botão "Criar meu app do zero": https://portal.flowplanner.app.br/manual.html). É assim que
você aprende o processo inteiro e depois consegue mudar o que quiser. Use este app pronto se precisa
de algo funcionando já, ou como referência enquanto constrói o seu.

**Pode usar, não pode vender.** Você pode usar e adaptar este app nas suas obras e nas obras da
sua empresa. É proibido vender, revender, alugar, sublicenciar ou distribuir o app ou versões dele.
As regras estão no `LICENCA.txt`, nesta pasta.

**Tempo:** na primeira vez, reserve umas 3 horas, sem pressa. Perto de 1h45 é para preparar o
computador e as contas (uma vez só) e perto de 1h20 é o prompt. Em umas 10 vezes o prompt pede uma
ação sua: um clique no site, um comando no terminal ou um teste no app.

---

## Antes de colar o prompt

Se é a sua primeira vez, estes cinco passos preparam o computador e as contas. Uma vez só.

**1. As contas (uns 30 minutos).** Faça nesta ordem. Em cada site: Sign up (criar conta) e
confirme o e-mail.

| conta | pra que serve | custo |
|---|---|---|
| [claude.ai](https://claude.ai) | a IA que monta e liga o app, pela aba Cowork | plano Pro, uns US$ 20/mês |
| [github.com](https://github.com) | o cofre do código, privado | grátis |
| [supabase.com](https://supabase.com) | banco de dados, login e fotos | grátis |
| [vercel.com](https://vercel.com) | coloca o app no ar | grátis |
| [cursor.com](https://cursor.com) | liga o app no seu computador e guarda o código no GitHub | grátis |

- **Claude:** depois de criar, ative o plano Pro. O pagamento é em dólar: use um cartão que aceite
  compra internacional.
- **GitHub:** ele pede para resolver um quebra-cabeça e manda um código para o seu e-mail. É normal.
  Anote o seu nome de usuário do GitHub.
- **Supabase:** clique em Continue with GitHub. Se ele pedir para criar uma organização, crie (o
  seu nome ou o da empresa, plano Free). Se oferecer criar um **projeto**, não crie: quem cria é o
  prompt, com o nome e a região certos.
- **Vercel:** clique em **Continue with GitHub**. Não pule: é isso que deixa a Vercel ver o seu
  código e publicar sozinha. Se perguntar o tipo de uso, escolha Hobby, o grátis.

**2. Os programas (uns 35 minutos).**

- **App do Claude**, em [claude.ai/download](https://claude.ai/download). É nele que mora o Cowork.
- **Cursor**, em [cursor.com](https://cursor.com). Você usa a janela preta de baixo (o terminal)
  para ligar o app e para guardar o código no GitHub, com comandos que o Cowork te entrega prontos.
- **Node.js**, em [nodejs.org](https://nodejs.org): clique na versão **LTS** e instale com next,
  next, finish.
- **Git**, em [git-scm.com](https://git-scm.com): Download for Windows e vá clicando Next até o fim,
  sem mudar nada. São umas 12 telas. No Mac, rode `xcode-select --install` no terminal e aceite a
  janela.

**Reinicie o computador depois de instalar.** Sem isso o Windows não enxerga o Node e o Git, e
aparece o erro "não é reconhecido como comando". Para conferir, abra o Cursor, vá em Terminal, New
Terminal, e rode uma linha de cada vez:

```text
node -v
npm -v
git --version
```

Apareceram três respostas, algo como `v24.14.0`, `11.9.0` e `git version 2.53`? Pronto.

- A 2ª linha deu mensagem vermelha falando em "execução de scripts foi desabilitada"? Não mexa em
  configuração do Windows. No canto direito da janela preta, clique na setinha ao lado do +, escolha
  **Command Prompt** e rode `npm -v` de novo. Daqui para frente, use sempre esse terminal.
- Computador da empresa? Monte num computador seu. No da empresa, quase sempre a TI bloqueia a
  instalação, o npm no terminal ou os downloads. Depois de pronto, o app abre em qualquer navegador,
  inclusive no computador da empresa e no celular.

**3. A pasta.** Este app tem que morar numa pasta **local**, sem OneDrive, Google Drive ou Dropbox.
O caminho certo é este, e dentro dele, logo de cara, tem que estar este COMECE-AQUI.md:

```
%userprofile%\Projetos\FlowPlanner
```

Como chegar lá: no Explorador de Arquivos, digite `%userprofile%` na barra de endereço, crie a pasta
**Projetos** e, dentro dela, a pasta **FlowPlanner**. Clique com o botão direito no ZIP baixado,
**Extrair tudo**, **Procurar**, escolha a pasta FlowPlanner, **Selecionar pasta**, **Extrair**. Os
arquivos ficam soltos lá dentro: COMECE-AQUI.md, LICENCA.txt, package.json, public, src.

Se você está lendo este arquivo dentro de uma pasta a mais no meio (por exemplo
`FlowPlanner\flowplanner-app\COMECE-AQUI.md`), abra essa pasta do meio, aperte Ctrl+A e Ctrl+X,
volte para FlowPlanner e aperte Ctrl+V.

Se o seu nome de usuário do Windows tiver espaço ou acento, tudo bem. O que não pode é você criar
pasta nova com espaço ou acento. Cuidado com a pasta `Documentos` e com a Área de trabalho: no
Windows elas costumam ser o OneDrive sem você ter pedido. Clique na barra de endereço; se aparecer
OneDrive no caminho, saia de lá. No Mac, a pasta fica em Início/Projetos, fora do iCloud.

**4. O Cowork e os dois conectores.**

- No app do Claude: aba **Cowork**, **+ New task**, na barra de baixo **Trabalhar em um projeto**,
  **Escolher uma pasta diferente**, e escolha a pasta FlowPlanner. Modelo: **Opus**.
- Em **Configurações, Conectores**: ligue o **Supabase** e a **Vercel** (procure pelo nome, clique
  em Conectar e autorize com a sua conta).
- Confira colando no Cowork: "Liste meus projetos do Supabase" e "Liste meus projetos da Vercel".
  Se ele listar, mesmo vazio, está ligado. Se disser que não tem acesso: Configurações, Conectores,
  clique no conector, Desconectar e Conectar de novo; e confira se o conector está ligado também
  dentro da tarefa, no menu da caixa de mensagem.
- O GitHub **não** precisa de conector: o código vai pelo git, no terminal do Cursor, com comandos
  que o prompt te entrega prontos, um de cada vez.

O prompt vai sempre no **Cowork**, **não no chat do Cursor**.

**5. A sua logo (opcional).** Quer a logo da sua empresa no ícone do app? Antes de colar o prompt,
salve a logo, de preferência **quadrada** e em **PNG**, com o nome `minha-logo.png` (JPG também serve,
com o nome `minha-logo.jpg`; se não for quadrada, o comando centraliza num fundo branco), dentro
da pasta `public` desta pasta. Na ETAPA 6 o Cowork pede para você rodar `npm run icones`, que faz os
ícones com ela. Sem logo, fica o ícone FP. Com ou sem logo, o nome que você puser em Empresa aparece
sozinho na aba do navegador e no atalho do celular.

---

## Preencha estas cinco linhas

Troque o que está entre colchetes no bloco "Meus dados" do prompt. Os colchetes só aparecem nessas
cinco linhas. Dica: cole o prompt no Bloco de Notas, troque as cinco linhas e só então copie tudo
para o Cowork.

| campo | o que colocar | exemplo |
|---|---|---|
| NOME_DA_EMPRESA | como o app vai se chamar na tela de entrada, nos PDFs, na aba do navegador e no atalho do celular | `Construtora Silva` |
| NOME_DA_OBRA | a obra que você vai gerenciar primeiro | `Residencial Aurora` |
| DOMINIO_DO_EMAIL | o que vem depois do @ nos e-mails da sua empresa (se usa gmail ou hotmail, ponha esse) | `silva.eng.br` |
| INICIO_DA_OBRA | o dia em que a obra começou, para o app contar a semana da obra (opcional) | `16/03/2026` |
| SEU_EMAIL | o e-mail com que **você** vai entrar no app | `andre@silva.eng.br` |

---

## O prompt

Copie daqui até o fim do bloco, troque os cinco campos, cole no Cowork. Perto de 1h20. Se precisar
parar, pare no fim de uma etapa e depois escreva na mesma tarefa: "continue da ETAPA X".

```text
Você vai colocar no ar o app FlowPlanner que está nesta pasta. Ele já está pronto e
testado: NÃO reescreva nada dele. Seu trabalho é ligar o app ao MEU banco de dados,
me deixar entrar nele e me guiar a guardar o código e publicar. Siga as etapas na
ordem e só passe para a próxima quando o "Pronto quando" da atual estiver comprovado:
visto, não presumido.

Meus dados:
- Empresa: [NOME_DA_EMPRESA]
- Obra: [NOME_DA_OBRA]
- Começo da obra: [INICIO_DA_OBRA]
- Domínio de e-mail: [DOMINIO_DO_EMAIL]
- Meu e-mail: [SEU_EMAIL]

Regras que valem do início ao fim:
- Não rode npm nem git aqui. Quando precisar deles, me entregue o comando pronto, uma
  linha por vez, e eu rodo no terminal do Cursor.
- O GitHub é sempre pelo git, no terminal do Cursor, mesmo que apareça um conector do
  GitHub ligado.
- Banco e edge function: use as ferramentas do Supabase. Não me mande abrir o SQL
  Editor e colar coisa na mão.
- A publicação eu faço uma vez no site da Vercel, guiado por você. As ferramentas da
  Vercel você usa só para conferir.
- O arquivo banco.sql é a fonte do banco. Não crie tabela, coluna ou regra de acesso
  por conta própria, nem "melhore" o que está lá.
- Nunca crie usuário por SQL. Login novo nasce no site do Supabase (o meu, na ETAPA 5)
  ou no Painel de admin do app.
- A chave "service_role" do Supabase nunca vai para arquivo nenhum desta pasta e nunca
  aparece aqui no chat.
- Quando precisar de uma ação minha, peça uma de cada vez e espere eu responder.
- Me diga sempre onde cada coisa acontece: "aqui no chat", "no terminal do Cursor",
  "no navegador, no site do Supabase".

ETAPA 0: Reconheça a pasta
Leia: COMECE-AQUI.md, banco.sql, supabase/functions/admin-usuarios/index.ts,
src/marca.js, .env.example, package.json, .gitignore.
Me conte em 5 linhas o que o app faz e o que você vai fazer. Não mude nada ainda.

ETAPA 1: Deixe o app com a minha cara
Edite src/marca.js: nome = empresa, obra = obra, dominioEmail = domínio de e-mail,
inicioObra = o dia em que a obra começou, no formato AAAA-MM-DD (se eu não souber ou
não quiser, deixe vazio: aí o app não mostra o número da semana da obra).
Só esse arquivo. O nome da empresa passa a aparecer sozinho na tela de entrada, nos PDFs,
na aba do navegador e no atalho do celular.
Depois veja se existe o arquivo public/minha-logo.png:
- se existir, me avise que na ETAPA 6 eu vou rodar um comando que faz os ícones do
  app com a minha logo;
- se existir um arquivo parecido (minha-logo.png.png, minha-logo.jpg, logo.png), me
  diga como acertar o nome no Explorador de Arquivos;
- se não existir nenhum, tudo bem: o app fica com o ícone FP.
Pronto quando: você me mostra o marca.js editado e me diz se achou a logo.

ETAPA 2: O banco de dados
1. Liste os meus projetos do Supabase e me mostre a lista: nome, região e situação.
   - Se existir um chamado "flowplanner", use esse. Se ele estiver pausado, não
     restaure: me peça para clicar em Restore no site e espere. Se ele já tiver
     tabelas, me mostre quais: se forem as do FlowPlanner (de uma tentativa minha
     anterior), pode seguir, porque o banco.sql roda de novo sem apagar nada; se
     forem outras, pare e me pergunte.
   - Qualquer outro projeto: NÃO use, NÃO restaure e NÃO aplique nada nele. Ele pode
     ser de outro sistema meu.
   - Se não existir um "flowplanner", crie um com esse nome, na região de São Paulo
     (sa-east-1), no plano gratuito. Se o Supabase recusar porque o plano gratuito já
     tem 2 projetos ativos, ou pedir para aceitar algum custo, pare e me explique. Eu
     decido no site o que fazer. Nunca aceite custo sem me perguntar.
   Me avise que criar demora um ou dois minutos e espere ficar pronto.
2. Aplique o arquivo banco.sql INTEIRO como uma migration chamada "banco_inicial".
   Leia o arquivo e envie o conteúdo exatamente como está, sem resumir nem cortar nada.
   Se der um erro com as palavras "does not exist", envie de novo o arquivo inteiro
   com esta única linha na frente:
     set local check_function_bodies = off;
   Essa linha não cria nem muda nada no banco: só deixa a conferência das funções
   para depois.
   Se der qualquer outro erro, pare e me mostre a mensagem inteira. Não divida o
   arquivo e não conserte o banco.sql.
3. Confira: liste as tabelas, tem que haver 27. E rode
   "select count(*) from public.relatorio_semanal_config": tem que dar 1.
Pronto quando: as 27 tabelas aparecem e a contagem dá 1.

ETAPA 3: O Painel de admin (edge function)
Publique a edge function "admin-usuarios" com o arquivo
supabase/functions/admin-usuarios/index.ts desta pasta, com verificação de JWT ligada.
Depois liste as edge functions e me mostre que ela está ACTIVE.
Sem ela o app funciona, mas o Painel de admin, onde eu crio os logins da equipe, não.
Pronto quando: a admin-usuarios aparece ACTIVE.

ETAPA 4: Ligue o app ao banco
Pegue a URL do projeto e a chave pública "anon", a que começa com eyJ. Não use a
service_role. Crie o arquivo .env.local na raiz da pasta com exatamente estas duas
linhas:
  VITE_SUPABASE_URL=<a url>
  VITE_SUPABASE_ANON_KEY=<a chave anon>
Se já existir um .env.local com VITE_DEMO=1, substitua: essa linha faz o app rodar
com dados de mentira e nunca falar com o banco. Confirme que .env.local está no
.gitignore.
Pronto quando: você me mostra o conteúdo do arquivo (a chave anon pode aparecer, ela
não é segredo).

ETAPA 5: Meu login e duas chaves desligadas
Você não consegue criar o meu usuário por aqui: eu faço no site e você termina.
1. Me guie, uma tela por vez: "No navegador, entre em supabase.com e abra o projeto
   flowplanner. No menu da esquerda, passe o mouse nos ícones até achar
   Authentication e clique. Clique em Users, depois no botão Add user, depois em
   Create new user. E-mail: o seu, o mesmo do bloco Meus dados. Senha: uma que você
   vá lembrar, com pelo menos 8 letras e números. Marque a caixinha Auto Confirm User.
   Clique em Create user e volte aqui escrevendo criei."
2. Quando eu disser "criei", pergunte o meu primeiro nome e rode:
     update public.profiles
        set is_admin = true, role = 'engenheiro', nome = '<meu primeiro nome>'
      where id = (select id from auth.users where lower(email) = lower('<meu e-mail>'));
   e confira com "select nome, role, is_admin from public.profiles".
   Me explique: todo login novo nasce como visitante, que só olha. Quem dá o papel
   (engenheiro ou mestre) sou eu, pelo Painel de admin do app.
3. Agora me guie a desligar duas chaves no site, uma de cada vez: "Ainda em
   Authentication, no menu da esquerda, clique em Sign In / Providers.
   (a) Desligue a chave Allow new users to sign up e clique em Save. Assim ninguém
       de fora cria conta no seu app.
   (b) Na mesma tela, clique em Email. A primeira chave, Enable Email provider, fica
       LIGADA: sem ela ninguém entra no app. Desligue só a chave Confirm email e
       clique em Save. Sem isso, quem você cadastrar pode ficar travado com 'e-mail
       não confirmado', e o app não tem tela para confirmar."
   Confira as três: leia a configuração pública do login (GET em
   <a url do projeto>/auth/v1/settings, com o cabeçalho apikey = a chave anon) e veja
   "disable_signup": true, "mailer_autoconfirm": true e, dentro de "external",
   "email": true. Se você não conseguir ler por aqui, me peça um print da tela e
   confira nele.
Se mais tarde o app disser que o meu e-mail não foi confirmado, é porque a caixinha
Auto Confirm User ficou desmarcada. Aí rode:
  update auth.users set email_confirmed_at = now()
   where lower(email) = lower('<meu e-mail>') and email_confirmed_at is null;
Pronto quando: aparece a minha linha com o meu nome, role engenheiro e is_admin true,
e a leitura mostra "disable_signup": true, "mailer_autoconfirm": true e
"external": {"email": true}.

ETAPA 6: Ligar e testar
Me peça para rodar, no terminal do Cursor (a janela preta de baixo, não o chat):
  npm install
Avise antes: "leva de 1 a 5 minutos. No fim pode aparecer a palavra vulnerabilities:
é normal, são ferramentas de desenvolvimento. Não rode npm audit fix."
Se aparecer erro falando em npm.ps1 ou em "execução de scripts foi desabilitada", me
mande trocar o terminal para Command Prompt (setinha ao lado do + do terminal,
Command Prompt) e rodar de novo lá. Não me mande mudar configuração do Windows.
Se na ETAPA 1 você achou a minha logo, me peça em seguida:
  npm run icones
Ele faz os ícones do app com a minha logo. Sem logo, pule esta linha. Se ele der
erro, me diga que o app funciona igual, com o ícone FP, e siga.
Depois me peça:
  npm run dev
Avise: "o terminal fica ocupado enquanto o app está ligado. É assim mesmo: não feche
e não rode de novo. Para desligar, clique na janela preta e aperte Ctrl+C."
Vou abrir http://localhost:5173 no navegador (posso segurar Ctrl e clicar no link que
aparece no terminal). Na primeira vez a tela pode ficar uns segundos em "Carregando".
Me peça, um de cada vez, e espere eu responder:
 (1) entrar com o meu e-mail completo e a senha;
 (2) clicar em Pendências, + Nova, escrever um problema qualquer, Próximo até o fim e
     Criar pendência;
 (3) apertar F5 e ver se a pendência continua lá;
 (4) clicar na bolinha com a minha inicial (no computador, no pé da barra da
     esquerda; no celular, no alto da tela Início) e depois em Painel de admin: tem
     que aparecer a lista Usuários com o meu e-mail.
Se algo falhar, eu te colo o erro e você conserta, sem mexer no banco.sql.
Pronto quando: entrei, a pendência sobreviveu ao F5 e o Painel de admin mostrou o
meu e-mail.

ETAPA 7: Guardar no GitHub
Quem roda o git sou eu, no terminal do Cursor. Você me entrega os comandos prontos,
já com os meus dados, e confere comigo.
1. Me guie a criar o repositório, uma tela por vez: "No navegador, em github.com,
   clique no + no canto de cima, à direita, depois em New repository. Em Repository
   name escreva flowplanner-" seguido do nome curto da obra, em minúsculas, sem
   espaço e sem acento (ex.: flowplanner-aurora). "Marque Private. Não marque README,
   .gitignore nem license: o repositório tem que nascer vazio. Clique em Create
   repository e cole aqui o endereço da página que abrir." Se o GitHub disser que o
   nome já existe, sugira o mesmo nome terminado em -2.
2. Antes dos comandos, me avise de quatro coisas:
   (a) o terminal precisa estar livre: abra um terminal novo no + da janela do
       terminal (o app pode continuar ligado no outro);
   (b) é um comando por vez: cole, aperte Enter e espere a linha voltar a piscar
       antes do próximo, porque o terminal do Cursor não aceita juntar com &&;
   (c) no git add vão aparecer muitas linhas falando em "LF will be replaced by
       CRLF": é normal, não é erro;
   (d) no git push, na primeira vez, abre uma janela do GitHub no navegador pedindo
       para entrar: entre, clique em Authorize e volte ao terminal.
3. Antes, me pergunte com que e-mail eu criei a conta do GitHub. É ESSE que vai no
   user.email, mesmo que seja diferente do e-mail do app: com outro e-mail, a Vercel
   bloqueia a publicação. Depois me entregue estes comandos preenchidos, cada um num
   bloco separado, nesta ordem:
     git config --global user.name "<meu nome>"
     git config --global user.email "<o e-mail da minha conta do GitHub>"
     git init
     git add .
     git commit -m "FlowPlanner da obra <obra>"
     git branch -M main
     git remote add origin <o endereço que colei>.git
     git push -u origin main
   Se algum der erro, eu te colo a mensagem e você me diz o próximo passo.
4. Depois me peça para rodar:
     git ls-files .env.local
   Tem que voltar vazio, sem nenhuma linha. Se aparecer o nome do arquivo, pare: as
   chaves teriam subido, e você me guia a tirar.
Pronto quando: eu abro o endereço do repositório, vejo as pastas src, public e
supabase, e o git ls-files .env.local voltou vazio.

ETAPA 8: Publicar na Vercel
Quem publica sou eu, uma vez só, no site da Vercel. Depois disso cada "sobe pro
GitHub" publica sozinho. Você me guia e confere pelas ferramentas da Vercel.
1. O vercel.json já existe na raiz e diz à Vercel como montar o app. Não altere.
2. Me mostre, num bloco fácil de copiar, as duas variáveis com os valores do
   .env.local, uma por linha:
     VITE_SUPABASE_URL=<a url>
     VITE_SUPABASE_ANON_KEY=<a chave anon>
   (A chave anon é pública, pode aparecer aqui.)
3. Me guie, uma tela por vez, no navegador, em vercel.com:
   - Add New, depois Project.
   - Na lista Import Git Repository, ache o repositório flowplanner-... que criei na
     ETAPA 7 e clique em Import. Se ele não aparecer: clique em Adjust GitHub App
     Permissions (ou Install), escolha a minha conta, marque All repositories (ou só o
     flowplanner-...), Save, e volte.
   - Na tela Configure Project, abra Environment Variables. Cole o bloco inteiro no
     primeiro campo (Key): a Vercel separa as duas sozinha. Se não separar, cadastre
     uma por vez, com o nome no primeiro campo e o valor no segundo. Confira que
     ficaram as duas. Não mexa em Framework Preset nem em Root Directory: o
     vercel.json já cuida disso.
   - Clique em Deploy e espere uns 2 minutos, até aparecer a tela de parabéns.
4. Com as ferramentas da Vercel, confira que o projeto existe, que a última publicação
   está READY e que ela está ligada ao repositório. Se der erro, leia o log da
   publicação e me diga o que fazer, sem mexer no banco.sql. Se ela aparecer como
   Blocked (pelas ferramentas vem só o estado BLOCKED e um link de ajuda sobre
   colaboração; no site pode vir escrito que não achou conta do GitHub com o e-mail
   do autor do commit), o e-mail do git não é o da minha conta do GitHub. Me pergunte
   de novo o e-mail da conta do GitHub e me entregue, um de cada vez:
     git config --global user.email "<o e-mail da minha conta do GitHub>"
     git commit --allow-empty -m "publicar de novo"
     git push
   A Vercel publica sozinha esse commit novo. Confira de novo pelas ferramentas.
5. Me dê SÓ o link curto de produção, no formato https://<nome-do-projeto>.vercel.app.
   NUNCA me dê o link comprido, com letras e números no meio: esse pede login da
   Vercel e o meu mestre de obras não consegue abrir.
6. Me peça para abrir o link curto no celular e entrar com o meu login.
Pronto quando: o link curto abre no celular, eu entro, e a pendência que criei está lá.

ETAPA 9: Fechamento
1. Rode a verificação de segurança do Supabase (advisors) e me diga, em linguagem
   simples, se apareceu algo que eu precise fazer. Avisos sobre funções "security
   definer" e sobre "leaked password protection" são conhecidos e não impedem o uso.
2. Rode esta conferência:
     select has_column_privilege('authenticated','public.profiles','role','UPDATE') as muda_papel,
            has_column_privilege('authenticated','public.profiles','is_admin','UPDATE') as vira_admin;
   Tem que dar false nas duas colunas, muda_papel e vira_admin: ninguém logado consegue mudar o próprio papel nem se
   fazer administrador. Se der true em qualquer um, pare e me avise: o banco.sql
   desta pasta não é a versão certa.
3. Me entregue, numa lista curta: o link curto do app, o link do GitHub, o nome do
   projeto no Supabase e as três frases que eu vou usar daqui para frente:
   - "sobe pro GitHub": você me entrega três comandos (git add ., git commit -m "o que
     mudou" e git push) e eu rodo no terminal do Cursor, um de cada vez. A Vercel
     publica sozinha em um ou dois minutos;
   - "cria um usuário para o João, mestre": você me guia, ou eu mesmo faço no Painel
     de admin do app, botão + Novo;
   - "o que mudou hoje?": numa tarefa nova, você relê a pasta e me situa antes de
     mexer em qualquer coisa.
4. Me lembre: se o app ficar uma semana sem uso, o Supabase grátis pausa o projeto. É
   só entrar em supabase.com, abrir o projeto e clicar em Restore.
Pronto quando: você me entregou a lista e a conferência deu false | false.
```

---

## Deu certo quando

- O link curto da Vercel (o que termina em .vercel.app) abre no celular e você entra com o seu e-mail.
- Uma pendência criada no celular aparece no computador.
- No site do Supabase, no seu projeto, clique em Table Editor no menu da esquerda: a lista tem 27
  tabelas.
- No GitHub, o repositório mostra o código e **não** mostra `.env.local`.
- No site do Supabase, em Authentication, Sign In / Providers: "Allow new users to sign up" está
  desligado e, dentro de Email, "Confirm email" também.

De brinde: o efetivo que o mestre marca no canteiro aparece sozinho na tela do escritório.

## Cuidados com a equipe e as fotos

- **Dê login só a quem você confia e troque a senha de quem sair da equipe** (no Painel de admin):
  quem tem login de mestre ou engenheiro pode apagar registros.
- **Fotos:** quem recebe o link de uma foto consegue ver, como foto mandada no WhatsApp. O resto do
  app só abre com login.
- Todo login novo nasce como visitante, que só olha. Quem dá o papel (mestre ou engenheiro) é você,
  no Painel de admin: bolinha com a sua inicial, Painel de admin, + Novo.

## Se travar

Cole o erro **inteiro** no Cowork e diga em que etapa estava. Não tente consertar por conta: o app
foi testado, e o erro quase sempre é de chave, variável ou pasta, coisas que o Cowork resolve em um
minuto vendo a mensagem.

- **Apareceu aviso de limite de uso no Claude?** Numa sessão longa, o plano Pro pode bater no
  limite. Espere o horário que ele mostra e escreva, na mesma tarefa: "continue de onde parou".
- **Funcionava e parou?** Primeiro, veja se o app ficou uma semana sem uso: no plano grátis o
  Supabase pausa o projeto. Entre em supabase.com, abra o projeto e clique em Restore. Se não for
  isso, abra uma tarefa nova no Cowork, na mesma pasta, e escreva: "o app parou de funcionar;
  confira o .env.local, o projeto do Supabase e a Vercel e me diga o que mudou".
- **Alguém travou em "e-mail não confirmado"?** No site do Supabase, em Authentication, Sign In /
  Providers, Email: a chave "Confirm email" tem que estar desligada. Depois escreva no Cowork: "o
  login de fulano@empresa.com diz que o e-mail não foi confirmado".
- **A Vercel mostra "Blocked" e não publica?** Quase sempre é o e-mail do git diferente do e-mail da
  sua conta do GitHub. Escreva no Cowork: "a Vercel bloqueou a publicação". Ele te entrega três
  comandos (acertar o e-mail, um commit novo e o push) e, em um ou dois minutos, a Vercel publica
  sozinha.
- **Subiu pro GitHub e a Vercel não publicou?** Acontece de vez em quando no plano grátis: o código
  chega no GitHub, mas a Vercel não acorda. No site da Vercel, abra o projeto, vá em Settings, Git,
  desconecte o repositório e conecte de novo. A publicação volta a sair a cada envio.

## As três frases do dia a dia

- **"sobe pro GitHub"**: o Cowork te entrega três comandos prontos (git add, git commit e git push).
  Você cola no terminal do Cursor, um de cada vez. Em um ou dois minutos a Vercel publica sozinha.
- **"cria um usuário para o João, mestre"**: ou faça direto no Painel de admin do app, botão + Novo.
- **"o que mudou hoje?"**: numa tarefa nova, o Cowork relê a pasta e te situa.
