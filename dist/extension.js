"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate,
  deactivate: () => deactivate
});
module.exports = __toCommonJS(extension_exports);
var vscode = __toESM(require("vscode"));
var http = __toESM(require("http"));
var VSCortexChatViewProvider = class {
  constructor(extensionUri) {
    this.extensionUri = extensionUri;
  }
  static viewType = "vscortex-chat-view";
  webviewView;
  resolveWebviewView(webviewView, context, token) {
    console.log("VSCortex Chat View Provider - resolveWebviewView called");
    this.webviewView = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };
    webviewView.webview.html = this.getHtml();
    webviewView.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case "refreshModels":
            await this.refreshOllamaModels();
            break;
          case "selectModel":
            console.log("Selected model:", message.model);
            vscode.window.showInformationMessage(`Selected model: ${message.model}`);
            break;
          case "alert":
            vscode.window.showInformationMessage(message.text);
            break;
        }
      },
      void 0,
      []
    );
    this.refreshOllamaModels();
    console.log("VSCortex Chat View HTML set successfully");
  }
  async refreshOllamaModels() {
    try {
      console.log("Fetching Ollama models...");
      this.updateConnectionStatus("connecting");
      const models = await this.fetchOllamaModels();
      console.log(`Found ${models.length} Ollama models`);
      this.updateConnectionStatus("connected");
      this.updateModelsList(models);
    } catch (error) {
      console.error("Failed to fetch Ollama models:", error);
      this.updateConnectionStatus("error");
      this.updateModelsList([]);
      let errorMessage = "Unknown error";
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      vscode.window.showErrorMessage(`Failed to connect to Ollama: ${errorMessage}`);
    }
  }
  fetchOllamaModels() {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: "localhost",
        port: 11434,
        path: "/api/tags",
        method: "GET",
        timeout: 5e3
      };
      const req = http.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          try {
            const response = JSON.parse(data);
            resolve(response.models || []);
          } catch (parseError) {
            reject(new Error(`Failed to parse response: ${parseError}`));
          }
        });
      });
      req.on("error", (error) => {
        reject(new Error(`Connection failed: ${error.message}`));
      });
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Connection timeout - is Ollama server running?"));
      });
      req.end();
    });
  }
  updateConnectionStatus(status) {
    if (!this.webviewView) return;
    this.webviewView.webview.postMessage({
      command: "updateConnectionStatus",
      status
    });
  }
  updateModelsList(models) {
    if (!this.webviewView) return;
    this.webviewView.webview.postMessage({
      command: "updateModelsList",
      models
    });
  }
  getHtml() {
    return (
      /* html */
      `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>VSCortex Chat</title>
                <style>
                    body {
                        padding: 16px;
                        color: var(--vscode-foreground);
                        background-color: var(--vscode-editor-background);
                        font-family: var(--vscode-font-family);
                        font-size: var(--vscode-font-size);
                        margin: 0;
                    }
                    
                    .container {
                        display: flex;
                        flex-direction: column;
                        gap: 12px;
                    }
                    
                    .header {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        border-bottom: 1px solid var(--vscode-panel-border);
                        padding-bottom: 8px;
                        margin-bottom: 8px;
                    }
                    
                    .title {
                        margin: 0;
                        font-size: 16px;
                        font-weight: 600;
                    }
                    
                    .connection-status {
                        padding: 4px 8px;
                        border-radius: 12px;
                        font-size: 11px;
                        font-weight: 500;
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                    }
                    
                    .status-connecting {
                        background-color: var(--vscode-editorWarning-background);
                        color: var(--vscode-editorWarning-foreground);
                    }
                    
                    .status-connected {
                        background-color: var(--vscode-testing-iconPassed);
                        color: var(--vscode-editor-background);
                    }
                    
                    .status-error {
                        background-color: var(--vscode-errorForeground);
                        color: var(--vscode-editor-background);
                    }
                    
                    .refresh-btn {
                        background-color: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: none;
                        padding: 6px 12px;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 12px;
                        margin-bottom: 8px;
                        transition: background-color 0.2s;
                    }
                    
                    .refresh-btn:hover {
                        background-color: var(--vscode-button-hoverBackground);
                    }
                    
                    .refresh-btn:disabled {
                        opacity: 0.6;
                        cursor: not-allowed;
                    }
                    
                    .models-section {
                        display: flex;
                        flex-direction: column;
                        gap: 8px;
                    }
                    
                    .section-title {
                        font-size: 13px;
                        font-weight: 600;
                        color: var(--vscode-descriptionForeground);
                        margin: 0;
                    }
                    
                    .models-list {
                        display: flex;
                        flex-direction: column;
                        gap: 4px;
                        max-height: 400px;
                        overflow-y: auto;
                    }
                    
                    .model-item {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        padding: 8px 12px;
                        border: 1px solid var(--vscode-panel-border);
                        border-radius: 4px;
                        cursor: pointer;
                        transition: all 0.2s;
                        background-color: var(--vscode-list-inactiveSelectionBackground);
                    }
                    
                    .model-item:hover {
                        background-color: var(--vscode-list-hoverBackground);
                        border-color: var(--vscode-focusBorder);
                    }
                    
                    .model-item.selected {
                        background-color: var(--vscode-list-activeSelectionBackground);
                        border-color: var(--vscode-focusBorder);
                    }
                    
                    .model-info {
                        display: flex;
                        flex-direction: column;
                        flex: 1;
                    }
                    
                    .model-name {
                        font-weight: 500;
                        font-size: 13px;
                        margin-bottom: 2px;
                    }
                    
                    .model-details {
                        font-size: 11px;
                        color: var(--vscode-descriptionForeground);
                    }
                    
                    .model-size {
                        font-size: 11px;
                        color: var(--vscode-descriptionForeground);
                        font-weight: 500;
                    }
                    
                    .loading-spinner {
                        display: inline-block;
                        width: 16px;
                        height: 16px;
                        border: 2px solid var(--vscode-panel-border);
                        border-radius: 50%;
                        border-top-color: var(--vscode-progressBar-background);
                        animation: spin 1s ease-in-out infinite;
                        margin-right: 8px;
                    }
                    
                    @keyframes spin {
                        to { transform: rotate(360deg); }
                    }
                    
                    .empty-state {
                        text-align: center;
                        padding: 24px 16px;
                        color: var(--vscode-descriptionForeground);
                        font-size: 13px;
                    }
                    
                    .error-message {
                        background-color: var(--vscode-inputValidation-errorBackground);
                        border: 1px solid var(--vscode-inputValidation-errorBorder);
                        color: var(--vscode-errorForeground);
                        padding: 8px 12px;
                        border-radius: 4px;
                        font-size: 12px;
                        margin-bottom: 8px;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1 class="title">VSCortex</h1>
                        <div id="connectionStatus" class="connection-status status-connecting">
                            <span class="loading-spinner"></span>
                            Connecting
                        </div>
                    </div>
                    
                    <button id="refreshBtn" class="refresh-btn" onclick="refreshModels()">
                        Refresh Models
                    </button>
                    
                    <div class="models-section">
                        <h3 class="section-title">Available Models</h3>
                        <div id="modelsList" class="models-list">
                            <div class="empty-state">
                                <div class="loading-spinner"></div>
                                Loading models...
                            </div>
                        </div>
                    </div>
                </div>
                
                <script>
                    const vscode = acquireVsCodeApi();
                    let selectedModel = null;
                    
                    // Get state from vscode API
                    let state = vscode.getState() || { selectedModel: null };
                    selectedModel = state.selectedModel;
                    
                    function refreshModels() {
                        const btn = document.getElementById('refreshBtn');
                        btn.disabled = true;
                        btn.innerHTML = 'Refreshing...';
                        
                        vscode.postMessage({
                            command: 'refreshModels'
                        });
                        
                        setTimeout(() => {
                            btn.disabled = false;
                            btn.innerHTML = 'Refresh Models';
                        }, 2000);
                    }
                    
                    function selectModel(modelName) {
                        selectedModel = modelName;
                        vscode.setState({ selectedModel: modelName });
                        
                        // Update UI
                        document.querySelectorAll('.model-item').forEach(item => {
                            item.classList.remove('selected');
                        });
                        document.querySelector(\`[data-model="\${modelName}"]\`).classList.add('selected');
                        
                        vscode.postMessage({
                            command: 'selectModel',
                            model: modelName
                        });
                    }
                    
                    function formatBytes(bytes) {
                        if (bytes === 0) return '0 B';
                        const k = 1024;
                        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
                        const i = Math.floor(Math.log(bytes) / Math.log(k));
                        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
                    }
                    
                    function formatDate(dateString) {
                        const date = new Date(dateString);
                        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                    }
                    
                    // Handle messages from extension
                    window.addEventListener('message', event => {
                        const message = event.data;
                        
                        switch (message.command) {
                            case 'updateConnectionStatus':
                                updateConnectionStatus(message.status);
                                break;
                                
                            case 'updateModelsList':
                                updateModelsList(message.models);
                                break;
                        }
                    });
                    
                    function updateConnectionStatus(status) {
                        const statusEl = document.getElementById('connectionStatus');
                        statusEl.className = 'connection-status';
                        
                        switch (status) {
                            case 'connecting':
                                statusEl.classList.add('status-connecting');
                                statusEl.innerHTML = '<span class="loading-spinner"></span>Connecting';
                                break;
                            case 'connected':
                                statusEl.classList.add('status-connected');
                                statusEl.innerHTML = '\u25CF Connected';
                                break;
                            case 'error':
                                statusEl.classList.add('status-error');
                                statusEl.innerHTML = '\u25CF Error';
                                break;
                        }
                    }
                    
                    function updateModelsList(models) {
                        const modelsListEl = document.getElementById('modelsList');
                        
                        if (!models || models.length === 0) {
                            modelsListEl.innerHTML = \`
                                <div class="empty-state">
                                    No models found.<br>
                                    Make sure Ollama is running and has models installed.
                                </div>
                            \`;
                            return;
                        }
                        
                        modelsListEl.innerHTML = models.map(model => \`
                            <div class="model-item \${selectedModel === model.name ? 'selected' : ''}" 
                                 data-model="\${model.name}" 
                                 onclick="selectModel('\${model.name}')">
                                <div class="model-info">
                                    <div class="model-name">\${model.name}</div>
                                    <div class="model-details">
                                        \${model.details?.parameter_size || 'Unknown size'} \u2022 
                                        \${model.details?.family || 'Unknown family'}
                                    </div>
                                </div>
                                <div class="model-size">\${formatBytes(model.size)}</div>
                            </div>
                        \`).join('');
                    }
                    
                    console.log('VSCortex Chat webview loaded successfully');
                </script>
            </body>
            </html>
        `
    );
  }
};
function activate(context) {
  console.log('Congratulations, your extension "vscortex" is now active!');
  const disposable = vscode.commands.registerCommand("vscortex.helloWorld", () => {
    vscode.window.showInformationMessage("Hello World from VSCortex! IT IS ME!!!");
  });
  context.subscriptions.push(disposable);
  const provider = new VSCortexChatViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      VSCortexChatViewProvider.viewType,
      provider,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );
  console.log("Provider registered for", VSCortexChatViewProvider.viewType);
}
function deactivate() {
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
//# sourceMappingURL=extension.js.map
