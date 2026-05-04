# BugSnap Progress

## Visao geral

`BugSnap` e uma extensao Chrome MV3 inspirada no JAM, focada em capturar contexto tecnico de bugs direto do navegador.

O objetivo atual do MVP e:

- capturar screenshot da aba atual
- gravar tela com áudio e vídeo
- coletar URL, titulo, browser, OS, resolucao e viewport
- capturar logs de console
- capturar requests de rede
- permitir anotacoes na screenshot
- exportar relatorio em `Markdown` e `JSON`
- exportar gravação em `WEBM/MP4` e dados da sessão em `JSON`
- gerar link local para visualizacao do relatorio no mesmo navegador/perfil

## Estado atual do projeto

O projeto esta funcional como MVP local e hoje possui:

- popup com abas `Info`, `Console`, `Network`, `Screenshot` e `Gravar`
- captura de screenshot visivel da aba
- gravação de tela com áudio sincronizado
- anotacao manual sobre a screenshot
- export `JSON` de sessão (logs + network + metadata)
- export `Markdown` de screenshot
- export de vídeo da gravação
- copia de resumo para clipboard
- copia de link local para visualizacao do relatorio
- viewer local para abrir relatorios salvos em `chrome.storage.local`
- limpeza de buffers de debug por aba

## Arquitetura atual

### Manifest

Arquivo: [manifest.json](/home/celso/www/repositories/jam-clone/manifest.json)

- extensao Chrome `manifest_version: 3`
- `background service worker` em `background.js`
- `content script` isolado em `content.js`
- `content script` no `MAIN world` em `page-debug.js`
- permissoes principais:
  - `activeTab`
  - `tabs`
  - `debugger`
  - `scripting`
  - `storage`

### Camadas de captura

#### 1. `page-debug.js`

Arquivo: [page-debug.js](/home/celso/www/repositories/jam-clone/page-debug.js)

Responsavel por rodar no contexto principal da pagina e instrumentar:

- `console.log`
- `console.info`
- `console.warn`
- `console.error`
- `console.debug`
- `console.trace`
- `console.dir`
- `console.dirxml`
- `console.table`
- `console.assert`
- `window.error`
- `window.unhandledrejection`
- `fetch`
- `XMLHttpRequest`

Tambem mantem um buffer global na pagina:

- `window.__BUGSNAP_DEBUG_STORE__`

Esse store guarda:

- `consoleLogs`
- `networkRequests`
- `bootedAt`
- `version`

#### 2. `content.js`

Arquivo: [content.js](/home/celso/www/repositories/jam-clone/content.js)

Responsavel por:

- coletar informacoes da pagina
- ouvir eventos vindos de `window.postMessage`
- manter buffers auxiliares locais
- responder mensagens do popup:
  - `GET_PAGE_INFO`
  - `GET_DEBUG_DATA`
  - `CLEAR_DEBUG_DATA`

#### 3. `background.js`

Arquivo: [background.js](/home/celso/www/repositories/jam-clone/background.js)

Responsavel por:

- anexar `chrome.debugger` na aba ativa
- capturar logs e eventos de rede via DevTools Protocol
- capturar screenshot da aba visivel
- manter buffers por `tabId`
- limpar buffers por aba

O `background` hoje funciona como fonte complementar de debug, enquanto o detalhamento rico de request esta priorizado no `MAIN world`.

### Camada do popup

Arquivos principais:

- [popup/main.js](/home/celso/www/repositories/jam-clone/popup/main.js)
- [popup/collect.js](/home/celso/www/repositories/jam-clone/popup/collect.js)
- [popup/render.js](/home/celso/www/repositories/jam-clone/popup/render.js)
- [popup/exporters.js](/home/celso/www/repositories/jam-clone/popup/exporters.js)
- [popup/annotations.js](/home/celso/www/repositories/jam-clone/popup/annotations.js)
- [popup/share.js](/home/celso/www/repositories/jam-clone/popup/share.js)
- [popup/dom.js](/home/celso/www/repositories/jam-clone/popup/dom.js)
- [popup.html](/home/celso/www/repositories/jam-clone/popup.html)

Separacao de responsabilidades:

- `main.js`: orquestra popup, tabs, refresh, clear e exports
- `collect.js`: junta dados de `content`, `MAIN world` e `background`
- `render.js`: renderiza `Info`, `Console`, `Network`, diagnostico e screenshot
- `annotations.js`: desenho livre, caixa, cores, desfazer e limpar sobre screenshot
- `exporters.js`: export `JSON`, export `Markdown`, copia resumo
- `share.js`: cria link local e copia link
- `dom.js`: helpers pequenos de DOM e formatacao

### Viewer local

Arquivos:

- [viewer.html](/home/celso/www/repositories/jam-clone/viewer.html)
- [viewer.js](/home/celso/www/repositories/jam-clone/viewer.js)

Responsavel por abrir relatorios salvos localmente no `chrome.storage.local`.

## Funcionalidades implementadas

### 1. Coleta de contexto da pagina

Ja captura:

- URL
- titulo
- referrer
- `readyState`
- scroll
- viewport
- dimensoes do documento
- timezone
- idioma
- cookies habilitados
- status online
- performance basica:
  - `TTFB`
  - `DOMContentLoaded`
  - `Load`

### 2. Captura de console

Ja captura:

- `log`
- `info`
- `warn`
- `error`
- `debug`
- `trace`
- `dir`
- `dirxml`
- `table`
- `assert` quando falha
- erros globais
- `unhandledrejection`

No popup:

- busca textual
- filtro por tipo
- contadores por categoria
- diagnostico discreto quando a captura vier vazia
- botao para limpar os dados

