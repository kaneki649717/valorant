# -*- coding: utf-8 -*-
import streamlit as st
import json
import os
import sys
import threading
import socket
import re
import subprocess
import tempfile
import shutil
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs

# 1. Page configuration
st.set_page_config(layout="wide", page_title="内鬼裁决终端", initial_sidebar_state="collapsed")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SRC_DIR = os.path.join(BASE_DIR, "src")
if SRC_DIR not in sys.path:
    sys.path.insert(0, SRC_DIR)

import db  # noqa: E402

# Secrets: read from environment, Streamlit secrets, or local .streamlit/secrets.toml
def _load_local_secrets():
    secrets_path = os.path.join(BASE_DIR, ".streamlit", "secrets.toml")
    if not os.path.exists(secrets_path):
        return {}
    data = {}
    try:
        with open(secrets_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                key = key.strip().lstrip("\ufeff")
                value = value.strip().strip('"').strip("'")
                data[key] = value
    except Exception:
        return {}
    return data


local_secrets = _load_local_secrets()

try:
    SUPABASE_URL = os.environ.get("SUPABASE_URL") or st.secrets.get("SUPABASE_URL", "") or local_secrets.get("SUPABASE_URL", "")
    SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY") or st.secrets.get("SUPABASE_ANON_KEY", "") or local_secrets.get("SUPABASE_ANON_KEY", "")
except Exception:
    SUPABASE_URL = os.environ.get("SUPABASE_URL", "") or local_secrets.get("SUPABASE_URL", "")
    SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "") or local_secrets.get("SUPABASE_ANON_KEY", "")

# 配置数据库层（仅在服务端保留密钥）
if SUPABASE_URL:
    os.environ["SUPABASE_URL"] = SUPABASE_URL
if SUPABASE_ANON_KEY:
    os.environ["SUPABASE_ANON_KEY"] = SUPABASE_ANON_KEY

API_PORT = int(os.environ.get("API_PORT", "8502"))  # 默认8502端口

# 全局变量用于存储server实例（用于优雅关闭）
_api_server = None
_api_server_lock = threading.Lock()


def _find_free_port(start_port=8502, max_port=9000):
    """查找可用端口"""
    for port in range(start_port, max_port + 1):
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.bind(("0.0.0.0", port))
            sock.close()
            return port
        except OSError:
            continue
    # 如果指定范围都不可用，让系统自动分配
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.bind(("0.0.0.0", 0))
    port = sock.getsockname()[1]
    sock.close()
    return port


