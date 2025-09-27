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
var fs = __toESM(require("fs"));
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
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, "webview"),
        this.extensionUri
      ]
    };
    webviewView.webview.html = this.getHtml(webviewView.webview);
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
  getHtml(webview) {
    try {
      const webviewPath = vscode.Uri.joinPath(this.extensionUri, "webview");
      const htmlPath = vscode.Uri.joinPath(webviewPath, "chat.html");
      const cssPath = vscode.Uri.joinPath(webviewPath, "styles.css");
      const scriptPath = vscode.Uri.joinPath(webviewPath, "script.js");
      const cssUri = webview.asWebviewUri(cssPath);
      const scriptUri = webview.asWebviewUri(scriptPath);
      let html = fs.readFileSync(htmlPath.fsPath, "utf8");
      html = html.replace("{{cssUri}}", cssUri.toString());
      html = html.replace("{{scriptUri}}", scriptUri.toString());
      return html;
    } catch (error) {
      console.error("Failed to load webview files:", error);
      return this.getFallbackHtml();
    }
  }
  getFallbackHtml() {
    return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>VSCortex Chat</title>
                <style>
                    body { 
                        padding: 20px; 
                        color: var(--vscode-foreground); 
                        background-color: var(--vscode-editor-background); 
                    }
                    .error { 
                        color: var(--vscode-errorForeground); 
                        border: 1px solid var(--vscode-errorForeground); 
                        padding: 10px; 
                        border-radius: 4px; 
                    }
                </style>
            </head>
            <body>
                <div class="error">
                    <h3>Error Loading Webview</h3>
                    <p>Could not load webview files. Please ensure the webview folder contains:</p>
                    <ul>
                        <li>chat.html</li>
                        <li>styles.css</li>
                        <li>script.ts</li>
                    </ul>
                </div>
            </body>
            </html>
        `;
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
