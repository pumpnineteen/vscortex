// TypeScript interfaces for webview environment (browser-like, no Node.js)
interface VSCodeAPI {
    postMessage(message: any): void;
    getState(): any;
    setState(state: any): void;
}

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
    model?: string;
    isMarkdown?: boolean;
}

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

interface WebviewMessage {
    command: string;
    [key: string]: any;
}

interface WebSearchResult {
    title: string;
    url: string;
    snippet: string;
}

declare const marked: {
    parse(markdown: string): string;
    setOptions(options: any): void;
};

declare const hljs: {
    highlight(code: string, options: { language: string }): { value: string };
    highlightAuto(code: string): { value: string };
    getLanguage(name: string): any;
};

function renderMarkdown(content: string): string {
    try {
        let html = marked.parse(content);
        
        // Add copy buttons to highlighted code blocks
        html = html.replace(/<pre><code class="hljs language-(\w+)">([\s\S]*?)<\/code><\/pre>/g, 
            (match, lang, code) => {
                return `<div class="code-block">
                    <div class="code-header">
                        <span class="code-language">${lang}</span>
                        <button class="copy-code-btn" onclick="copyCode(this)">Copy</button>
                    </div>
                    <pre><code class="hljs language-${lang}">${code}</code></pre>
                </div>`;
            });
            
        // Handle code blocks without language highlighting
        html = html.replace(/<pre><code class="hljs">([\s\S]*?)<\/code><\/pre>/g, 
            (match, code) => {
                return `<div class="code-block">
                    <div class="code-header">
                        <span class="code-language">text</span>
                        <button class="copy-code-btn" onclick="copyCode(this)">Copy</button>
                    </div>
                    <pre><code class="hljs">${code}</code></pre>
                </div>`;
            });

        // Handle plain code blocks (fallback)
        html = html.replace(/<pre><code>([\s\S]*?)<\/code><\/pre>/g, 
            (match, code) => {
                return `<div class="code-block">
                    <div class="code-header">
                        <span class="code-language">text</span>
                        <button class="copy-code-btn" onclick="copyCode(this)">Copy</button>
                    </div>
                    <pre><code>${code}</code></pre>
                </div>`;
            });
        
        return html;
    } catch (error) {
        console.error('Markdown parsing error:', error);
        return escapeHtml(content); // Fallback to escaped HTML
    }
}

// Global variables with proper types
declare const acquireVsCodeApi: () => VSCodeAPI;

const vscode: VSCodeAPI = acquireVsCodeApi();
let selectedModel: string | null = null;
let chatMessages: ChatMessage[] = [];
let isGenerating: boolean = false;

// Get state from vscode API
let state = vscode.getState() || { selectedModel: null, chatMessages: [] };
selectedModel = state.selectedModel;
chatMessages = state.chatMessages || [];

// Initialize when DOM loads
document.addEventListener('DOMContentLoaded', function() {
    initializeEventListeners();
    updateChatDisplay();
    updateSendButtonState();
});

function initializeEventListeners(): void {
    // Auto-resize textarea
    const chatInput = document.getElementById('chatInput') as HTMLTextAreaElement;
    if (chatInput) {
        chatInput.addEventListener('input', function(this: HTMLTextAreaElement) {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 120) + 'px';
            updateSendButtonState();
        });
        
        // Handle Enter key
        chatInput.addEventListener('keydown', function(e: KeyboardEvent) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    }

    // Listen for input changes to update send button
    const inputElement = document.getElementById('chatInput') as HTMLTextAreaElement;
    if (inputElement) {
        inputElement.addEventListener('input', updateSendButtonState);
    }
}

