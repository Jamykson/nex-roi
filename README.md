# NEX · ROI de Projetos

Painel web para acompanhar o ROI (retorno sobre investimento) de projetos: cadastro de anos, projetos, colaboradores, alocação mensal de custo e ganhos (pontuais ou recorrentes).

100% HTML, CSS e JavaScript puro — sem frameworks, sem build, sem servidor. Os dados ficam salvos no navegador de quem estiver usando (`localStorage`).

## Como abrir

Não precisa instalar nada. Só abrir o arquivo `index.html` no navegador (duplo clique, ou clique direito → Abrir com → Chrome/Edge/Firefox).

Se você publicar isso no **GitHub Pages** (veja mais abaixo), também dá pra acessar por um link, sem precisar baixar nada.

## Estrutura dos arquivos

```
├── index.html        → a estrutura da página (o "esqueleto": menu, botões, tabelas, formulários)
├── css/
│   └── style.css     → toda a aparência (cores, fontes, espaçamento, o "visual" do site)
└── js/
    ├── store.js       → os "dados" e as contas: onde tudo é salvo e calculado
    └── app.js         → a "cola" entre os dados e a tela: o que acontece quando você clica em algo
```

Se você é iniciante, a ordem mais fácil de ler é: `index.html` primeiro (pra entender o que existe na tela), depois `js/app.js` (pra entender o que cada botão faz), e por último `js/store.js` (pra entender como os números são calculados). O `css/style.css` você só precisa olhar quando quiser mudar cores/fontes/tamanhos.

### `store.js` — o "banco de dados" (em memória)
Guarda tudo num único objeto `Store.data` com estas listas:
- `anos` — os anos cadastrados
- `projetos` — os projetos (cada um pertence a um ano)
- `colaboradores` — as pessoas e quanto cada uma custa por mês
- `alocacoes` — quanto % do tempo de cada pessoa foi pra cada projeto, em cada mês
- `ganhos` / `gastosExtras` — os lançamentos financeiros de cada projeto

Cada ação (criar, editar, remover) é uma função nesse arquivo, tipo `Store.criarAno(...)` ou `Store.salvarProjeto(...)`. Nenhuma dessas funções mexe na tela — só nos dados.

### `app.js` — a interface
Lê os dados do `Store` e desenha as tabelas/formulários na tela (funções `render...`), e escuta cliques/envios de formulário pra chamar as funções do `Store` (os `addEventListener` no final do arquivo).

## Como editar

**Direto no GitHub (mais simples, sem instalar nada):**
1. Abra o arquivo que quer mudar (ex.: `js/app.js`).
2. Clique no ícone de lápis (✏️) no canto superior direito do arquivo.
3. Edite o texto.
4. Desça a página, escreva uma frase curta dizendo o que mudou, e clique em **Commit changes**.

**No computador, com um editor de código (recomendado pra mexer bastante):**
1. Instale o [VS Code](https://code.visualstudio.com/) (gratuito).
2. Baixe este repositório (botão verde **Code → Download ZIP**, ou `git clone` se already usa Git).
3. Abra a pasta no VS Code.
4. Edite os arquivos e salve — depois é só atualizar no GitHub (veja a seção de Git abaixo).

## Publicar com link próprio (GitHub Pages)

1. No repositório, vá em **Settings → Pages**.
2. Em "Branch", escolha `main` e a pasta `/ (root)`. Clique em **Save**.
3. Espere ~1 minuto. O link vai aparecer ali mesmo, algo como `https://seu-usuario.github.io/nome-do-repositorio/`.

Qualquer novo commit que você fizer atualiza esse link automaticamente.

## Limitação importante

Os dados ficam salvos só no navegador de cada pessoa (`localStorage`) — não existe um servidor central. Ou seja: se você abrir o link em outro computador, ou trocar de navegador, vai ver o painel vazio. Pra levar dados de um lugar pro outro, use os botões **Exportar dados** / **Importar dados** no menu (eles baixam/leem um arquivo `.json` de backup).
