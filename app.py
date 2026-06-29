import os
from flask import Flask, render_template, request, Response, jsonify, stream_with_context
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv(override=True)

app = Flask(__name__)

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


def get_client():
    if not DEEPSEEK_API_KEY or DEEPSEEK_API_KEY == "your_deepseek_api_key_here":
        return None
    return OpenAI(api_key=DEEPSEEK_API_KEY, base_url=DEEPSEEK_BASE_URL)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/chat", methods=["POST"])
def chat():
    data = request.get_json() or {}
    mode = data.get("mode", "general")
    messages = data.get("messages", [])

    if not isinstance(messages, list) or len(messages) == 0:
        return jsonify({"error": "messages 不能为空"}), 400

    client = get_client()
    if client is None:
        return jsonify({
            "error": "未配置 DeepSeek API Key。请复制 .env.example 为 .env，并填写 DEEPSEEK_API_KEY。"
        }), 401

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
        for chunk in response:
            delta = chunk.choices[0].delta.content or "" if chunk.choices else ""
            if delta:
                yield f"data: {delta}\n\n"
        yield "data: [DONE]\n\n"

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
    port = int(os.getenv("FLASK_PORT", 5000))
    debug = os.getenv("FLASK_DEBUG", "True").lower() in ("true", "1", "yes")
    app.run(host="0.0.0.0", port=port, debug=debug)
