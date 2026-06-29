# wotonger AI Agent - 基于deepseek 代码/文档/课程设计助手

一个基于 DeepSeek API 的 Web 端 AI 助手，帮助学生完成代码编写、文档撰写和毕业课程设计。

## 功能特性

- 💻 **写代码模式**：生成可运行代码、解释算法、Debug
- 📝 **写文档模式**：生成课程论文、实验报告、项目文档
- 🎓 **课程设计模式**：选题分析、系统设计、实现步骤
- 💬 **通用问答模式**：日常问题解答
- 🌐 **Web 页面**：简洁的聊天界面，支持流式响应

## 快速开始

### 1. 配置环境变量

复制示例配置文件：

```bash
copy .env.example .env
```

编辑 `.env`，填入你的 DeepSeek API Key：

```env
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
FLASK_PORT=5000
FLASK_DEBUG=True
```

> 没有 API Key？去 [DeepSeek 开放平台](https://platform.deepseek.com/) 注册获取。

### 2. 启动服务

```bash
# 使用项目配套的虚拟环境
C:\ProgramData\WorkBuddy\users\d26faf5\.workbuddy\binaries\python\envs\ai-agent-web\Scripts\python.exe app.py
```

### 3. 打开浏览器

访问：`http://localhost:5000`

## 项目结构

```
ai-agent-web/
├── app.py              # Flask 后端
├── requirements.txt    # 依赖列表
├── .env.example        # 环境变量示例
├── templates/
│   └── index.html      # 前端页面
└── static/
    ├── css/style.css   # 样式
    └── js/main.js      # 前端逻辑
```

## 技术栈

- **后端**：Python + Flask
- **大模型**：DeepSeek API（OpenAI 兼容接口）
- **前端**：原生 HTML / CSS / JavaScript

## 扩展建议

1. **接入数据库**：保存对话历史到 MySQL/SQLite
2. **用户系统**：添加登录注册，区分不同用户
3. **文件上传**：支持上传 PDF/Word 进行文档分析
4. **语音输入**：接入浏览器 Web Speech API
5. **Markdown 导出**：把 AI 生成的内容导出为 .md 或 .docx
