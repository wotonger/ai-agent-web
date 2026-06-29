let currentMode = 'code';
let isStreaming = false;
let abortController = null;

const modeLabels = {
    code: { label: '写代码', icon: '💻' },
    document: { label: '写文档', icon: '📝' },
    course_design: { label: '课程设计', icon: '🎓' },
    general: { label: '通用问答', icon: '💬' }
};

const messagesEl = document.getElementById('messages');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');
const statusEl = document.getElementById('status');
const modeIconEl = document.getElementById('modeIcon');
const modeLabelEl = document.getElementById('modeLabel');
const newChatBtn = document.getElementById('newChatBtn');

// Mode switching
document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        if (isStreaming) return;
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentMode = btn.dataset.mode;
        updateModeDisplay();
    });
});

function updateModeDisplay() {
    const info = modeLabels[currentMode];
    modeIconEl.textContent = info.icon;
    modeLabelEl.textContent = info.label;
}

// Auto-resize textarea
userInput.addEventListener('input', () => {
    userInput.style.height = 'auto';
    userInput.style.height = Math.min(userInput.scrollHeight, 150) + 'px';
    sendBtn.disabled = userInput.value.trim() === '' || isStreaming;
});

userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

sendBtn.addEventListener('click', sendMessage);

// Quick action buttons
document.querySelectorAll('.quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        if (isStreaming) return;
        const prompt = btn.dataset.prompt;
        userInput.value = prompt;
        userInput.dispatchEvent(new Event('input'));
        sendMessage();
    });
});

// New chat
newChatBtn.addEventListener('click', () => {
    if (isStreaming) return;
    messagesEl.innerHTML = `
        <div class="welcome">
            <h2>欢迎使用 DeepSeek AI 助手</h2>
            <p>我可以帮你写代码、写文档、辅导课程设计。从左侧切换模式，开始提问吧。</p>
            <div class="quick-actions">
                <button class="quick-btn" data-prompt="帮我写一个 Python 学生成绩管理系统的核心代码">Python 成绩管理系统</button>
                <button class="quick-btn" data-prompt="帮我写一篇关于人工智能在教育中应用的课程论文大纲">AI 教育应用论文大纲</button>
                <button class="quick-btn" data-prompt="帮我规划一个基于 Django 的在线商城课程设计">Django 商城课程设计</button>
            </div>
        </div>
    `;
    userInput.value = '';
    userInput.style.height = 'auto';
    sendBtn.disabled = true;
    bindQuickButtons();
});

function bindQuickButtons() {
    document.querySelectorAll('.quick-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (isStreaming) return;
            const prompt = btn.dataset.prompt;
            userInput.value = prompt;
            userInput.dispatchEvent(new Event('input'));
            sendMessage();
        });
    });
}

async function sendMessage() {
    const content = userInput.value.trim();
    if (!content || isStreaming) return;

    // Remove welcome on first message
    if (messagesEl.querySelector('.welcome')) {
        messagesEl.innerHTML = '';
    }

    // Add user message
    appendUserMessage(content);
    userInput.value = '';
    userInput.style.height = 'auto';
    sendBtn.disabled = true;

    // Add AI loading placeholder
    const aiMsgEl = appendAIMessage('');
    const aiBubble = aiMsgEl.querySelector('.bubble');
    aiBubble.innerHTML = '<div class="loading-dots"><span></span><span></span><span></span></div>';

    isStreaming = true;
    statusEl.textContent = 'AI 思考中...';
    statusEl.classList.add('loading');

    const messages = collectMessages();

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: currentMode, messages })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || `请求失败：${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';

        aiBubble.innerHTML = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6).trim();
                    if (data === '[DONE]') continue;
                    fullText += data;
                    aiBubble.innerHTML = renderMarkdown(fullText);
                    scrollToBottom();
                }
            }
        }

        statusEl.textContent = '完成';
    } catch (error) {
        aiBubble.innerHTML = `<p style="color: #dc2626;">❌ ${escapeHtml(error.message)}</p>`;
        statusEl.textContent = '出错了';
    } finally {
        isStreaming = false;
        statusEl.classList.remove('loading');
        sendBtn.disabled = userInput.value.trim() === '';
    }
}

function collectMessages() {
    const messages = [];
    document.querySelectorAll('.message').forEach(msg => {
        const bubble = msg.querySelector('.bubble');
        const role = msg.classList.contains('user') ? 'user' : 'assistant';
        messages.push({ role, content: bubble.dataset.raw || bubble.textContent });
    });
    return messages;
}

function appendUserMessage(content) {
    const msg = document.createElement('div');
    msg.className = 'message user';
    msg.innerHTML = `
        <div class="avatar">👤</div>
        <div class="bubble" data-raw="${escapeHtml(content)}">${escapeHtml(content)}</div>
    `;
    messagesEl.appendChild(msg);
    scrollToBottom();
}

function appendAIMessage(content) {
    const msg = document.createElement('div');
    msg.className = 'message ai';
    msg.innerHTML = `
        <div class="avatar">🤖</div>
        <div class="bubble" data-raw="${escapeHtml(content)}">${renderMarkdown(content)}</div>
    `;
    messagesEl.appendChild(msg);
    scrollToBottom();
    return msg;
}

function renderMarkdown(text) {
    if (!text) return '';

    let html = escapeHtml(text);

    // Code blocks ```language ... ```
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
        return `<pre><code>${code.trimEnd()}</code></pre>`;
    });

    // Inline code `...`
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Headers
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

    // Bold and italic
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // Lists
    html = html.replace(/^\s*[-*] (.*$)/gim, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');

    // Paragraphs
    html = html.split('\n\n').map(p => {
        p = p.trim();
        if (!p) return '';
        if (p.startsWith('<h') || p.startsWith('<ul') || p.startsWith('<pre')) return p;
        return `<p>${p}</p>`;
    }).join('\n');

    return html;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
}
