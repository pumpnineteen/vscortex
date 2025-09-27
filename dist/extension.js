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
  constructor(extensionUri, context) {
    this.extensionUri = extensionUri;
    this.context = context;
  }
  static viewType = "vscortex-chat-view";
  webviewView;
  context;
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
            await this.selectModel(message.model);
            break;
          case "toggleModelSelector":
            this.toggleModelSelector(message.collapsed);
            break;
          case "sendMessage":
            await this.sendChatMessage(message.text);
            break;
          case "alert":
            vscode.window.showInformationMessage(message.text);
            break;
        }
      },
      void 0,
      []
    );
    setTimeout(() => {
      this.initializeChat().catch((error) => {
        console.error("Failed to initialize chat:", error);
      });
    }, 100);
    console.log("VSCortex Chat View HTML set successfully");
  }
  async initializeChat() {
    console.log("Initializing VSCortex chat...");
    try {
      const savedModel = this.context.globalState.get("vscortex.selectedModel");
      console.log("Saved model from state:", savedModel);
      console.log("Fetching Ollama models...");
      this.updateConnectionStatus("connecting");
      const models = await this.fetchOllamaModels();
      console.log(`Found ${models.length} Ollama models:`, models.map((m) => m.name));
      this.updateConnectionStatus("connected");
      this.updateModelsList(models);
      const modelExists = models.some((model) => model.name === savedModel);
      console.log("Saved model exists:", modelExists);
      if (savedModel && modelExists) {
        console.log(`Restoring saved model: ${savedModel}`);
        await this.selectModel(savedModel, true);
        this.setModelSelectorCollapsed(true);
      } else {
        if (savedModel) {
          console.log(`Saved model '${savedModel}' no longer available`);
          vscode.window.showWarningMessage(`Previously selected model '${savedModel}' is no longer available`);
          await this.context.globalState.update("vscortex.selectedModel", void 0);
        }
        this.setModelSelectorCollapsed(false);
      }
      console.log("Chat initialization completed successfully");
    } catch (error) {
      console.error("Failed to initialize chat:", error);
      this.updateConnectionStatus("error");
      this.updateModelsList([]);
      this.setModelSelectorCollapsed(false);
      let errorMessage = "Unknown error";
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      vscode.window.showErrorMessage(`Failed to connect to Ollama: ${errorMessage}`);
    }
  }
  async selectModel(modelName, silent = false) {
    await this.context.globalState.update("vscortex.selectedModel", modelName);
    this.updateSelectedModel(modelName);
    if (!silent) {
      vscode.window.showInformationMessage(`Selected model: ${modelName}`);
      this.setModelSelectorCollapsed(true);
    }
    console.log("Model selected and saved:", modelName);
  }
  setModelSelectorCollapsed(collapsed) {
    if (!this.webviewView) return;
    this.webviewView.webview.postMessage({
      command: "setModelSelectorCollapsed",
      collapsed
    });
  }
  toggleModelSelector(collapsed) {
  }
  updateSelectedModel(modelName) {
    if (!this.webviewView) return;
    this.webviewView.webview.postMessage({
      command: "updateSelectedModel",
      modelName
    });
  }
  async sendChatMessage(message) {
    const selectedModel = this.context.globalState.get("vscortex.selectedModel");
    if (!selectedModel) {
      vscode.window.showWarningMessage("Please select a model first");
      return;
    }
    console.log(`Sending message to ${selectedModel}:`, message);
    this.addChatMessage("user", message);
    try {
      const response = `[${selectedModel}] Echo: ${message}`;
      setTimeout(() => {
        this.addChatMessage("assistant", response);
      }, 1e3);
    } catch (error) {
      console.error("Failed to send chat message:", error);
      this.addChatMessage("error", "Failed to send message. Please check your connection to Ollama.");
    }
  }
  addChatMessage(type, message) {
    if (!this.webviewView) return;
    this.webviewView.webview.postMessage({
      command: "addChatMessage",
      message: {
        type,
        content: message,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      }
    });
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
      console.log("Creating HTTP request to Ollama...");
      const options = {
        hostname: "localhost",
        port: 11434,
        path: "/api/tags",
        method: "GET",
        timeout: 5e3
      };
      console.log("Request options:", options);
      const req = http.request(options, (res) => {
        console.log("Received response from Ollama, status:", res.statusCode);
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
          console.log("Received data chunk, total length:", data.length);
        });
        res.on("end", () => {
          console.log("Response completed, data:", data);
          try {
            const response = JSON.parse(data);
            console.log("Parsed response:", response);
            resolve(response.models || []);
          } catch (parseError) {
            console.error("Failed to parse Ollama response:", parseError);
            reject(new Error(`Failed to parse response: ${parseError}`));
          }
        });
      });
      req.on("error", (error) => {
        console.error("HTTP request error:", error);
        reject(new Error(`Connection failed: ${error.message}`));
      });
      req.on("timeout", () => {
        console.error("HTTP request timeout");
        req.destroy();
        reject(new Error("Connection timeout - is Ollama server running?"));
      });
      console.log("Sending HTTP request...");
      req.end();
    });
  }
  updateConnectionStatus(status) {
    console.log("Updating connection status to:", status);
    if (!this.webviewView) {
      console.warn("Cannot update connection status - webview not available");
      return;
    }
    this.webviewView.webview.postMessage({
      command: "updateConnectionStatus",
      status
    });
    console.log("Connection status message sent to webview");
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
                        transition: all 0.3s ease;
                    }
                    
                    .models-header {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        cursor: pointer;
                        padding: 4px 0;
                        user-select: none;
                    }
                    
                    .models-header:hover .section-title {
                        color: var(--vscode-foreground);
                    }
                    
                    .expand-icon {
                        transition: transform 0.2s ease;
                        font-size: 12px;
                        color: var(--vscode-descriptionForeground);
                    }
                    
                    .expand-icon.expanded {
                        transform: rotate(90deg);
                    }
                    
                    .selected-model-display {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        padding: 8px 12px;
                        background-color: var(--vscode-list-activeSelectionBackground);
                        border: 1px solid var(--vscode-focusBorder);
                        border-radius: 4px;
                        cursor: pointer;
                        margin-bottom: 8px;
                    }
                    
                    .selected-model-display:hover {
                        background-color: var(--vscode-list-hoverBackground);
                    }
                    
                    .selected-model-info {
                        display: flex;
                        flex-direction: column;
                    }
                    
                    .selected-model-name {
                        font-weight: 500;
                        font-size: 13px;
                        color: var(--vscode-foreground);
                    }
                    
                    .selected-model-label {
                        font-size: 11px;
                        color: var(--vscode-descriptionForeground);
                    }
                    
                    .models-list {
                        display: flex;
                        flex-direction: column;
                        gap: 4px;
                        max-height: 300px;
                        overflow-y: auto;
                        transition: all 0.3s ease;
                    }
                    
                    .models-list.collapsed {
                        max-height: 0;
                        overflow: hidden;
                        opacity: 0;
                    }
                    
                    .section-title {
                        font-size: 13px;
                        font-weight: 600;
                        color: var(--vscode-descriptionForeground);
                        margin: 0;
                        transition: color 0.2s ease;
                    }
                    
                    .chat-section {
                        display: flex;
                        flex-direction: column;
                        gap: 12px;
                        flex: 1;
                        min-height: 200px;
                    }
                    
                    .chat-messages {
                        display: flex;
                        flex-direction: column;
                        gap: 8px;
                        flex: 1;
                        overflow-y: auto;
                        max-height: 400px;
                        padding: 8px;
                        background-color: var(--vscode-editor-background);
                        border: 1px solid var(--vscode-panel-border);
                        border-radius: 4px;
                    }
                    
                    .chat-message {
                        display: flex;
                        flex-direction: column;
                        gap: 4px;
                        padding: 8px 12px;
                        border-radius: 8px;
                        max-width: 85%;
                        word-wrap: break-word;
                    }
                    
                    .chat-message.user {
                        align-self: flex-end;
                        background-color: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                    }
                    
                    .chat-message.assistant {
                        align-self: flex-start;
                        background-color: var(--vscode-list-inactiveSelectionBackground);
                        color: var(--vscode-foreground);
                        border: 1px solid var(--vscode-panel-border);
                    }
                    
                    .chat-message.error {
                        align-self: flex-start;
                        background-color: var(--vscode-inputValidation-errorBackground);
                        color: var(--vscode-errorForeground);
                        border: 1px solid var(--vscode-inputValidation-errorBorder);
                    }
                    
                    .message-content {
                        font-size: 13px;
                        line-height: 1.4;
                        margin: 0;
                    }
                    
                    .message-timestamp {
                        font-size: 10px;
                        opacity: 0.7;
                        align-self: flex-end;
                    }
                    
                    .chat-input-container {
                        display: flex;
                        gap: 8px;
                        padding: 8px;
                        background-color: var(--vscode-input-background);
                        border: 1px solid var(--vscode-input-border);
                        border-radius: 4px;
                    }
                    
                    .chat-input {
                        flex: 1;
                        background: transparent;
                        border: none;
                        color: var(--vscode-input-foreground);
                        font-family: var(--vscode-font-family);
                        font-size: 13px;
                        padding: 4px 0;
                        outline: none;
                        resize: none;
                        min-height: 20px;
                        max-height: 100px;
                    }
                    
                    .chat-input::placeholder {
                        color: var(--vscode-input-placeholderForeground);
                    }
                    
                    .send-button {
                        background-color: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: none;
                        padding: 6px 12px;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 12px;
                        align-self: flex-end;
                        transition: background-color 0.2s;
                    }
                    
                    .send-button:hover {
                        background-color: var(--vscode-button-hoverBackground);
                    }
                    
                    .send-button:disabled {
                        opacity: 0.6;
                        cursor: not-allowed;
                    }
                    
                    .no-model-warning {
                        text-align: center;
                        padding: 16px;
                        color: var(--vscode-editorWarning-foreground);
                        background-color: var(--vscode-editorWarning-background);
                        border: 1px solid var(--vscode-editorWarning-foreground);
                        border-radius: 4px;
                        font-size: 12px;
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
                        \u{1F504} Refresh Models
                    </button>
                    
                    <!-- Selected model display (shown when collapsed) -->
                    <div id="selectedModelDisplay" class="selected-model-display" style="display: none;" onclick="toggleModelSelector()">
                        <div class="selected-model-info">
                            <div id="selectedModelName" class="selected-model-name"></div>
                            <div class="selected-model-label">Selected Model</div>
                        </div>
                        <div class="expand-icon">\u25B6</div>
                    </div>
                    
                    <div class="models-section">
                        <div class="models-header" onclick="toggleModelSelector()">
                            <h3 class="section-title">Available Models</h3>
                            <div id="modelsExpandIcon" class="expand-icon">\u25B6</div>
                        </div>
                        <div id="modelsList" class="models-list">
                            <div class="empty-state">
                                <div class="loading-spinner"></div>
                                Loading models...
                            </div>
                        </div>
                    </div>
                    
                    <div class="chat-section">
                        <div id="chatMessages" class="chat-messages">
                            <div class="empty-state">
                                Select a model to start chatting
                            </div>
                        </div>
                        
                        <div id="chatInputContainer" class="chat-input-container">
                            <textarea id="chatInput" class="chat-input" placeholder="Type your message..." 
                                     rows="1" onkeydown="handleInputKeydown(event)" oninput="adjustTextareaHeight()"></textarea>
                            <button id="sendButton" class="send-button" onclick="sendMessage()" disabled>Send</button>
                        </div>
                        
                        <div id="noModelWarning" class="no-model-warning" style="display: none;">
                            Please select a model above to start chatting
                        </div>
                    </div>
                </div>
                
                <script>
                    console.log('VSCortex webview script starting...');
                    
                    const vscode = acquireVsCodeApi();
                    let selectedModel = null;
                    let modelSelectorCollapsed = false;
                    
                    console.log('VSCode API acquired:', !!vscode);
                    
                    // Get state from vscode API
                    let state = vscode.getState() || { selectedModel: null, modelSelectorCollapsed: false };
                    selectedModel = state.selectedModel;
                    modelSelectorCollapsed = state.modelSelectorCollapsed;
                    
                    console.log('Initial state loaded:', state);
                    
                    // Test if DOM elements exist
                    function checkDOM() {
                        const statusEl = document.getElementById('connectionStatus');
                        const modelsListEl = document.getElementById('modelsList');
                        console.log('DOM check - statusEl:', !!statusEl, 'modelsListEl:', !!modelsListEl);
                        return statusEl && modelsListEl;
                    }
                    
                    function refreshModels() {
                        console.log('refreshModels called');
                        const btn = document.getElementById('refreshBtn');
                        btn.disabled = true;
                        btn.innerHTML = '\u{1F504} Refreshing...';
                        
                        vscode.postMessage({
                            command: 'refreshModels'
                        });
                        
                        setTimeout(() => {
                            btn.disabled = false;
                            btn.innerHTML = '\u{1F504} Refresh Models';
                        }, 2000);
                    }
                    
                    function selectModel(modelName) {
                        console.log('selectModel called with:', modelName);
                        selectedModel = modelName;
                        vscode.setState({ selectedModel: modelName, modelSelectorCollapsed: modelSelectorCollapsed });
                        
                        vscode.postMessage({
                            command: 'selectModel',
                            model: modelName
                        });
                    }
                    
                    function toggleModelSelector() {
                        console.log('toggleModelSelector called');
                        modelSelectorCollapsed = !modelSelectorCollapsed;
                        vscode.setState({ selectedModel: selectedModel, modelSelectorCollapsed: modelSelectorCollapsed });
                        
                        setModelSelectorCollapsed(modelSelectorCollapsed);
                        
                        vscode.postMessage({
                            command: 'toggleModelSelector',
                            collapsed: modelSelectorCollapsed
                        });
                    }
                    
                    function setModelSelectorCollapsed(collapsed) {
                        console.log('setModelSelectorCollapsed called with:', collapsed);
                        const modelsList = document.getElementById('modelsList');
                        const expandIcon = document.getElementById('modelsExpandIcon');
                        const selectedDisplay = document.getElementById('selectedModelDisplay');
                        
                        if (!modelsList || !expandIcon || !selectedDisplay) {
                            console.error('Missing DOM elements for collapse');
                            return;
                        }
                        
                        modelSelectorCollapsed = collapsed;
                        
                        if (collapsed) {
                            modelsList.classList.add('collapsed');
                            expandIcon.classList.remove('expanded');
                            if (selectedModel) {
                                selectedDisplay.style.display = 'flex';
                            }
                        } else {
                            modelsList.classList.remove('collapsed');
                            expandIcon.classList.add('expanded');
                            selectedDisplay.style.display = 'none';
                        }
                    }
                    
                    function updateChatUI() {
                        console.log('updateChatUI called');
                        const chatInput = document.getElementById('chatInput');
                        const sendButton = document.getElementById('sendButton');
                        const noModelWarning = document.getElementById('noModelWarning');
                        const chatMessages = document.getElementById('chatMessages');
                        
                        if (selectedModel) {
                            chatInput.disabled = false;
                            sendButton.disabled = false;
                            noModelWarning.style.display = 'none';
                            
                            if (chatMessages.children.length === 1 && chatMessages.children[0].classList.contains('empty-state')) {
                                chatMessages.innerHTML = '';
                            }
                        } else {
                            chatInput.disabled = true;
                            sendButton.disabled = true;
                            noModelWarning.style.display = 'block';
                        }
                    }
                    
                    function sendMessage() {
                        console.log('sendMessage called');
                        const input = document.getElementById('chatInput');
                        const message = input.value.trim();
                        
                        if (!message || !selectedModel) return;
                        
                        vscode.postMessage({
                            command: 'sendMessage',
                            text: message
                        });
                        
                        input.value = '';
                        adjustTextareaHeight();
                    }
                    
                    function handleInputKeydown(event) {
                        if (event.key === 'Enter') {
                            if (event.shiftKey) {
                                return;
                            } else {
                                event.preventDefault();
                                sendMessage();
                            }
                        }
                    }
                    
                    function adjustTextareaHeight() {
                        const textarea = document.getElementById('chatInput');
                        textarea.style.height = 'auto';
                        textarea.style.height = Math.min(textarea.scrollHeight, 100) + 'px';
                    }
                    
                    function formatBytes(bytes) {
                        if (bytes === 0) return '0 B';
                        const k = 1024;
                        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
                        const i = Math.floor(Math.log(bytes) / Math.log(k));
                        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
                    }
                    
                    function formatTimestamp(isoString) {
                        const date = new Date(isoString);
                        return date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                    }
                    
                    function updateConnectionStatus(status) {
                        console.log('updateConnectionStatus called with:', status);
                        const statusEl = document.getElementById('connectionStatus');
                        
                        if (!statusEl) {
                            console.error('Connection status element not found!');
                            return;
                        }
                        
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
                        console.log('Status updated to:', status);
                    }
                    
                    function updateSelectedModel(modelName) {
                        console.log('updateSelectedModel called with:', modelName);
                        selectedModel = modelName;
                        
                        const selectedModelName = document.getElementById('selectedModelName');
                        if (selectedModelName) {
                            selectedModelName.textContent = modelName;
                        }
                        
                        document.querySelectorAll('.model-item').forEach(item => {
                            item.classList.remove('selected');
                        });
                        const modelItem = document.querySelector('[data-model="' + modelName + '"]');
                        if (modelItem) {
                            modelItem.classList.add('selected');
                        }
                        
                        updateChatUI();
                    }
                    
                    function updateModelsList(models) {
                        console.log('updateModelsList called with models:', models);
                        const modelsListEl = document.getElementById('modelsList');
                        
                        if (!modelsListEl) {
                            console.error('Models list element not found!');
                            return;
                        }
                        
                        if (!models || models.length === 0) {
                            console.log('No models to display');
                            modelsListEl.innerHTML = 
                                '<div class="empty-state">' +
                                    'No models found.<br>' +
                                    'Make sure Ollama is running and has models installed.' +
                                '</div>';
                            return;
                        }
                        
                        console.log('Building HTML for', models.length, 'models');
                        try {
                            const modelsHtml = models.map(function(model) {
                                return '<div class="model-item" data-model="' + model.name + '" onclick="selectModel('' + model.name + '')">' +
                                        '<div class="model-info">' +
                                            '<div class="model-name">' + model.name + '</div>' +
                                            '<div class="model-details">Unknown details</div>' +
                                        '</div>' +
                                        '<div class="model-size">' + formatBytes(model.size) + '</div>' +
                                    '</div>';
                            }).join('');
                            
                            modelsListEl.innerHTML = modelsHtml;
                            console.log('Models list updated successfully');
                        } catch (error) {
                            console.error('Error updating models list:', error);
                        }
                    }
                    
                    function addChatMessage(message) {
                        console.log('addChatMessage called:', message);
                        const chatMessages = document.getElementById('chatMessages');
                        
                        if (chatMessages.children.length === 1 && chatMessages.children[0].classList.contains('empty-state')) {
                            chatMessages.innerHTML = '';
                        }
                        
                        const messageEl = document.createElement('div');
                        messageEl.className = 'chat-message ' + message.type;
                        
                        messageEl.innerHTML = 
                            '<div class="message-content">' + message.content + '</div>' +
                            '<div class="message-timestamp">' + formatTimestamp(message.timestamp) + '</div>';
                        
                        chatMessages.appendChild(messageEl);
                        chatMessages.scrollTop = chatMessages.scrollHeight;
                    }
                    
                    // Handle messages from extension
                    window.addEventListener('message', function(event) {
                        const message = event.data;
                        console.log('*** WEBVIEW RECEIVED MESSAGE ***', message);
                        
                        try {
                            switch (message.command) {
                                case 'updateConnectionStatus':
                                    updateConnectionStatus(message.status);
                                    break;
                                case 'updateModelsList':
                                    updateModelsList(message.models);
                                    break;
                                case 'updateSelectedModel':
                                    updateSelectedModel(message.modelName);
                                    break;
                                case 'setModelSelectorCollapsed':
                                    setModelSelectorCollapsed(message.collapsed);
                                    break;
                                case 'addChatMessage':
                                    addChatMessage(message.message);
                                    break;
                                default:
                                    console.warn('Unknown message command:', message.command);
                            }
                        } catch (error) {
                            console.error('Error processing message:', error);
                        }
                    });
                    
                    // Initialize when DOM is ready
                    document.addEventListener('DOMContentLoaded', function() {
                        console.log('DOM loaded, initializing...');
                        checkDOM();
                        updateChatUI();
                        setModelSelectorCollapsed(modelSelectorCollapsed);
                        
                        if (selectedModel) {
                            const selectedModelName = document.getElementById('selectedModelName');
                            if (selectedModelName) {
                                selectedModelName.textContent = selectedModel;
                            }
                        }
                        console.log('Webview initialization complete');
                    });
                    
                    console.log('VSCortex Chat webview script loaded successfully');
                </script>
            </body>
            </html>
        `
    );
  }
};
function activate(context) {
  console.log("VSCortex extension activation started...");
  const disposable = vscode.commands.registerCommand("vscortex.helloWorld", () => {
    vscode.window.showInformationMessage("Hello World from VSCortex! IT IS ME!!!");
  });
  context.subscriptions.push(disposable);
  const provider = new VSCortexChatViewProvider(context.extensionUri, context);
  const webviewProvider = vscode.window.registerWebviewViewProvider(
    VSCortexChatViewProvider.viewType,
    provider,
    {
      webviewOptions: {
        retainContextWhenHidden: true
      }
    }
  );
  context.subscriptions.push(webviewProvider);
  console.log("VSCortex WebviewViewProvider registered for:", VSCortexChatViewProvider.viewType);
  vscode.window.showInformationMessage("VSCortex activated successfully!");
  console.log("VSCortex extension activation completed");
}
function deactivate() {
  console.log("VSCortex extension deactivated");
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
//# sourceMappingURL=extension.js.map