function refreshModels(): void {
    const btn = document.getElementById('refreshBtn') as HTMLButtonElement;
    if (btn) {
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
}

function selectModel(modelName: string): void {
    selectedModel = modelName;
    vscode.setState({ selectedModel: modelName, chatMessages: chatMessages });
    
    // Update UI
    document.querySelectorAll('.model-item').forEach(item => {
        item.classList.remove('selected');
    });
    const selectedItem = document.querySelector(`[data-model="${modelName}"]`);
    if (selectedItem) {
        selectedItem.classList.add('selected');
    }
    
    vscode.postMessage({
        command: 'selectModel',
        model: modelName
    });
    
    updateSendButtonState();
    updateChatDisplay(); // Update empty state message
}

function sendMessage(): void {
    const input = document.getElementById('chatInput') as HTMLTextAreaElement;
    const includeContextCheckbox = document.getElementById('includeContext') as HTMLInputElement;
    const webSearchCheckbox = document.getElementById('webSearch') as HTMLInputElement;
    
    if (!input) return;
    
    const content = input.value.trim();
    const includeContext = includeContextCheckbox ? includeContextCheckbox.checked : false;
    const webSearch = webSearchCheckbox ? webSearchCheckbox.checked : false;
    
    if (!content || !selectedModel || isGenerating) {
        return;
    }
    
    input.value = '';
    input.style.height = 'auto';
    
    vscode.postMessage({
        command: 'sendMessage',
        content: content,
        includeContext: includeContext,
        webSearch: webSearch
    });
}

function clearChat(): void {
    chatMessages = [];
    vscode.setState({ selectedModel: selectedModel, chatMessages: chatMessages });
    vscode.postMessage({ command: 'clearChat' });
    updateChatDisplay();
}

function updateSendButtonState(): void {
    const sendBtn = document.getElementById('sendBtn') as HTMLButtonElement;
    const input = document.getElementById('chatInput') as HTMLTextAreaElement;
    
    if (!sendBtn || !input) return;
    
    const hasModel = selectedModel !== null;
    const hasContent = input.value.trim().length > 0;
    
    sendBtn.disabled = !hasModel || !hasContent || isGenerating;
    
    if (isGenerating) {
        sendBtn.innerHTML = '<span class="loading-spinner"></span>Sending...';
    } else {
        sendBtn.innerHTML = 'Send';
    }
}

function updateChatDisplay(): void {
    const messagesContainer = document.getElementById('chatMessages');
    if (!messagesContainer) return;
    
    if (chatMessages.length === 0) {
        messagesContainer.innerHTML = `
            <div class="chat-empty-state">
                ${selectedModel ? 'Start a conversation!' : 'Select a model and start chatting!'}
            </div>
        `;
        return;
    }
    
    messagesContainer.innerHTML = chatMessages.map(msg => {
        let content = msg.content;
        
        // Render markdown for assistant messages and user messages with code
        if (msg.role === 'assistant' || (msg.role === 'user' && (content.includes('```') || content.includes('`')))) {
            content = renderMarkdown(content); // Changed from markdownRenderer.render(content)
        } else {
            // For regular user messages, just escape HTML
            content = escapeHtml(content);
        }
        
        const markdownClass = (msg.role === 'assistant' || content.includes('<code')) ? 'markdown' : '';
        
        return `
            <div class="message ${msg.role}">
                <div class="message-content ${markdownClass}">${content}</div>
                <div class="message-meta">
                    ${msg.role === 'user' ? 'You' : msg.model || 'Assistant'} • 
                    ${new Date(msg.timestamp).toLocaleTimeString()}
                </div>
            </div>
        `;
    }).join('');
    
    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
}

// Handle messages from extension
window.addEventListener('message', (event: MessageEvent<WebviewMessage>) => {
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

function updateConnectionStatus(status: 'connecting' | 'connected' | 'error'): void {
    const statusEl = document.getElementById('connectionStatus');
    if (!statusEl) return;
    
    statusEl.className = 'connection-status';
    
    switch (status) {
        case 'connecting':
            statusEl.classList.add('status-connecting');
            statusEl.innerHTML = '<span class="loading-spinner"></span>Connecting';
            break;
        case 'connected':
            statusEl.classList.add('status-connected');
            statusEl.innerHTML = '● Connected';
            break;
        case 'error':
            statusEl.classList.add('status-error');
            statusEl.innerHTML = '● Error';
            break;
    }
}

function updateModelsList(models: OllamaModel[]): void {
    const modelsListEl = document.getElementById('modelsList');
    if (!modelsListEl) return;
    
    if (!models || models.length === 0) {
        modelsListEl.innerHTML = `
            <div class="empty-state">
                No models found.<br>
                Make sure Ollama is running and has models installed.
            </div>
        `;
        return;
    }
    
    modelsListEl.innerHTML = models.map(model => `
        <div class="model-item ${selectedModel === model.name ? 'selected' : ''}" 
             data-model="${model.name}" 
             onclick="selectModel('${model.name}')">
            <div class="model-info">
                <div class="model-name">${model.name}</div>
                <div class="model-details">
                    ${model.details?.parameter_size || 'Unknown size'} • 
                    ${model.details?.family || 'Unknown family'}
                </div>
            </div>
            <div class="model-size">${formatBytes(model.size)}</div>
        </div>
    `).join('');
}

function updateChatStatus(status: 'idle' | 'generating' | 'error'): void {
    const statusEl = document.getElementById('chatStatus');
    if (!statusEl) return;
    
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

console.log('VSCortex Chat webview loaded successfully');

// Global function for copying code
function copyCode(button: HTMLButtonElement): void {
    const codeBlock = button.closest('.code-block');
    if (codeBlock) {
        const code = codeBlock.querySelector('code');
        if (code) {
            navigator.clipboard.writeText(code.textContent || '').then(() => {
                const originalText = button.textContent;
                button.textContent = 'Copied!';
                setTimeout(() => {
                    button.textContent = originalText;
                }, 2000);
            }).catch(() => {
                // Fallback for older browsers
                const textArea = document.createElement('textarea');
                textArea.value = code.textContent || '';
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                
                const originalText = button.textContent;
                button.textContent = 'Copied!';
                setTimeout(() => {
                    button.textContent = originalText;
                }, 2000);
            });
        }
    }
}

// Make functions globally available for onclick handlers
(window as any).refreshModels = refreshModels;
(window as any).selectModel = selectModel;
(window as any).sendMessage = sendMessage;
(window as any).clearChat = clearChat;
(window as any).copyCode = copyCode;