### 3. Captura de network

Ja captura:

- `fetch`
- `XMLHttpRequest`
- requests vindas do debugger como fonte complementar

Metadados atuais por request:

- `url`
- `method`
- `initiator`
- `status`
- `statusText`
- `timestamp`
- `queryParams`
- `requestHeaders`
- `requestBody`
- `hasQueryParams`
- `hasRequestBody`
- `truncated`
- `failed`

Tratamento atual de body:

- string
- JSON textual
- `URLSearchParams`
- `FormData`
- `Blob`
- `ArrayBuffer`
- `TypedArray`
- valores nao serializaveis como representacao textual

No popup:

- busca textual
- filtro por falha, `4xx`, `5xx`, `xhr`, `fetch`
- resumo com contadores
- items expansivos com:
  - URL completa
  - timestamp
  - query params
  - headers
  - request body
- botao para limpar os dados

### 4. Screenshot e anotacoes

Ja implementado:

- screenshot automatica da aba visivel
- preview no popup
- anotacoes com:
  - caneta
  - caixa
  - cores
  - desfazer
  - limpar

As anotacoes entram no export `JSON`.

### 5. Gravação de Tela (Floating Toolbar)

Já implementado usando injeção nativa na página:

- Início da gravação via menu inicial moderno (estilo Jam).
- Injeção de uma **Toolbar Flutuante** (Pílula Preta) na página, contornando limitações do popup do Chrome.
- Captura de áudio do microfone e da guia com botões de Pausar e Mute interativos na pílula.
- Timer com "Time Freeze" (acuidade ao pausar a gravação).
- Bypass do `Chrome Tab Picker` para permitir a seleção da aba atual (`selfBrowserSurface: "include"`).
- **Double-Download Automático**: Ao parar a gravação na toolbar, exportação simultânea do vídeo `.webm` e dos dados de sessão (`.json` sincronizado com logs + network).

### 5. Exports

#### JSON

Inclui:

- metadados do bug
- dados de pagina
- sistema
- console
- network
- screenshot
- anotacoes

#### Markdown

Ja foi melhorado para incluir:

- resumo executivo
- descricao
- diagnostico rapido
- passos observados
- ambiente
- performance
- sinais principais
- console
- network
- requests principais
- diagnostico da captura quando faltar dado
- anexos

Arquivo de exemplo:

- [bugsnap-2026-04-28.md](/home/celso/www/repositories/jam-clone/bugsnap-2026-04-28.md)

### 6. Compartilhamento local

Ja implementado:

- botao `Copiar link`
- salvamento do relatorio em `chrome.storage.local`
- abertura via viewer local

Limitacao atual:

- o link funciona no mesmo navegador/perfil onde o relatorio foi salvo
- ainda nao existe backend nem compartilhamento real entre pessoas

## Melhorias feitas ao longo da evolucao

### Refatoracao do popup

O antigo `popup.js` grande foi quebrado em modulos menores para facilitar manutencao.

### Correcao de duplicacao de listeners

O fluxo de refresh do popup foi ajustado para nao anexar listeners repetidos a cada atualizacao.

### Robustez da captura

Houve uma migracao importante:

- de tentativa de injecao inline
- para captura via `content_script` no `MAIN world`

Isso foi feito para contornar politicas de `CSP` mais restritivas.

### Diagnostico de captura

Foi adicionada telemetria interna para ajudar a diferenciar:

- ausencia real de eventos
- falha na ponte de captura
- falha no `MAIN world`

Campos atuais:

- `bridgeConsoleCount`
- `bridgeNetworkCount`
- `mainWorldConsoleCount`
- `mainWorldNetworkCount`
- `mainWorldVersion`
- `mainWorldBootedAt`

### Limpeza de buffers

Foi implementado `clear` por aba atual, limpando:

- buffer do `content.js`
- buffer do `background.js`
- buffer do `MAIN world`
- estado atual do popup

## Fluxo atual de uso

1. Recarregar a extensao em `chrome://extensions`
2. Abrir a pagina alvo
3. Interagir com o sistema ate reproduzir o problema
4. Abrir o popup do BugSnap
5. Revisar:
   - `Info`
   - `Console`
   - `Network`
   - `Screenshot`
6. Anotar a screenshot se necessario
7. Exportar:
   - `JSON`
   - `Markdown`
   - `Copiar resumo`
   - `Copiar link`

## Limitacoes conhecidas

- o compartilhamento por link ainda e apenas local
- response body de requests ainda nao e capturado
- o relatorio `Markdown` ainda depende do usuario preencher melhor a descricao para virar artefato mais forte
- requests muito grandes sao truncadas por seguranca/performance
- streams/binarios nao sao serializados completamente

## Proximos passos recomendados

### Curto prazo

- destacar automaticamente erros e requests suspeitas no topo
- melhorar mais o texto do `.md` com esperado/obtido preenchiveis
- permitir expandir melhor payloads complexos no popup
- adicionar um bloco visual para status da captura no popup

### Medio prazo

- suporte opcional a response body
- viewer local com mais acoes:
  - copiar `JSON`
  - copiar `Markdown`
  - destacar falhas

### Longo prazo

- backend para compartilhamento real
- links compartilhaveis entre usuarios
- integracoes externas

## Resumo executivo

Hoje o projeto ja e um MVP funcional de extensao para captura de bugs com:

- screenshot
- anotacao
- console
- network
- contexto tecnico
- export `JSON`
- export `Markdown`
- link local

O nucleo da ferramenta esta montado. O que falta daqui para frente e mais polimento, confiabilidade final em cenarios reais e evolucao do compartilhamento.
