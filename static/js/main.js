let currentMode = 'code';
let currentSessionId = null;
let isStreaming = false;

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
const sessionListEl = document.getElementById('sessionList');

// Mode switching
document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        if (isStreaming) return;
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentMode = btn.dataset.mode;
        updateModeDisplay();
        if (currentSessionId) {
            updateSessionMode(currentSessionId, currentMode);
        }
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
newChatBtn.addEventListener('click', createNewSession);

async function createNewSession() {
    if (isStreaming) return;
    try {
        const res = await fetch('/api/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: currentMode, title: '新对话' })
        });
        const data = await res.json();
        currentSessionId = data.id;
        resetChatArea();
        await loadSessions();
        highlightActiveSession();
    } catch (err) {
        console.error('创建会话失败', err);
    }
}

function resetChatArea() {
    messagesEl.innerHTML = `
        <div class="welcome">
            <h2>今天想学什么？</h2>
            <p>我可以帮你写代码、改 Bug、写论文、规划课程设计。</p>
            <div class="quick-actions">
                <button class="quick-btn" data-prompt="帮我写一个 Python 学生成绩管理系统的核心代码">Python 成绩管理系统</button>
                <button class="quick-btn" data-prompt="帮我写一篇关于人工智能在教育中应用的课程论文大纲">AI 教育应用论文大纲</button>
                <button class="quick-btn" data-prompt="帮我规划一个基于 Django 的在线商城课程设计">Django 商城课程设计</button>
            </div>
        </div>
    `;
    bindQuickButtons();
    userInput.value = '';
    userInput.style.height = 'auto';
    sendBtn.disabled = true;
}

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

// Sessions
async function loadSessions() {
    try {
        const res = await fetch('/api/sessions');
        const data = await res.json();
        renderSessions(data.sessions);
    } catch (err) {
        console.error('加载会话失败', err);
    }
}

function renderSessions(sessions) {
    sessionListEl.innerHTML = '';
    if (sessions.length === 0) {
        sessionListEl.innerHTML = '<div class="empty-sessions">暂无对话记录</div>';
        return;
    }

    sessions.forEach(session => {
        const item = document.createElement('div');
        item.className = 'session-item' + (session.id === currentSessionId ? ' active' : '');
        item.dataset.id = session.id;
        item.innerHTML = `
            <span class="session-title">${escapeHtml(session.title)}</span>
            <button class="session-delete" title="删除">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
            </button>
        `;

        item.addEventListener('click', (e) => {
            if (e.target.closest('.session-delete')) return;
            loadSession(session.id);
        });

        item.querySelector('.session-delete').addEventListener('click', (e) => {
            e.stopPropagation();
            deleteSession(session.id);
        });

        sessionListEl.appendChild(item);
    });
}

function highlightActiveSession() {
    document.querySelectorAll('.session-item').forEach(item => {
        item.classList.toggle('active', parseInt(item.dataset.id) === currentSessionId);
    });
}

async function loadSession(sessionId) {
    if (isStreaming) return;
    try {
        const res = await fetch(`/api/sessions/${sessionId}/messages`);
        const data = await res.json();
        if (!data.session) return;

        currentSessionId = sessionId;
        currentMode = data.session.mode;

        document.querySelectorAll('.mode-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.mode === currentMode);
        });
        updateModeDisplay();

        messagesEl.innerHTML = '';
        data.messages.forEach(msg => {
            if (msg.role === 'user') {
                appendUserMessage(msg.content, false);
            } else {
                appendAIMessage(msg.content, false);
            }
        });
        applyHighlightToMessages();
        scrollToBottom();
        highlightActiveSession();
    } catch (err) {
        console.error('加载会话失败', err);
    }
}

async function deleteSession(sessionId) {
    if (isStreaming) return;
    try {
        await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
        if (currentSessionId === sessionId) {
            currentSessionId = null;
            resetChatArea();
        }
        await loadSessions();
    } catch (err) {
        console.error('删除会话失败', err);
    }
}

async function updateSessionTitle(sessionId, title) {
    try {
        await fetch(`/api/sessions/${sessionId}/title`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title })
        });
    } catch (err) {
        console.error('更新标题失败', err);
    }
}

async function updateSessionMode(sessionId, mode) {
    try {
        await fetch(`/api/sessions/${sessionId}/mode`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode })
        });
    } catch (err) {
        console.error('更新模式失败', err);
    }
}