@st.cache_resource
def start_api():
    """启动API服务器，使用单例模式确保只有一个实例"""
    global _api_server
    
    with _api_server_lock:
        if _api_server is not None:
            return _api_server
    
    db.init_db()

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, format, *args):
            # 静默日志，避免输出到控制台
            pass
            
        def _send_json(self, obj, status=200):
            data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.end_headers()
            self.wfile.write(data)

        def _send_error(self, message, status=500):
            self._send_json({"error": message, "ok": False}, status=status)

        def do_OPTIONS(self):
            self.send_response(204)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.end_headers()

        def do_GET(self):
            parsed = urlparse(self.path)
            try:
                if parsed.path == "/api/history/list":
                    qs = parse_qs(parsed.query)
                    limit = int(qs.get("limit", ["20"])[0])
                    client_id = qs.get("client_id", [""])[0]
                    if not client_id:
                        return self._send_error("缺少客户端ID", status=400)
                    rows = db.get_recent_history(limit, client_id)
                    items = [
                        {
                            "id": r[0],
                            "rule_id": r[1],
                            "content": r[2],
                            "category": r[3],
                            "timestamp": r[4],
                        }
                        for r in rows
                    ]
                    return self._send_json({"items": items, "ok": True})

                if parsed.path == "/api/history/recent":
                    qs = parse_qs(parsed.query)
                    limit = int(qs.get("limit", ["10"])[0])
                    client_id = qs.get("client_id", [""])[0]
                    if not client_id:
                        return self._send_error("缺少客户端ID", status=400)
                    return self._send_json({"ids": db.get_recent_ids(limit, client_id), "ok": True})

                if parsed.path == "/api/history/stats":
                    qs = parse_qs(parsed.query)
                    client_id = qs.get("client_id", [""])[0]
                    if not client_id:
                        return self._send_error("缺少客户端ID", status=400)
                    stats = db.get_stats(client_id)
                    stats["ok"] = True
                    return self._send_json(stats)

                if parsed.path == "/api/health":
                    # 检查数据库连接状态
                    try:
                        db_health = db.health_check()
                        return self._send_json({"ok": True, "db_connected": db_health})
                    except Exception as e:
                        return self._send_json({"ok": True, "db_connected": False, "db_error": str(e)})

                self._send_error("未找到接口", status=404)
            except Exception as e:
                print(f"API Error in GET {parsed.path}: {e}")
                self._send_error(f"服务器错误: {str(e)}", status=500)

        def do_POST(self):
            parsed = urlparse(self.path)
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length) if length else b"{}"
            try:
                payload = json.loads(body.decode("utf-8"))
            except json.JSONDecodeError:
                return self._send_error("无效的JSON数据", status=400)

            try:
                if parsed.path == "/api/history/add":
                    client_id = payload.get("client_id")
                    if not client_id:
                        return self._send_error("缺少客户端ID", status=400)
                    if not payload.get("id") or not payload.get("content"):
                        return self._send_error("缺少必要的字段", status=400)

                    item = db.add_record(payload, client_id)
                    if not item:
                        latest = db.get_recent_history(1, client_id)
                        if latest:
                            item = {
                                "id": latest[0][0],
                                "rule_id": latest[0][1],
                                "content": latest[0][2],
                                "category": latest[0][3],
                                "timestamp": latest[0][4],
                            }
                    return self._send_json({"ok": True, "item": item})

                if parsed.path == "/api/history/undo":
                    client_id = payload.get("client_id")
                    if not client_id:
                        return self._send_error("缺少客户端ID", status=400)

                    ids = payload.get("ids") or []
                    if ids:
                        deleted_count = db.delete_records_by_ids(client_id, ids)
                        return self._send_json({"ok": True, "deleted_count": deleted_count})

                    row = db.delete_last_record(client_id)
                    if not row:
                        return self._send_json({"ok": False, "message": "没有可撤销的记录"})

                    return self._send_json({
                        "ok": True,
                        "item": {
                            "id": row[0],
                            "rule_id": row[1],
                            "content": row[2],
                            "category": row[3],
                            "timestamp": row[4],
                        },
                    })

                self._send_error("未找到接口", status=404)
            except Exception as e:
                print(f"API Error in POST {parsed.path}: {e}")
                self._send_error(f"服务器错误: {str(e)}", status=500)

    # 查找可用端口
    actual_port = _find_free_port(API_PORT if API_PORT > 0 else 8502)
    
    server = HTTPServer(("0.0.0.0", actual_port), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    
    with _api_server_lock:
        _api_server = {"server": server, "port": actual_port}
    
    return _api_server


# 启动API服务器并获取端口信息
api_info = start_api()
# 确保获取到有效端口
if api_info and "port" in api_info and api_info["port"] > 0:
    ACTUAL_API_PORT = api_info["port"]
else:
    # 如果缓存返回无效端口，使用默认端口
    ACTUAL_API_PORT = 8502


def load_text(path):
    abs_path = path
    if not os.path.isabs(path):
        abs_path = os.path.join(BASE_DIR, path)
    try:
        # 先尝试utf-8-sig处理BOM
        for enc in ("utf-8-sig", "utf-8", "gbk"):
            try:
                with open(abs_path, 'r', encoding=enc) as f:
                    return f.read()
            except UnicodeDecodeError:
                continue
        with open(abs_path, 'r', encoding="utf-8", errors="replace") as f:
            return f.read()
    except FileNotFoundError:
        return ""


css_content = load_text("assets/css/style.css")
fallback_css = """
:root {
    --bg-color: #0f1923;
    --panel-bg: rgba(15, 25, 35, 0.95);
    --accent-color: #ff4655;
    --text-primary: #ece8e1;
    --text-dim: #768079;
    --border-dim: rgba(236, 232, 225, 0.1);
    --glass-edge: rgba(120, 200, 255, 0.3);
}

html, body {
    background-color: var(--bg-color);
    color: var(--text-primary);
}

.control-deck {
    background: var(--panel-bg);
    border-right: 2px solid var(--border-dim);
}

.brand { color: var(--accent-color); }

.result-stage {
    background-image:
        linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
    background-size: 40px 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
}

.result-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 40px;
    max-width: 80%;
}

.category-label {
    font-size: 18px;
    color: rgba(120,200,255,0.8);
    letter-spacing: 2px;
    margin-bottom: 20px;
    text-transform: uppercase;
}

.punish-content {
    font-size: 56px;
    font-weight: 800;
    color: var(--text-primary);
    line-height: 1.4;
    text-shadow: 0 0 30px rgba(120,200,255,0.3);
    word-wrap: break-word;
    overflow-wrap: break-word;
    max-width: 100%;
}

/* 数据流层应该在内容后面 */
.datastream-layer {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
    z-index: 0;
}

/* 结果卡片要在数据流上层 */
.result-card {
    position: relative;
    z-index: 1;
}

/* 修复数据流位置 */
.datastream-line-x {
    right: -12%;
    animation: dataFlowX linear forwards;
    animation-duration: var(--dur, 5600ms);
    animation-delay: var(--delay, 0ms);
}

/* 修复 reveal-char 显示 */
.reveal-char {
    display: inline-block;
    min-width: 0.6em;
    color: var(--text-primary);
}

/* Rules stage */
.rules-stage {
    background: rgba(15, 25, 35, 0.6);
    padding: 24px 32px;
    border-top: 2px solid var(--border-dim);
}

.rules-inner {
    max-width: 1400px;
    margin: 0 auto;
}

.rules-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
    flex-wrap: wrap;
    gap: 12px;
}

.filter-group {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
}

/* Note: .filter-btn styles moved to style.css */

.rules-stats {
    font-size: 14px;
    color: var(--text-dim);
}

.rules-footer {
    margin-top: 24px;
    padding-top: 20px;
    border-top: 1px solid var(--border-dim);
}

.rules-footnote {
    font-size: 13px;
    color: var(--text-dim);
    text-align: center;
}
"""

json_data = load_text("assets/data/rules.json")

# 预先生成规则数据 - 直接作为JS对象
if json_data:
    try:
        # 解析JSON并验证
        rules_obj = json.loads(json_data)
        # 直接序列化为JS对象（不包裹在字符串中）
        json_data_js = json.dumps(rules_obj, ensure_ascii=False)
    except json.JSONDecodeError:
        json_data_js = '[]'
else:
    json_data_js = '[]'

# 加载所有 JS 模块
config_js = load_text("src/config.js")
utils_js = load_text("src/utils.js")
api_js = load_text("src/api.js")
effects_js = load_text("src/effects.js")
store_js = load_text("src/core/Store.js")
glitch_js = load_text("src/components/GlitchText.js")
main_js = load_text("src/main.js")


# 构建 JS 代码 - 使用更健壮的模块处理方式
def process_js(content):
    """处理 JS 代码，移除 ES6 模块语法，保留所有定义在全局作用域"""
    import re
    
    # 移除单行注释中的内容先保护起来
    comment_map = {}
    comment_idx = 0
    
    def save_comment(match):
        nonlocal comment_idx
        key = f"__COMMENT_{comment_idx}__"
        comment_idx += 1
        comment_map[key] = match.group(0)
        return key
    
    # 保护字符串
    string_map = {}
    string_idx = 0
    
    def save_string(match):
        nonlocal string_idx
        key = f"__STRING_{string_idx}__"
        string_idx += 1
        string_map[key] = match.group(0)
        return key
    
    # ????????????
    # 1) ??????????????????????? __STRING ??
    content = re.sub(r'`(?:[^`\\]|\\.|\\n)*`', save_string, content, flags=re.MULTILINE)
    # 2) ????????
    content = re.sub(r'"(?:[^"\\]|\\.)*"', save_string, content)
    content = re.sub(r"'(?:[^'\\]|\\.)*'", save_string, content)
    
    # 保护注释
    content = re.sub(r'//.*$', save_comment, content, flags=re.MULTILINE)
    content = re.sub(r'/\*[\s\S]*?\*/', save_comment, content)
    
    # 移除所有 import 语句（更精确的匹配）
    content = re.sub(r'^\s*import\s+\{[^}]+\}\s+from\s+__STRING_\d+__\s*;?', '', content, flags=re.MULTILINE)
    content = re.sub(r'^\s*import\s+\w+\s+from\s+__STRING_\d+__\s*;?', '', content, flags=re.MULTILINE)
    content = re.sub(r'^\s*import\s+__STRING_\d+__\s*;?', '', content, flags=re.MULTILINE)
    content = re.sub(r'^\s*import\s+\*\s+as\s+\w+\s+from\s+__STRING_\d+__\s*;?', '', content, flags=re.MULTILINE)
    
    # 处理 export default
    content = re.sub(r'^\s*export\s+default\s+', '', content, flags=re.MULTILINE)
    
    # 处理 export class/function/const/let/var - 移除 export 关键字但保留定义
    # 处理 export async function 情况
    content = re.sub(r'^\s*export\s+async\s+function\s+', r'async function ', content, flags=re.MULTILINE)
    # 处理其他 export 情况
    content = re.sub(r'^\s*export\s+(class|function|const|let|var)\s+', r'\1 ', content, flags=re.MULTILINE)
    
    # 处理 export { ... }
    content = re.sub(r'^\s*export\s+\{[^}]*\}\s*;?', '', content, flags=re.MULTILINE)
    
    # 恢复字符串
    for i in range(string_idx - 1, -1, -1):
        key = f"__STRING_{i}__"
        val = string_map.get(key)
        if val is not None:
            content = content.replace(key, val)
    
    # 恢复注释
    for key, val in comment_map.items():
        content = content.replace(key, val)
    
    return content


# 按依赖顺序合并所有模块：config -> utils -> api -> effects -> Store -> GlitchText -> main
combined_js = f"""
// ==================== Config Module ====================
{process_js(config_js)}

// ==================== Utils Module ====================
{process_js(utils_js)}

// ==================== API Module ====================
{process_js(api_js)}

// ==================== Effects Module ====================
{process_js(effects_js)}

// ==================== Store Class ====================
{process_js(store_js)}

// ==================== GlitchText Class ====================
{process_js(glitch_js)}

// ==================== Main Entry ====================
{process_js(main_js)}
"""

# Auto JS syntax validation (prevent silent interaction failures)
def _validate_js_syntax(js_code):
    node_path = shutil.which("node")
    if not node_path:
        return True, "node not found"
    try:
        with tempfile.NamedTemporaryFile(mode="w", suffix=".js", delete=False, encoding="utf-8") as f:
            f.write(js_code)
            tmp_path = f.name
        proc = subprocess.run(
            [node_path, "--check", tmp_path],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if proc.returncode == 0:
            return True, ""
        return False, (proc.stderr or proc.stdout or "unknown JS syntax error")
    except Exception as e:
        return False, str(e)
    finally:
        try:
            if "tmp_path" in locals() and os.path.exists(tmp_path):
                os.remove(tmp_path)
        except Exception:
            pass


js_ok, js_error = _validate_js_syntax(combined_js)
if not js_ok:
    st.error("JS 语法校验失败，已阻止加载以避免交互完全失效。请修复后重试。")
    st.code(js_error)
    st.stop()

# Fallback check when node is unavailable: ensure no leaked __STRING placeholders
if re.search(r"__STRING_\\d+__", combined_js):
    st.error("JS 处理异常：检测到未还原的字符串占位符。")
    st.stop()

# 2. Inject global CSS overrides for Streamlit layout
st.markdown("""
    <style>
        /* Hide Streamlit header */
        header[data-testid="stHeader"] { display: none; }
        
        /* Hide Streamlit footer */
        footer { display: none; }

        /* Ensure page background matches app (avoid white edges) */
        html, body, .stApp {
            background: #0f1923 !important;
        }

        /* Ensure iframe and main areas don't show white */
        iframe, .main, section[data-testid="stMain"] {
            background: #0f1923 !important;
        }
        
        /* Remove default padding */
        .block-container {
            padding-top: 0rem !important;
            padding-bottom: 0rem !important;
            padding-left: 0rem !important;
            padding-right: 0rem !important;
            max-width: 100% !important;
        }
        
        /* Normalize iframe box model */
        iframe {
            display: block; /* Remove inline gaps */
            width: 100% !important;
        }
    </style>
""", unsafe_allow_html=True)

# 3. Build HTML - 不再暴露 Supabase 配置到前端
html_template = f"""
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <style>
        {fallback_css}
        {css_content}
        
        /* 强制卡片样式 - 确保生效 (v2) */
        .rules-list-container {{
            display: grid !important;
            grid-template-columns: repeat(5, 1fr) !important;
            gap: 20px !important;
            margin-bottom: 24px !important;
        }}
        
        @media (max-width: 1400px) {{
            .rules-list-container {{ grid-template-columns: repeat(4, 1fr) !important; }}
        }}
        
        @media (max-width: 1100px) {{
            .rules-list-container {{ grid-template-columns: repeat(3, 1fr) !important; }}
        }}
        
        @media (max-width: 800px) {{
            .rules-list-container {{ grid-template-columns: repeat(2, 1fr) !important; }}
        }}
        
        @media (max-width: 500px) {{
            .rules-list-container {{ grid-template-columns: 1fr !important; }}
        }}
        
        .rule-card {{
            padding: 18px 20px !important;
            border: 2px solid rgba(120, 200, 255, 0.6) !important;
            background: linear-gradient(145deg, rgba(36, 60, 85, 0.98), rgba(20, 30, 45, 0.98)) !important;
            outline: 1px solid rgba(255, 255, 255, 0.06) !important;
            border-radius: 18px !important;
            font-size: 15px !important;
            color: #ece8e1 !important;
            display: flex !important;
            flex-direction: column !important;
            gap: 12px !important;
            min-height: 79px !important;
            box-shadow: 0 14px 30px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.12) !important;
            transition: transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease, background 0.25s ease !important;
            position: relative !important;
            overflow: hidden !important;
            background-clip: padding-box !important;
            animation: cardBreath 3.6s ease-in-out infinite !important;
        }}
        
        .rule-card:hover {{
            transform: translateY(-5px) !important;
            border-color: rgba(120, 200, 255, 0.75) !important;
            box-shadow: 0 18px 40px rgba(0,0,0,0.6), 0 0 30px rgba(120, 200, 255, 0.3) !important;
            background: linear-gradient(145deg, rgba(46, 74, 98, 1), rgba(30, 45, 60, 1)) !important;
        }}
        
        .rule-card-index {{
            font-size: 12.5px !important;
            font-weight: 700 !important;
            color: rgba(120,200,255,0.9) !important;
            letter-spacing: 1px !important;
            align-self: flex-start !important;
            padding: 6px 12px !important;
            border-radius: 999px !important;
            background: rgba(120,200,255,0.18) !important;
            border: 1px solid rgba(120,200,255,0.35) !important;
        }}
        
        .rule-card-content {{
            font-size: 16.5px !important;
            font-weight: 600 !important;
            line-height: 1.5 !important;
            flex: 1 !important;
            display: block !important;
            align-items: center !important;
            max-height: 4.8em !important;
            overflow-y: auto !important;
            padding-right: 4px !important;
            word-wrap: break-word !important;
            overflow-wrap: break-word !important;
        }}
        
        .rule-card-id {{
            font-size: 13.5px !important;
            font-weight: 700 !important;
            color: #ff4655 !important;
            align-self: flex-end !important;
            padding: 6px 12px !important;
            border-radius: 999px !important;
            background: rgba(255, 70, 85, 0.14) !important;
            border: 1px solid rgba(255, 70, 85, 0.35) !important;
        }}

        .rule-card::after {{
            content: "" !important;
            position: absolute !important;
            inset: -60% -20% !important;
            background: linear-gradient(120deg, rgba(160,220,255,0.18), rgba(255,255,255,0.0) 60%) !important;
            transform: translateX(-40%) !important;
            opacity: 0 !important;
            transition: opacity 0.25s ease, transform 0.5s ease !important;
            pointer-events: none !important;
        }}

        .rule-card:hover::after {{
            opacity: 1 !important;
            transform: translateX(10%) !important;
        }}

        @keyframes cardBreath {{
            0%, 100% {{ box-shadow: 0 10px 24px rgba(0,0,0,0.4), 0 0 0 rgba(120,200,255,0); }}
            50% {{ box-shadow: 0 14px 30px rgba(0,0,0,0.5), 0 0 18px rgba(120,200,255,0.18); }}
        }}

        .low-perf .rule-card {{
            animation: none !important;
        }}

        .low-perf .rule-card::after {{
            display: none !important;
        }}
        
        /* Toast 动画 */
        @keyframes slideDown {{
            from {{ transform: translateX(-50%) translateY(-100%); opacity: 0; }}
            to {{ transform: translateX(-50%) translateY(0); opacity: 1; }}
        }}
        @keyframes slideUp {{
            from {{ transform: translateX(-50%) translateY(0); opacity: 1; }}
            to {{ transform: translateX(-50%) translateY(-100%); opacity: 0; }}
        }}
    </style>
</head>
<body>
    <div class="app-wrapper">
        <section class="top-stage">
            <aside class="control-deck">
                <div class="brand">忧郁是一种天赋(kook:000077)</div>
                <div class="control-note">选择类别 → 点击裁决。规则在下方区域，可向下滚动查看</div>
                <label class="control-label">抽取类别</label>
                <div class="category-dropdown" id="category-dropdown">
                    <button class="category-dropdown-trigger" id="category-trigger" type="button">
                        <span class="category-dropdown-text" id="category-value">全部</span>
                        <svg class="category-dropdown-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                    </button>
                    <div class="category-dropdown-menu" id="category-menu">
                        <div class="category-dropdown-item active" data-value="all">全部</div>
                        <div class="category-dropdown-item" data-value="tactical">战术</div>
                        <div class="category-dropdown-item" data-value="weaponry">器械</div>
                        <div class="category-dropdown-item" data-value="social">社交</div>
                        <div class="category-dropdown-item" data-value="contract">契约</div>
                    </div>
                </div>
                <div class="action-group">
                    <button id="btn-draw" class="btn-draw">执行裁决</button>
                    <button id="btn-draw-2" class="btn-draw btn-draw-secondary">双重裁决</button>
                </div>
                <div class="utility-group">
                    <button id="btn-copy" class="btn-draw btn-draw-tertiary">复制结果</button>
                    <button id="btn-undo" class="btn-draw btn-draw-tertiary">撤销本次</button>
                </div>
                <div class="history-panel">
                    <div class="panel-title">📜 最近裁决记录</div>
                    <div id="history-status" class="history-status">API 连接中...</div>
                    <div id="history-list" class="history-list"></div>
                </div>
                <div class="stats-panel">
                    <div class="panel-title">📊 裁决统计</div>
                    <div class="stats-list">
                        <div id="stats-today" class="stats-item">今日裁决: 0 次</div>
                        <div id="stats-top" class="stats-item">最常出现: —</div>
                    </div>
                </div>
            </aside>

            <main class="result-stage">
                <div class="draw-overlay">
                    <div class="overlay-scan"></div>
                </div>
                <div id="particle-layer" class="particle-layer"></div>
                <div class="scan-line"></div>
                <div class="result-card">
                    <div id="category-label" class="category-label">SYSTEM READY</div>
                    <div id="roulette-text" class="roulette-text"></div>
                    <div id="result-text" class="punish-content">等待指令</div>
                </div>
            </main>
        </section>

        <section class="rules-stage">
            <div class="rules-inner">
                <div class="rules-header">
                    <div class="filter-group">
                        <button class="filter-btn active" data-cat="all">全部</button>
                        <button class="filter-btn" data-cat="tactical">战术</button>
                        <button class="filter-btn" data-cat="weaponry">器械</button>
                        <button class="filter-btn" data-cat="social">社交</button>
                        <button class="filter-btn" data-cat="contract">契约</button>
                    </div>
                    <div id="rules-stats" class="rules-stats">全部 · 0 条规则</div>
                </div>
                <div id="rules-list" class="rules-list-container"></div>
                <div class="rules-footer">
                    <div class="rules-footnote">无畏契约内鬼模式惩罚随机抽取 专用于kookid000077 任何疑问找000077 你的抽取记录将永久保存</div>
                </div>
            </div>
        </section>
    </div>

    <script>
        // 仅暴露 API 基础地址，不再暴露 Supabase 密钥
        window.API_BASE = (window.parent && window.parent.location)
            ? (window.parent.location.protocol + "//" + window.parent.location.hostname + ":{API_PORT}")
            : (window.location.protocol + "//" + window.location.hostname + ":{API_PORT}");
        
        // 规则数据 - 直接作为JS对象注入，避免JSON解析问题
        window.injectedRulesData = {json_data_js};

        // 调试：显示规则数据加载状态
        console.log('[Debug] Rules data loaded:', window.injectedRulesData);
        console.log('[Debug] Rules count:', window.injectedRulesData ? window.injectedRulesData.length : 0);

        // 所有 JS 代码
        {combined_js}
    </script>
    <script>
        (function () {{
            var lastHeight = 0;
            function getBaseHeight() {{
                if (window.parent && window.parent.innerHeight) {{
                    return window.parent.innerHeight;
                }}
                return window.innerHeight || 800;
            }}
            function resizeFrame() {{
                var base = getBaseHeight();
                document.documentElement.style.setProperty('--top-stage-height', base + 'px');
                var rules = document.querySelector('.rules-stage');
                var rulesHeight = rules ? Math.ceil(rules.getBoundingClientRect().height) : 0;
                var h = base + rulesHeight + 6;
                if (!h || Math.abs(h - lastHeight) < 2) return;
                lastHeight = h;
                if (window.frameElement) {{
                    window.frameElement.style.height = h + "px";
                }}
                if (window.parent) {{
                    window.parent.postMessage({{ type: "streamlit:setFrameHeight", height: h }}, "*");
                }}
            }}
            window.__resizeFrame = resizeFrame;
            window.addEventListener("load", resizeFrame);
            window.addEventListener("resize", resizeFrame);
            resizeFrame();
        }})();
    </script>
</body>
</html>
"""

# 替换模板变量 - 不再暴露 Supabase 密钥
html_template = html_template.replace("{API_PORT}", str(ACTUAL_API_PORT))
html_template = html_template.replace("{json_data_js}", json_data_js)

# 4. Render HTML component; height is managed via postMessage resize
# 使用合理的初始高度，避免布局抖动
st.components.v1.html(html_template, height=800, scrolling=False)
