"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// Simple markdown renderer class
class SimpleMarkdownRenderer {
    codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    inlineCodeRegex = /`([^`]+)`/g;
    boldRegex = /\*\*(.*?)\*\*/g;
    italicRegex = /\*(.*?)\*/g;
    linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    headerRegex = /^(#{1,6})\s+(.+)$/gm;
    listItemRegex = /^[\s]*[-*+]\s+(.+)$/gm;
    numberedListRegex = /^[\s]*\d+\.\s+(.+)$/gm;
    render(markdown) {
        let html = markdown;
        // Handle code blocks first (before inline code)
        html = html.replace(this.codeBlockRegex, (match, language, code) => {
            const lang = language || '';
            const escapedCode = this.escapeHtml(code.trim());
            return `<div class="code-block">
                <div class="code-header">
                    <span class="code-language">${lang}</span>
                    <button class="copy-code-btn" onclick="copyCode(this)">Copy</button>
                </div>
                <pre><code class="language-${lang}">${escapedCode}</code></pre>
            </div>`;
        });
        // Handle inline code
        html = html.replace(this.inlineCodeRegex, (match, code) => {
            return `<code class="inline-code">${this.escapeHtml(code)}</code>`;
        });
        // Handle headers
        html = html.replace(this.headerRegex, (match, hashes, content) => {
            const level = hashes.length;
            return `<h${level} class="markdown-header">${content.trim()}</h${level}>`;
        });
        // Handle bold text
        html = html.replace(this.boldRegex, '<strong>$1</strong>');
        // Handle italic text (after bold to avoid conflicts)
        html = html.replace(this.italicRegex, '<em>$1</em>');
        // Handle links
        html = html.replace(this.linkRegex, '<a href="$2" target="_blank" class="markdown-link">$1</a>');
        // Handle unordered lists
        html = html.replace(this.listItemRegex, '<li class="markdown-list-item">$1</li>');
        html = this.wrapConsecutiveItems(html, 'li class="markdown-list-item"', 'ul', 'markdown-list');
        // Handle ordered lists
        html = html.replace(this.numberedListRegex, '<li class="markdown-numbered-item">$1</li>');
        html = this.wrapConsecutiveItems(html, 'li class="markdown-numbered-item"', 'ol', 'markdown-numbered-list');
        // Handle line breaks and paragraphs
        html = html.replace(/\n\n/g, '</p><p class="markdown-paragraph">');
        html = html.replace(/\n/g, '<br>');
        // Wrap in paragraph if not already wrapped
        if (!html.includes('<p class="markdown-paragraph">')) {
            html = `<p class="markdown-paragraph">${html}</p>`;
        }
        else {
            html = `<p class="markdown-paragraph">${html}</p>`;
        }
        return html;
    }
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    wrapConsecutiveItems(html, itemTag, wrapperTag, wrapperClass) {
        // Simple implementation - can be enhanced
        const regex = new RegExp(`(<${itemTag}>.*?</li>)+`, 'g');
        return html.replace(regex, `<${wrapperTag} class="${wrapperClass}">// TypeScript interfaces for webview environment (browser-like, no Node.js)
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
}</${wrapperTag}>`);
    }
}
const vscode = acquireVsCodeApi();
const markdownRenderer = new SimpleMarkdownRenderer();
let selectedModel = null;
let chatMessages = [];
let isGenerating = false;
// Get state from vscode API
let state = vscode.getState() || { selectedModel: null, chatMessages: [] };
selectedModel = state.selectedModel;
chatMessages = state.chatMessages || [];
// Initialize when DOM loads
document.addEventListener('DOMContentLoaded', function () {
    initializeEventListeners();
    updateChatDisplay();
    updateSendButtonState();
});
function initializeEventListeners() {
    // Auto-resize textarea
    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
        chatInput.addEventListener('input', function () {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 120) + 'px';
            updateSendButtonState();
        });
        // Handle Enter key
        chatInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    }
    // Listen for input changes to update send button
    const inputElement = document.getElementById('chatInput');
    if (inputElement) {
        inputElement.addEventListener('input', updateSendButtonState);
    }
}
function refreshModels() {
    const btn = document.getElementById('refreshBtn');
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
function selectModel(modelName) {
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
function sendMessage() {
    const input = document.getElementById('chatInput');
    const includeContextCheckbox = document.getElementById('includeContext');
    const webSearchCheckbox = document.getElementById('webSearch');
    if (!input)
        return;
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
function clearChat() {
    chatMessages = [];
    vscode.setState({ selectedModel: selectedModel, chatMessages: chatMessages });
    vscode.postMessage({ command: 'clearChat' });
    updateChatDisplay();
}
function updateSendButtonState() {
    const sendBtn = document.getElementById('sendBtn');
    const input = document.getElementById('chatInput');
    if (!sendBtn || !input)
        return;
    const hasModel = selectedModel !== null;
    const hasContent = input.value.trim().length > 0;
    sendBtn.disabled = !hasModel || !hasContent || isGenerating;
    if (isGenerating) {
        sendBtn.innerHTML = '<span class="loading-spinner"></span>Sending...';
    }
    else {
        sendBtn.innerHTML = 'Send';
    }
}
function updateChatDisplay() {
    const messagesContainer = document.getElementById('chatMessages');
    if (!messagesContainer)
        return;
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
            content = markdownRenderer.render(content);
        }
        else {
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
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
function formatBytes(bytes) {
    if (bytes === 0)
        return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
// Handle messages from extension
window.addEventListener('message', (event) => {
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
            }
            else {
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
    if (!statusEl)
        return;
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
function updateModelsList(models) {
    const modelsListEl = document.getElementById('modelsList');
    if (!modelsListEl)
        return;
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
function updateChatStatus(status) {
    const statusEl = document.getElementById('chatStatus');
    if (!statusEl)
        return;
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
function copyCode(button) {
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
window.refreshModels = refreshModels;
window.selectModel = selectModel;
window.sendMessage = sendMessage;
window.clearChat = clearChat;
window.copyCode = copyCode;
//# sourceMappingURL=script.js.map