<div align="center">
  <h1>🍓 BugSnap</h1>
  <p><strong>A sua extensão definitiva de Chrome para Feedback e QA de Produtos</strong></p>
</div>

O **BugSnap** é uma extensão do Google Chrome – inspirada nas melhores práticas de mercado em ferramentas como Jam e Gen – desenvolvida especificamente para simplificar e documentar relatórios de bugs. Com apenas um clique, o BugSnap captura e junta tudo que o desenvolvedor precisa para entender o problema: Gravação de Tela (com voz), Console Logs, Requests de Rede e as configurações do Sistema do usuário (Hardware, Versão, Viewport).

## ✨ Principais Funcionalidades

- 📹 **Gravação de Vídeo Flutuante**: Grave a aba ou o desktop utilizando uma *Toolbar In-Page* não intrusiva com recursos em tempo real de Pausar e Mute de microfone.
- 📦 **Double-Download Automático**: Ao encerrar o vídeo, exporte **simultaneamente** sua tela no formato leve e fluído `.webm` e **toda a rede e erro lido por baixo dos panos** num formato estruturado `.json`. Fim dos relatórios de bugs ocos!
- 🎨 **Screenshot Anotado**: Tire um screenshot da página e desenhe, rabisque ou aponte alertas diretamente.
- 🛠️ **Dashboard Clássico & Debug**: Use o clássico dashboard da extensão para filtrar facilmente os fluxos 4xx, 5xx de rede e debater Warnings/Errors do Javascript Console da página sem precisar abrir o inspecionar (`F12`).
- ⚡ **Performance e Conformidade**: Código construído com compatibilidade estrita ao mais novo ecosistema **Chrome Manifest V3** (sem código remoto/RCE, respeitando todas as políticas de privacidade do usuário).

<br/>

## 🚀 Como instalar e usar localmente (Developer Mode)

Para testar a ferramenta, você pode usar o modo de desenvolvedor do local de trabalho do seu Google Chrome.

1. **Clone este repositório** para a sua máquina:
   ```bash
   git clone https://github.com/SeuUsuario/bugsnap.git
   cd bugsnap
   ```
   
2. Acesse a tela de gerenciamento de extensões do seu Navegador (URL: `chrome://extensions/`).

3. Ligue a chave `"Developer mode"` (Modo do desenvolvedor) que fica fixa no canto superior direito.

4. Pressione o botão **"Load unpacked"** (Carregar sem compactação) e selecione a pasta raiz desse `bugsnap` que você acabou de clonar no seu terminal.

5. **A extensão já está rodando!** Pin (fixe) o ícone de 'moranguinho' na sua barra superior, abra um projeto base (ex: `https://seu-website.com`), clique na extensão e use botão central para **Gravar a Tela**.

<br/>

## 🗂 Estrutura do Repositório (Arquitetura)

```
/ (Raiz)
 ├── manifest.json      # Configuração obrigatória MV3 (Permissões, Workers).
 ├── popup.html         # O "Front-End" principal (Menu Jam moderno e Painel de Dados).
 ├── core/              # O "Coração" Injetável da Plataforma
 │    ├── background.js # Service Worker que orquestra conexões com a API de Debugging (F12 nativo).
 │    ├── content.js    # Script de MediaRecorder (a barra de pílula "Jam" que flutua na tela).
 │    └── page-debug.js # Leitura de Console main-thread.
 ├── popup/             # Controladores MVC limitados à arquitetura do popup.html
 │    ├── main.js       # Controlador e despachador geral de views.
 │    ├── collect.js    # Coletor de informações de sistema (Sistema Operacional, URL, Bateria).
 │    ├── annotations.js# Engine de canvas usada nos screenshots.
 │    ├── render.js     # Dom update e listas (Filtros, Buscas).
 │    ├── exporters.js  # Helpers para Markdown listado e conversões JSON.
 │    └── ...
 └── css/
      ├── popup.css     # Estilos de menus novos e painéis.
      └── viewer.css    # Estilização de modais internas.
```

<br/>

## 🛡️ Permissões e Segurança (Compliance)

O **BugSnap** solicita as seguintes permissões para conseguir a profunda acurácia vista nos reports:
- `"debugger"`: Essa tag se atrela à Chrome Debugger API puramente para capturar as trilhas de Networking com sigílo (Sem a necessidade de proxies externos ou apps nativos).
- `"scripting"` & `"<all_urls>"`: Exigidos para injetarmos o botão de "Pausar Gravação" diretamente na renderização do site, acompanhando o usuário visualmente.

<br/>

## 🛠️ Tecnologias Utilizadas

- **HTML5 & CSS3** puros visando zero tempo de build (escala instantânea para QA).
- **Vanilla Javascript** (ES Module imports)
- Chrome Extension APIs (`chrome.debugger`, `chrome.scripting`, `chrome.tabs`, `chrome.runtime`)
- MediaRecorder API & Canvas API (Módulo de Anotação). 

---

<p align="center">
  Desenvolvido com carinho para otimização do time de QA e Engenharia!
</p>
