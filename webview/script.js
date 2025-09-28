"use strict";
const vscode = acquireVsCodeApi();
let selectedModel = null;
let chatMessages = [];
let isGenerating = false;
let state = vscode.getState() || { selectedModel: null, chatMessages: [] };
selectedModel = state.selectedModel;
chatMessages = state.chatMessages || [];
document.addEventListener('DOMContentLoaded', function () {
    initializeEventListeners();
    updateChatDisplay();
    updateSendButtonState();
});
function initializeEventListeners() {
    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
        chatInput.addEventListener('input', function () {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 120) + 'px';
            updateSendButtonState();
        });
        chatInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    }
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
    updateChatDisplay();
}
function sendMessage() {
    const input = document.getElementById('chatInput');
    const includeContextCheckbox = document.getElementById('includeContext');
    if (!input)
        return;
    const content = input.value.trim();
    const includeContext = includeContextCheckbox ? includeContextCheckbox.checked : false;
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
    messagesContainer.innerHTML = chatMessages.map(msg => `
        <div class="message ${msg.role}">
            <div class="message-content">${escapeHtml(msg.content)}</div>
            <div class="message-meta">
                ${msg.role === 'user' ? 'You' : msg.model || 'Assistant'} • 
                ${new Date(msg.timestamp).toLocaleTimeString()}
            </div>
        </div>
    `).join('');
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
            }, 300000);
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
window.refreshModels = refreshModels;
window.selectModel = selectModel;
window.sendMessage = sendMessage;
window.clearChat = clearChat;