async function sendMessage() {
    const content = userInput.value.trim();
    if (!content || isStreaming) return;

    // Create session if none exists
    if (!currentSessionId) {
        try {
            const res = await fetch('/api/sessions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode: currentMode, title: content.slice(0, 20) })
            });
            const data = await res.json();
            currentSessionId = data.id;
            await loadSessions();
            highlightActiveSession();
        } catch (err) {
            console.error('创建会话失败', err);
            return;
        }
    }

    // Remove welcome on first message
    if (messagesEl.querySelector('.welcome')) {
        messagesEl.innerHTML = '';
    }

    // Add user message
    appendUserMessage(content, true);
    userInput.value = '';
    userInput.style.height = 'auto';
    sendBtn.disabled = true;

    // Add AI loading placeholder
    const aiMsgEl = appendAIMessage('', true);
    const aiBubble = aiMsgEl.querySelector('.bubble');
    aiBubble.innerHTML = '<div class="loading-dots"><span></span><span></span><span></span></div>';

    isStreaming = true;
    statusEl.textContent = '思考中...';
    statusEl.classList.add('loading');

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: currentMode, session_id: currentSessionId, content })
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
                    applyHighlightToElement(aiBubble);
                    scrollToBottom();
                }
            }
        }

        statusEl.textContent = '完成';

        // Update session title from first user message if still default
        const sessionTitleEl = document.querySelector(`.session-item[data-id="${currentSessionId}"] .session-title`);
        if (sessionTitleEl && sessionTitleEl.textContent === '新对话') {
            const firstUserMsg = document.querySelector('.message.user .bubble');
            if (firstUserMsg) {
                const title = firstUserMsg.textContent.slice(0, 20);
                sessionTitleEl.textContent = title;
                updateSessionTitle(currentSessionId, title);
            }
        }
    } catch (error) {
        aiBubble.innerHTML = `<p style="color: #dc2626;">❌ ${escapeHtml(error.message)}</p>`;
        statusEl.textContent = '出错了';
    } finally {
        isStreaming = false;
        statusEl.classList.remove('loading');
        sendBtn.disabled = userInput.value.trim() === '';
    }
}

function appendUserMessage(content, animate = true) {
    const msg = document.createElement('div');
    msg.className = 'message user' + (animate ? '' : ' no-animate');
    msg.innerHTML = `
        <div class="avatar">我</div>
        <div class="bubble-wrap"><div class="bubble" data-raw="${escapeHtml(content)}">${escapeHtml(content)}</div></div>
    `;
    messagesEl.appendChild(msg);
    scrollToBottom();
}

function appendAIMessage(content, animate = true) {
    const msg = document.createElement('div');
    msg.className = 'message ai' + (animate ? '' : ' no-animate');
    msg.innerHTML = `
        <div class="avatar">AI</div>
        <div class="bubble-wrap"><div class="bubble" data-raw="${escapeHtml(content)}">${renderMarkdown(content)}</div></div>
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
        const language = lang || 'text';
        return `<div class="code-block">
            <div class="code-header">
                <span>${language}</span>
                <button class="copy-btn" onclick="copyCode(this)">
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                    </svg>
                    复制
                </button>
            </div>
            <pre><code class="language-${language}">${code.trimEnd()}</code></pre>
        </div>`;
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
        if (p.startsWith('<h') || p.startsWith('<ul') || p.startsWith('<div class="code-block"')) return p;
        return `<p>${p}</p>`;
    }).join('\n');

    return html;
}

function copyCode(btn) {
    const codeBlock = btn.closest('.code-block');
    const code = codeBlock.querySelector('code').textContent;
    navigator.clipboard.writeText(code).then(() => {
        btn.classList.add('copied');
        btn.innerHTML = '已复制';
        setTimeout(() => {
            btn.classList.remove('copied');
            btn.innerHTML = `
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                </svg>
                复制
            `;
        }, 1500);
    });
}

function applyHighlightToElement(element) {
    element.querySelectorAll('pre code').forEach(block => {
        hljs.highlightElement(block);
    });
}

function applyHighlightToMessages() {
    messagesEl.querySelectorAll('pre code').forEach(block => {
        hljs.highlightElement(block);
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
}

// Init
loadSessions();
updateModeDisplay();
