import os
import sqlite3
from datetime import datetime
from flask import Flask, render_template, request, Response, jsonify, stream_with_context, g
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv(override=True)

app = Flask(__name__)
DATABASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "chat.db")

# DeepSeek config
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")

SYSTEM_PROMPTS = {
    "code": (
        "你是一位资深软件工程师和编程导师。用户的请求与代码相关时，请：\n"
        "1. 优先给出完整、可运行的代码示例，代码必须清晰规范；\n"
        "2. 用中文解释关键逻辑、算法思路、可能遇到的坑；\n"
        "3. 如果用户提供了代码，先分析再修改，指出问题所在；\n"
        "4. 对代码中的关键行添加注释；\n"
        "5. 如果涉及多文件或项目结构，说明文件组织方式。"
    ),
    "document": (
        "你是一位专业的学术与技术文档写作助手。请帮助用户撰写课程论文、实验报告、项目文档等：\n"
        "1. 文档结构清晰：标题、摘要/引言、正文分节、结论、参考文献（可选）；\n"
        "2. 语言正式、逻辑严谨，符合学术/课程作业要求；\n"
        "3. 必要时使用表格、列表、公式、流程图描述；\n"
        "4. 内容应充实具体，避免空泛套话；\n"
        "5. 如果用户提供主题或要求，严格围绕主题展开。"
    ),
    "course_design": (
        "你是一位经验丰富的毕业设计/课程设计导师。请帮助用户完成课程设计或毕业设计：\n"
        "1. 先帮助分析选题背景、目标和意义；\n"
        "2. 给出系统总体设计：功能模块、技术选型、数据库设计建议；\n"
        "3. 提供详细实现步骤和里程碑；\n"
        "4. 针对技术难点给出解决方案；\n"
        "5. 可生成开题报告、需求分析、系统设计等阶段性文档大纲。"
    ),
    "general": (
        "你是一位耐心、专业、 helpful 的 AI 助手。请用中文清晰回答用户的问题，"
        "如果问题涉及多个方面，分点说明。"
    ),
}


