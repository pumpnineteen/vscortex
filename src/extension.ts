// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

interface OllamaModel {
    name: string;
    model: string;
    modified_at: string;
    size: number;
    digest: string;
    details: {
        parent_model: string;
        format: string;
        family: string;
        families: string[];
        parameter_size: string;
        quantization_level: string;
    };
}

interface OllamaListResponse {
    models: OllamaModel[];
}

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
    model?: string;
}

interface OllamaChatRequest {
    model: string;
    messages: { role: string; content: string; }[];
    stream: boolean;
    options?: {
        temperature?: number;
        top_p?: number;
        top_k?: number;
    };
}

class VSCortexChatViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = "vscortex-chat-view";
    private webviewView?: vscode.WebviewView;
    private currentModel?: string;
    private chatHistory: ChatMessage[] = [];

    constructor(private readonly extensionUri: vscode.Uri) {}

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        token: vscode.CancellationToken
    ): void | Thenable<void> {
        console.log('VSCortex Chat View Provider - resolveWebviewView called');
        
        this.webviewView = webviewView;
        
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this.extensionUri, 'webview'),
                this.extensionUri
            ]
        };

        webviewView.webview.html = this.getHtml(webviewView.webview);
        
        // Add message handling for webview communication
        webviewView.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'refreshModels':
                        await this.refreshOllamaModels();
                        break;
                    case 'selectModel':
                        console.log('Selected model:', message.model);
                        this.currentModel = message.model;
                        vscode.window.showInformationMessage(`Selected model: ${message.model}`);
                        break;
                    case 'sendMessage':
                        await this.handleSendMessage(message.content, message.includeContext);
                        break;
                    case 'clearChat':
                        this.clearChatHistory();
                        break;
                    case 'alert':
                        vscode.window.showInformationMessage(message.text);
                        break;
                }
            },
            undefined,
            []
        );

        // Load models on initial view creation
        this.refreshOllamaModels();

        console.log('VSCortex Chat View HTML set successfully');
    }

    private async refreshOllamaModels(): Promise<void> {
        try {
            console.log('Fetching Ollama models...');
            this.updateConnectionStatus('connecting');
            
            const models = await this.fetchOllamaModels();
            console.log(`Found ${models.length} Ollama models`);
            
            this.updateConnectionStatus('connected');
            this.updateModelsList(models);
            
        } catch (error) {
            console.error('Failed to fetch Ollama models:', error);
            this.updateConnectionStatus('error');
            this.updateModelsList([]);
            
            let errorMessage = 'Unknown error';
            if (error instanceof Error) {
                errorMessage = error.message;
            }
            
            vscode.window.showErrorMessage(`Failed to connect to Ollama: ${errorMessage}`);
        }
    }

    private fetchOllamaModels(): Promise<OllamaModel[]> {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'localhost',
                port: 11434,
                path: '/api/tags',
                method: 'GET',
                timeout: 5000
            };

            const req = http.request(options, (res) => {
                let data = '';
                
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    try {
                        const response: OllamaListResponse = JSON.parse(data);
                        resolve(response.models || []);
                    } catch (parseError) {
                        reject(new Error(`Failed to parse response: ${parseError}`));
                    }
                });
            });

            req.on('error', (error) => {
                reject(new Error(`Connection failed: ${error.message}`));
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Connection timeout - is Ollama server running?'));
            });

            req.end();
        });
    }

    private async handleSendMessage(content: string, includeContext: boolean): Promise<void> {
        if (!this.currentModel) {
            vscode.window.showErrorMessage('Please select a model first');
            return;
        }

        try {
            // Add context from selected code if requested
            let messageContent = content;
            if (includeContext) {
                const editor = vscode.window.activeTextEditor;
                if (editor && editor.selection && !editor.selection.isEmpty) {
                    const selectedText = editor.document.getText(editor.selection);
                    const fileName = editor.document.fileName;
                    messageContent = `Context from ${fileName}:\n\`\`\`\n${selectedText}\n\`\`\`\n\nQuestion: ${content}`;
                }
            }

            // Add user message to history
            const userMessage: ChatMessage = {
                id: Date.now().toString(),
                role: 'user',
                content: messageContent,
                timestamp: Date.now(),
                model: this.currentModel
            };
            
            this.chatHistory.push(userMessage);
            this.updateChatHistory();

            // Start streaming response
            this.updateChatStatus('generating');
            const assistantMessage = await this.sendChatMessage(messageContent);
            
            this.chatHistory.push(assistantMessage);
            this.updateChatHistory();
            this.updateChatStatus('idle');

        } catch (error) {
            console.error('Error sending message:', error);
            this.updateChatStatus('error');
            
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`Chat error: ${errorMessage}`);
        }
    }

    private sendChatMessage(content: string): Promise<ChatMessage> {
        return new Promise((resolve, reject) => {
            const requestData: OllamaChatRequest = {
                model: this.currentModel!,
                messages: this.chatHistory
                    .filter(msg => msg.role !== 'system')
                    .map(msg => ({ role: msg.role, content: msg.content }))
                    .concat([{ role: 'user', content }]),
                stream: true,
                options: {
                    temperature: 0.7
                }
            };

            const postData = JSON.stringify(requestData);
            
            const options = {
                hostname: 'localhost',
                port: 11434,
                path: '/api/chat',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData)
                },
                timeout: 300000
            };

            const assistantMessage: ChatMessage = {
                id: Date.now().toString(),
                role: 'assistant',
                content: '',
                timestamp: Date.now(),
                model: this.currentModel
            };

            const req = http.request(options, (res) => {
                let buffer = '';

                res.on('data', (chunk) => {
                    buffer += chunk.toString();
                    
                    // Process complete JSON lines
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || ''; // Keep incomplete line in buffer
                    
                    for (const line of lines) {
                        if (line.trim()) {
                            try {
                                const data = JSON.parse(line);
                                if (data.message?.content) {
                                    assistantMessage.content += data.message.content;
                                    // Stream update to webview
                                    this.streamMessageUpdate(assistantMessage);
                                }
                                
                                if (data.done) {
                                    resolve(assistantMessage);
                                    return;
                                }
                            } catch (parseError) {
                                console.warn('Failed to parse streaming response:', parseError);
                            }
                        }
                    }
                });

                res.on('end', () => {
                    resolve(assistantMessage);
                });
            });

            req.on('error', (error) => {
                reject(new Error(`Chat request failed: ${error.message}`));
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Chat request timeout'));
            });

            req.write(postData);
            req.end();
        });
    }

    private sendChatMessageGenerate(content: string): Promise<ChatMessage> {
    return new Promise((resolve, reject) => {
        // Build context from chat history for /api/generate
        const contextMessages = this.chatHistory
            .filter(msg => msg.role !== 'system')
            .map(msg => `${msg.role === 'user' ? 'Human' : 'Assistant'}: ${msg.content}`)
            .join('\n\n');
        
        const fullPrompt = contextMessages 
            ? `${contextMessages}\n\nHuman: ${content}\n\nAssistant:`
            : `Human: ${content}\n\nAssistant:`;

        const requestData = {
            model: this.currentModel!,
            prompt: fullPrompt,
            stream: true,
            options: {
                temperature: 0.7,
                stop: ['Human:', '\nHuman:'] // Stop generation at next human input
            }
        };

        const postData = JSON.stringify(requestData);
        
        const options = {
            hostname: 'localhost',
            port: 11434,
            path: '/api/generate', // Using generate API instead of chat
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            },
            timeout: 300000 // 5 minutes
        };

        const assistantMessage: ChatMessage = {
            id: Date.now().toString(),
            role: 'assistant',
            content: '',
            timestamp: Date.now(),
            model: this.currentModel
        };

        let responseTimeout: NodeJS.Timeout | null = null;
        let hasReceivedData = false;

        const req = http.request(options, (res) => {
            let buffer = '';
            
            if (responseTimeout) {
                clearTimeout(responseTimeout);
                responseTimeout = null;
            }

            res.on('data', (chunk) => {
                hasReceivedData = true;
                buffer += chunk.toString();
                
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                
                for (const line of lines) {
                    if (line.trim()) {
                        try {
                            const data = JSON.parse(line);
                            if (data.response) {
                                assistantMessage.content += data.response;
                                this.streamMessageUpdate(assistantMessage);
                            }
                            
                            if (data.done) {
                                // Clean up any trailing whitespace and stop tokens
                                assistantMessage.content = assistantMessage.content.trim();
                                resolve(assistantMessage);
                                return;
                            }
                        } catch (parseError) {
                            console.warn('Failed to parse streaming response:', parseError);
                        }
                    }
                }
            });

            res.on('end', () => {
                if (!hasReceivedData) {
                    reject(new Error('No data received from Ollama'));
                } else {
                    resolve(assistantMessage);
                }
            });
        });

        req.on('error', (error) => {
            if (responseTimeout) {
                clearTimeout(responseTimeout);
            }
            reject(new Error(`Generate request failed: ${error.message}`));
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Generate request timeout - model may be loading'));
        });

        responseTimeout = setTimeout(() => {
            if (!hasReceivedData) {
                req.destroy();
                reject(new Error('No response from Ollama - check if model is loaded'));
            }
        }, 180000); // 3 minutes

        req.write(postData);
        req.end();
    });
}

    private clearChatHistory(): void {
        this.chatHistory = [];
        this.updateChatHistory();
    }

    private updateConnectionStatus(status: 'connecting' | 'connected' | 'error'): void {
        if (!this.webviewView) return;
        
        this.webviewView.webview.postMessage({
            command: 'updateConnectionStatus',
            status: status
        });
    }

    private updateModelsList(models: OllamaModel[]): void {
        if (!this.webviewView) return;
        
        this.webviewView.webview.postMessage({
            command: 'updateModelsList',
            models: models
        });
    }

    private updateChatHistory(): void {
        if (!this.webviewView) return;
        
        this.webviewView.webview.postMessage({
            command: 'updateChatHistory',
            messages: this.chatHistory
        });
    }

    private streamMessageUpdate(message: ChatMessage): void {
        if (!this.webviewView) return;
        
        this.webviewView.webview.postMessage({
            command: 'streamMessageUpdate',
            message: message
        });
    }

    private updateChatStatus(status: 'idle' | 'generating' | 'error'): void {
        if (!this.webviewView) return;
        
        this.webviewView.webview.postMessage({
            command: 'updateChatStatus',
            status: status
        });
    }

    private getHtml(webview: vscode.Webview): string {
        try {
            // Get paths to webview files
            const webviewPath = vscode.Uri.joinPath(this.extensionUri, 'webview');
            const htmlPath = vscode.Uri.joinPath(webviewPath, 'chat.html');
            const cssPath = vscode.Uri.joinPath(webviewPath, 'styles.css');
            const scriptPath = vscode.Uri.joinPath(webviewPath, 'script.js');

            // Convert to webview URIs
            const cssUri = webview.asWebviewUri(cssPath);
            const scriptUri = webview.asWebviewUri(scriptPath);

            // Read HTML file
            let html = fs.readFileSync(htmlPath.fsPath, 'utf8');

            // Replace placeholders with actual URIs
            html = html.replace('{{cssUri}}', cssUri.toString());
            html = html.replace('{{scriptUri}}', scriptUri.toString());

            return html;
        } catch (error) {
            console.error('Failed to load webview files:', error);
            // Fallback to inline HTML if files don't exist
            return this.getFallbackHtml();
        }
    }

    private getFallbackHtml(): string {
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
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "vscortex" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('vscortex.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from VSCortex! IT IS ME!!!');
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
    console.log('Provider registered for', VSCortexChatViewProvider.viewType);

}

// This method is called when your extension is deactivated
export function deactivate() {}