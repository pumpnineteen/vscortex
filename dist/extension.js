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
  currentModel;
  chatHistory = [];
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
            this.currentModel = message.model;
            vscode.window.showInformationMessage(`Selected model: ${message.model}`);
            break;
          case "sendMessage":
            await this.handleSendMessage(message.content, message.includeContext);
            break;
          case "clearChat":
            this.clearChatHistory();
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
  async handleSendMessage(content, includeContext) {
    if (!this.currentModel) {
      vscode.window.showErrorMessage("Please select a model first");
      return;
    }
    try {
      let messageContent = content;
      if (includeContext) {
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.selection && !editor.selection.isEmpty) {
          const selectedText = editor.document.getText(editor.selection);
          const fileName = editor.document.fileName;
          messageContent = `Context from ${fileName}:
\`\`\`
${selectedText}
\`\`\`

Question: ${content}`;
        }
      }
      const userMessage = {
        id: Date.now().toString(),
        role: "user",
        content: messageContent,
        timestamp: Date.now(),
        model: this.currentModel
      };
      this.chatHistory.push(userMessage);
      this.updateChatHistory();
      this.updateChatStatus("generating");
      const assistantMessage = await this.sendChatMessage(messageContent);
      this.chatHistory.push(assistantMessage);
      this.updateChatHistory();
      this.updateChatStatus("idle");
    } catch (error) {
      console.error("Error sending message:", error);
      this.updateChatStatus("error");
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      vscode.window.showErrorMessage(`Chat error: ${errorMessage}`);
    }
  }
  sendChatMessage(content) {
    return new Promise((resolve, reject) => {
      const requestData = {
        model: this.currentModel,
        messages: this.chatHistory.filter((msg) => msg.role !== "system").map((msg) => ({ role: msg.role, content: msg.content })).concat([{ role: "user", content }]),
        stream: true,
        options: {
          temperature: 0.7
        }
      };
      const postData = JSON.stringify(requestData);
      const options = {
        hostname: "localhost",
        port: 11434,
        path: "/api/chat",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(postData)
        },
        timeout: 3e4
      };
      const assistantMessage = {
        id: Date.now().toString(),
        role: "assistant",
        content: "",
        timestamp: Date.now(),
        model: this.currentModel
      };
      const req = http.request(options, (res) => {
        let buffer = "";
        res.on("data", (chunk) => {
          buffer += chunk.toString();
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (line.trim()) {
              try {
                const data = JSON.parse(line);
                if (data.message?.content) {
                  assistantMessage.content += data.message.content;
                  this.streamMessageUpdate(assistantMessage);
                }
                if (data.done) {
                  resolve(assistantMessage);
                  return;
                }
              } catch (parseError) {
                console.warn("Failed to parse streaming response:", parseError);
              }
            }
          }
        });
        res.on("end", () => {
          resolve(assistantMessage);
        });
      });
      req.on("error", (error) => {
        reject(new Error(`Chat request failed: ${error.message}`));
      });
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Chat request timeout"));
      });
      req.write(postData);
      req.end();
    });
  }
  clearChatHistory() {
    this.chatHistory = [];
    this.updateChatHistory();
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
  updateChatHistory() {
    if (!this.webviewView) return;
    this.webviewView.webview.postMessage({
      command: "updateChatHistory",
      messages: this.chatHistory
    });
  }
  streamMessageUpdate(message) {
    if (!this.webviewView) return;
    this.webviewView.webview.postMessage({
      command: "streamMessageUpdate",
      message
    });
  }
  updateChatStatus(status) {
    if (!this.webviewView) return;
    this.webviewView.webview.postMessage({
      command: "updateChatStatus",
      status
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
                        height: 100vh;
                        display: flex;
                        flex-direction: column;
                    }
                    
                    .container {
                        display: flex;
                        flex-direction: column;
                        gap: 12px;
                        height: 100%;
                    }
                    
                    .header {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        border-bottom: 1px solid var(--vscode-panel-border);
                        padding-bottom: 8px;
                        margin-bottom: 8px;
                        flex-shrink: 0;
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
                        transition: background-color 0.2s;
                        flex-shrink: 0;
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
                        flex-shrink: 0;
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
                        max-height: 200px;
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
                    
                    /* Chat Section Styles */
                    .chat-section {
                        display: flex;
                        flex-direction: column;
                        flex: 1;
                        min-height: 0;
                        border-top: 1px solid var(--vscode-panel-border);
                        padding-top: 12px;
                    }
                    
                    .chat-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 12px;
                    }
                    
                    .clear-btn {
                        background: none;
                        border: 1px solid var(--vscode-panel-border);
                        color: var(--vscode-foreground);
                        padding: 4px 8px;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 11px;
                    }
                    
                    .clear-btn:hover {
                        background-color: var(--vscode-list-hoverBackground);
                    }
                    
                    .chat-messages {
                        flex: 1;
                        overflow-y: auto;
                        border: 1px solid var(--vscode-panel-border);
                        border-radius: 4px;
                        padding: 12px;
                        background-color: var(--vscode-editor-background);
                        margin-bottom: 12px;
                        min-height: 200px;
                    }
                    
                    .message {
                        margin-bottom: 16px;
                        padding: 8px 12px;
                        border-radius: 8px;
                        max-width: 90%;
                    }
                    
                    .message.user {
                        background-color: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        margin-left: auto;
                        text-align: right;
                    }
                    
                    .message.assistant {
                        background-color: var(--vscode-list-inactiveSelectionBackground);
                        border: 1px solid var(--vscode-panel-border);
                    }
                    
                    .message-content {
                        white-space: pre-wrap;
                        word-wrap: break-word;
                        line-height: 1.4;
                    }
                    
                    .message-meta {
                        font-size: 10px;
                        color: var(--vscode-descriptionForeground);
                        margin-top: 4px;
                        opacity: 0.7;
                    }
                    
                    .chat-input-container {
                        display: flex;
                        flex-direction: column;
                        gap: 8px;
                        flex-shrink: 0;
                    }
                    
                    .chat-options {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                    }
                    
                    .checkbox-container {
                        display: flex;
                        align-items: center;
                        gap: 4px;
                    }
                    
                    .checkbox-container input[type="checkbox"] {
                        margin: 0;
                    }
                    
                    .checkbox-container label {
                        font-size: 11px;
                        color: var(--vscode-descriptionForeground);
                        cursor: pointer;
                    }
                    
                    .chat-input-row {
                        display: flex;
                        gap: 8px;
                    }
                    
                    .chat-input {
                        flex: 1;
                        background-color: var(--vscode-input-background);
                        color: var(--vscode-input-foreground);
                        border: 1px solid var(--vscode-input-border);
                        border-radius: 4px;
                        padding: 8px 12px;
                        font-family: inherit;
                        font-size: inherit;
                        resize: vertical;
                        min-height: 32px;
                        max-height: 120px;
                    }
                    
                    .chat-input:focus {
                        outline: 1px solid var(--vscode-focusBorder);
                        border-color: var(--vscode-focusBorder);
                    }
                    
                    .send-btn {
                        background-color: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: none;
                        padding: 8px 16px;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 12px;
                        font-weight: 500;
                        align-self: flex-end;
                    }
                    
                    .send-btn:hover:not(:disabled) {
                        background-color: var(--vscode-button-hoverBackground);
                    }
                    
                    .send-btn:disabled {
                        opacity: 0.6;
                        cursor: not-allowed;
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
                    
                    .chat-empty-state {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        height: 100%;
                        color: var(--vscode-descriptionForeground);
                        font-size: 13px;
                        text-align: center;
                    }
                    
                    .chat-status {
                        font-size: 11px;
                        color: var(--vscode-descriptionForeground);
                        font-style: italic;
                        text-align: center;
                        padding: 4px;
                    }
                    
                    .streaming-indicator {
                        display: inline-block;
                        width: 8px;
                        height: 8px;
                        border-radius: 50%;
                        background-color: var(--vscode-progressBar-background);
                        animation: pulse 1s infinite;
                        margin-left: 4px;
                    }
                    
                    @keyframes pulse {
                        0%, 100% { opacity: 0.3; }
                        50% { opacity: 1; }
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
                    
                    <div class="chat-section">
                        <div class="chat-header">
                            <h3 class="section-title">Chat</h3>
                            <button class="clear-btn" onclick="clearChat()">Clear</button>
                        </div>
                        
                        <div id="chatMessages" class="chat-messages">
                            <div class="chat-empty-state">
                                Select a model and start chatting!
                            </div>
                        </div>
                        
                        <div id="chatStatus" class="chat-status" style="display: none;"></div>
                        
                        <div class="chat-input-container">
                            <div class="chat-options">
                                <div class="checkbox-container">
                                    <input type="checkbox" id="includeContext" />
                                    <label for="includeContext">Include selected code as context</label>
                                </div>
                            </div>
                            
                            <div class="chat-input-row">
                                <textarea 
                                    id="chatInput" 
                                    class="chat-input" 
                                    placeholder="Ask a question..." 
                                    rows="1"
                                ></textarea>
                                <button id="sendBtn" class="send-btn" onclick="sendMessage()">
                                    Send
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                
                <script>
                    const vscode = acquireVsCodeApi();
                    let selectedModel = null;
                    let chatMessages = [];
                    let isGenerating = false;
                    
                    // Get state from vscode API
                    let state = vscode.getState() || { selectedModel: null, chatMessages: [] };
                    selectedModel = state.selectedModel;
                    chatMessages = state.chatMessages || [];
                    
                    // Auto-resize textarea
                    const chatInput = document.getElementById('chatInput');
                    chatInput.addEventListener('input', function() {
                        this.style.height = 'auto';
                        this.style.height = Math.min(this.scrollHeight, 120) + 'px';
                    });
                    
                    // Handle Enter key
                    chatInput.addEventListener('keydown', function(e) {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            sendMessage();
                        }
                    });
                    
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
                        vscode.setState({ selectedModel: modelName, chatMessages: chatMessages });
                        
                        // Update UI
                        document.querySelectorAll('.model-item').forEach(item => {
                            item.classList.remove('selected');
                        });
                        document.querySelector(\`[data-model="\${modelName}"]\`).classList.add('selected');
                        
                        vscode.postMessage({
                            command: 'selectModel',
                            model: modelName
                        });
                        
                        updateSendButtonState();
                    }
                    
                    function sendMessage() {
                        const input = document.getElementById('chatInput');
                        const content = input.value.trim();
                        const includeContext = document.getElementById('includeContext').checked;
                        
                        if (!content || !selectedModel || isGenerating) {
                            return;
                        }
                        
                        input.value = '';
                        input.style.height = 'auto';
                        
                        vscode.postMessage({
                            command: 'sendMessage',
                            content: content,
                            includeContext: includeContext
                        });
                    }
                    
                    function clearChat() {
                        chatMessages = [];
                        vscode.setState({ selectedModel: selectedModel, chatMessages: chatMessages });
                        vscode.postMessage({ command: 'clearChat' });
                        updateChatDisplay();
                    }
                    
                    function updateSendButtonState() {
                        const sendBtn = document.getElementById('sendBtn');
                        const input = document.getElementById('chatInput');
                        const hasModel = selectedModel !== null;
                        const hasContent = input.value.trim().length > 0;
                        
                        sendBtn.disabled = !hasModel || !hasContent || isGenerating;
                        
                        if (isGenerating) {
                            sendBtn.innerHTML = '<span class="loading-spinner"></span>Sending...';
                        } else {
                            sendBtn.innerHTML = 'Send';
                        }
                    }
                    
                    function updateChatDisplay() {
                        const messagesContainer = document.getElementById('chatMessages');
                        
                        if (chatMessages.length === 0) {
                            messagesContainer.innerHTML = \`
                                <div class="chat-empty-state">
                                    \${selectedModel ? 'Start a conversation!' : 'Select a model and start chatting!'}
                                </div>
                            \`;
                            return;
                        }
                        
                        messagesContainer.innerHTML = chatMessages.map(msg => \`
                            <div class="message \${msg.role}">
                                <div class="message-content">\${escapeHtml(msg.content)}</div>
                                <div class="message-meta">
                                    \${msg.role === 'user' ? 'You' : msg.model || 'Assistant'} \u2022 
                                    \${new Date(msg.timestamp).toLocaleTimeString()}
                                </div>
                            </div>
                        \`).join('');
                        
                        // Scroll to bottom
                        messagesContainer.scrollTop = messagesContainer.scrollHeight;
                    }
                    
                    function escapeHtml(text) {
                        const div = document.createElement('div');
                        div.textContent = text;
                        return div.innerHTML;
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
                                
                            case 'updateChatHistory':
                                chatMessages = message.messages;
                                vscode.setState({ selectedModel: selectedModel, chatMessages: chatMessages });
                                updateChatDisplay();
                                break;
                                
                            case 'streamMessageUpdate':
                                // Find and update the streaming message
                                const msgIndex = chatMessages.findIndex(m => m.id === message.message.id);
                                if (msgIndex !== -1) {
                                    chatMessages[msgIndex] = message.message;
                                } else {
                                    chatMessages.push(message.message);
                                }
                                updateChatDisplay();
                                break;
                                
                            case 'updateChatStatus':
                                updateChatStatus(message.status);
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
                    
                    function updateChatStatus(status) {
                        const statusEl = document.getElementById('chatStatus');
                        
                        switch (status) {
                            case 'generating':
                                isGenerating = true;
                                statusEl.style.display = 'block';
                                statusEl.innerHTML = 'Generating response<span class="streaming-indicator"></span>';
                                break;
                            case 'error':
                                isGenerating = false;
                                statusEl.style.display = 'block';
                                statusEl.innerHTML = 'Error generating response';
                                setTimeout(() => {
                                    statusEl.style.display = 'none';
                                }, 3000);
                                break;
                            case 'idle':
                            default:
                                isGenerating = false;
                                statusEl.style.display = 'none';
                                break;
                        }
                        
                        updateSendButtonState();
                    }
                    
                    // Listen for input changes to update send button
                    document.getElementById('chatInput').addEventListener('input', updateSendButtonState);
                    
                    // Initialize UI
                    updateChatDisplay();
                    updateSendButtonState();
                    
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