def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DATABASE)
        g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(exception):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    with app.app_context():
        db = get_db()
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL DEFAULT '新对话',
                mode TEXT NOT NULL DEFAULT 'general',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
            """
        )
        db.commit()


def get_client():
    if not DEEPSEEK_API_KEY or DEEPSEEK_API_KEY == "your_deepseek_api_key_here":
        return None
    return OpenAI(api_key=DEEPSEEK_API_KEY, base_url=DEEPSEEK_BASE_URL)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/sessions", methods=["GET"])
def list_sessions():
    db = get_db()
    rows = db.execute(
        "SELECT id, title, mode, created_at, updated_at FROM sessions ORDER BY updated_at DESC"
    ).fetchall()
    return jsonify({"sessions": [dict(row) for row in rows]})


@app.route("/api/sessions", methods=["POST"])
def create_session():
    data = request.get_json() or {}
    mode = data.get("mode", "general")
    title = data.get("title", "新对话")
    now = datetime.now().isoformat()
    db = get_db()
    cursor = db.execute(
        "INSERT INTO sessions (title, mode, created_at, updated_at) VALUES (?, ?, ?, ?)",
        (title, mode, now, now),
    )
    db.commit()
    return jsonify({"id": cursor.lastrowid, "title": title, "mode": mode})


@app.route("/api/sessions/<int:session_id>", methods=["DELETE"])
def delete_session(session_id):
    db = get_db()
    db.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
    db.commit()
    return jsonify({"success": True})


@app.route("/api/sessions/<int:session_id>/title", methods=["PUT"])
def update_session_title(session_id):
    data = request.get_json() or {}
    title = data.get("title", "")
    if not title:
        return jsonify({"error": "title 不能为空"}), 400
    db = get_db()
    db.execute("UPDATE sessions SET title = ? WHERE id = ?", (title, session_id))
    db.commit()
    return jsonify({"success": True})


@app.route("/api/sessions/<int:session_id>/mode", methods=["PUT"])
def update_session_mode(session_id):
    data = request.get_json() or {}
    mode = data.get("mode", "")
    if not mode:
        return jsonify({"error": "mode 不能为空"}), 400
    db = get_db()
    db.execute("UPDATE sessions SET mode = ? WHERE id = ?", (mode, session_id))
    db.commit()
    return jsonify({"success": True})


@app.route("/api/sessions/<int:session_id>/messages", methods=["GET"])
def get_messages(session_id):
    db = get_db()
    rows = db.execute(
        "SELECT id, role, content, created_at FROM messages WHERE session_id = ? ORDER BY id ASC",
        (session_id,),
    ).fetchall()
    session = db.execute(
        "SELECT id, title, mode FROM sessions WHERE id = ?", (session_id,)
    ).fetchone()
    return jsonify(
        {
            "session": dict(session) if session else None,
            "messages": [dict(row) for row in rows],
        }
    )


@app.route("/api/sessions/<int:session_id>/messages", methods=["POST"])
def add_message(session_id):
    data = request.get_json() or {}
    role = data.get("role", "user")
    content = data.get("content", "")
    if not content:
        return jsonify({"error": "content 不能为空"}), 400

    db = get_db()
    now = datetime.now().isoformat()
    db.execute(
        "INSERT INTO messages (session_id, role, content, created_at) VALUES (?, ?, ?, ?)",
        (session_id, role, content, now),
    )
    db.execute("UPDATE sessions SET updated_at = ? WHERE id = ?", (now, session_id))
    db.commit()
    return jsonify({"success": True})


@app.route("/api/chat", methods=["POST"])
def chat():
    data = request.get_json() or {}
    mode = data.get("mode", "general")
    session_id = data.get("session_id")
    content = data.get("content", "")
    messages = data.get("messages", [])

    client = get_client()
    if client is None:
        return jsonify({
            "error": "未配置 DeepSeek API Key。请复制 .env.example 为 .env，并填写 DEEPSEEK_API_KEY。"
        }), 401

    db = get_db()
    now = datetime.now().isoformat()

    # Use session if provided
    if session_id:
        session = db.execute(
            "SELECT id, title, mode FROM sessions WHERE id = ?", (session_id,)
        ).fetchone()
        if not session:
            return jsonify({"error": "会话不存在"}), 404

        # Save user message
        db.execute(
            "INSERT INTO messages (session_id, role, content, created_at) VALUES (?, ?, ?, ?)",
            (session_id, "user", content, now),
        )
        db.execute("UPDATE sessions SET updated_at = ? WHERE id = ?", (now, session_id))
        db.commit()

        # Build history
        rows = db.execute(
            "SELECT role, content FROM messages WHERE session_id = ? ORDER BY id ASC",
            (session_id,),
        ).fetchall()
        messages = [{"role": row["role"], "content": row["content"]} for row in rows]
    else:
        # Stateless mode: use provided messages
        if not isinstance(messages, list) or len(messages) == 0:
            return jsonify({"error": "messages 不能为空"}), 400

    system_prompt = SYSTEM_PROMPTS.get(mode, SYSTEM_PROMPTS["general"])
    full_messages = [{"role": "system", "content": system_prompt}] + messages

    try:
        response = client.chat.completions.create(
            model=DEEPSEEK_MODEL,
            messages=full_messages,
            stream=True,
            temperature=0.7,
        )
    except Exception as e:
        return jsonify({"error": f"调用 DeepSeek API 失败：{str(e)}"}), 500

    def generate():
        full_reply = ""
        try:
            for chunk in response:
                delta = chunk.choices[0].delta.content or "" if chunk.choices else ""
                if delta:
                    full_reply += delta
                    yield f"data: {delta}\n\n"
            yield "data: [DONE]\n\n"
        finally:
            # Save assistant reply for session mode
            if session_id:
                db = get_db()
                db.execute(
                    "INSERT INTO messages (session_id, role, content, created_at) VALUES (?, ?, ?, ?)",
                    (session_id, "assistant", full_reply, datetime.now().isoformat()),
                )
                db.commit()

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.route("/api/models", methods=["GET"])
def list_models():
    client = get_client()
    if client is None:
        return jsonify({"error": "API Key 未配置"}), 401
    try:
        models = client.models.list()
        return jsonify({"models": [m.id for m in models.data]})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    init_db()
    port = int(os.getenv("FLASK_PORT", 5000))
    debug = os.getenv("FLASK_DEBUG", "True").lower() in ("true", "1", "yes")
    app.run(host="0.0.0.0", port=port, debug=debug)
