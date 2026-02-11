import os
import json
import datetime
import urllib.request
import urllib.parse
import threading

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").strip()
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "").strip()

# 线程安全的内存存储（当 Supabase 不可用时使用）
_memory_store_lock = threading.Lock()
_memory_store = {
    "history": [],
    "id_counter": 1
}


def _headers():
    return {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


def _request(method, path, params=None, payload=None, count=None, prefer=None):
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        raise RuntimeError("Supabase credentials not set")
    url = SUPABASE_URL.rstrip("/") + path
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, method=method, headers=_headers())
    if count:
        req.add_header("Prefer", f"count={count}")
    if prefer:
        req.add_header("Prefer", prefer)
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        req.data = data
    with urllib.request.urlopen(req, timeout=10) as resp:
        body = resp.read().decode("utf-8")
        return resp.getheaders(), body


def _use_supabase():
    """检查是否使用 Supabase"""
    return bool(SUPABASE_URL and SUPABASE_ANON_KEY)


def init_db():
    """No-op for Supabase. Ensure table exists in Supabase console."""
    return True


def health_check():
    """检查数据库连接状态"""
    if not _use_supabase():
        return True  # 内存模式总是健康
    try:
        # 尝试一个简单的查询来验证连接
        params = {"select": "count", "limit": "1"}
        _, body = _request("GET", "/rest/v1/history", params=params)
        return True
    except Exception as e:
        print(f"Health check failed: {e}")
        return False


def _get_current_timestamp():
    """获取当前UTC时间戳的ISO格式字符串"""
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def _get_today_iso():
    """获取今天的ISO格式日期字符串（UTC）"""
    return datetime.datetime.now(datetime.timezone.utc).date().isoformat()


def add_record(rule_data, client_id):
    """Insert a new history record into Supabase or memory."""
    if not _use_supabase():
        # 内存模式 - 线程安全
        with _memory_store_lock:
            record = {
                "id": _memory_store["id_counter"],
                "rule_id": rule_data["id"],
                "content": rule_data["content"],
                "category": rule_data.get("category", ""),
                "timestamp": _get_current_timestamp(),
                "client_id": client_id,
            }
            _memory_store["id_counter"] += 1
            _memory_store["history"].append(record)
            return record
    
    payload = {
        "rule_id": rule_data["id"],
        "content": rule_data["content"],
        "category": rule_data.get("category", ""),
        "timestamp": _get_current_timestamp(),
        "client_id": client_id,
    }
    _, body = _request("POST", "/rest/v1/history", payload=payload, prefer="return=representation")
    rows = json.loads(body) if body else []
    if rows:
        return rows[0]
    # Fallback: fetch latest record for this client
    latest = get_recent_history(1, client_id)
    if latest:
        return {
            "id": latest[0][0],
            "rule_id": latest[0][1],
            "content": latest[0][2],
            "category": latest[0][3],
            "timestamp": latest[0][4],
        }
    return None


def get_recent_history(limit=20, client_id=None):
    """Get recent history records for a client."""
    if not _use_supabase():
        # 内存模式 - 线程安全
        with _memory_store_lock:
            filtered = [r for r in _memory_store["history"] if not client_id or r.get("client_id") == client_id]
            sorted_history = sorted(filtered, key=lambda x: x.get("id", 0), reverse=True)
            result = sorted_history[:limit]
            return [
                (r.get("id"), r.get("rule_id"), r.get("content"), r.get("category"), r.get("timestamp"))
                for r in result
            ]
    
    params = {
        "select": "id,rule_id,content,category,timestamp",
        "order": "id.desc",
        "limit": str(limit),
    }
    if client_id:
        params["client_id"] = f"eq.{client_id}"
    _, body = _request("GET", "/rest/v1/history", params=params)
    rows = json.loads(body) if body else []
    return [
        (r.get("id"), r.get("rule_id"), r.get("content"), r.get("category"), r.get("timestamp"))
        for r in rows
    ]


def get_recent_ids(limit=10, client_id=None):
    """Get recent rule ids for de-duplication for a client."""
    if not _use_supabase():
        # 内存模式 - 线程安全
        with _memory_store_lock:
            filtered = [r for r in _memory_store["history"] if not client_id or r.get("client_id") == client_id]
            sorted_history = sorted(filtered, key=lambda x: x.get("id", 0), reverse=True)
            return [r.get("rule_id") for r in sorted_history[:limit] if r.get("rule_id")]
    
    params = {
        "select": "rule_id",
        "order": "id.desc",
        "limit": str(limit),
    }
    if client_id:
        params["client_id"] = f"eq.{client_id}"
    _, body = _request("GET", "/rest/v1/history", params=params)
    rows = json.loads(body) if body else []
    return [r.get("rule_id") for r in rows if r.get("rule_id")]


def delete_last_record(client_id):
    """Delete the most recent record for a client and return it."""
    if not _use_supabase():
        # 内存模式 - 线程安全
        with _memory_store_lock:
            filtered = [r for r in _memory_store["history"] if r.get("client_id") == client_id]
            if not filtered:
                return None
            sorted_history = sorted(filtered, key=lambda x: x.get("id", 0), reverse=True)
            record = sorted_history[0]
            _memory_store["history"] = [r for r in _memory_store["history"] if r.get("id") != record.get("id")]
            return (record.get("id"), record.get("rule_id"), record.get("content"), record.get("category"), record.get("timestamp"))
    
    rows = get_recent_history(1, client_id)
    if not rows:
        return None
    row = rows[0]
    params = {"id": f"eq.{row[0]}", "client_id": f"eq.{client_id}"}
    _request("DELETE", "/rest/v1/history", params=params)
    return row


def delete_records_by_ids(client_id, ids):
    """Delete records by ids for a client."""
    if not ids:
        return 0
    
    # 验证和清理id列表，防止注入
    valid_ids = []
    for i in ids:
        try:
            valid_ids.append(int(i))
        except (ValueError, TypeError):
            continue
    
    if not valid_ids:
        return 0
    
    if not _use_supabase():
        # 内存模式 - 线程安全
        with _memory_store_lock:
            original_count = len(_memory_store["history"])
            _memory_store["history"] = [
                r for r in _memory_store["history"] 
                if not (r.get("client_id") == client_id and r.get("id") in valid_ids)
            ]
            return original_count - len(_memory_store["history"])
    
    # 使用参数化查询，防止SQL注入
    id_list = ",".join(str(i) for i in valid_ids)
    params = {"id": f"in.({id_list})", "client_id": f"eq.{client_id}"}
    _request("DELETE", "/rest/v1/history", params=params)
    return len(valid_ids)


def _count_today(client_id):
    """统计今日记录数（使用UTC时间）"""
    if not _use_supabase():
        # 内存模式 - 线程安全
        with _memory_store_lock:
            today = _get_today_iso()
            filtered = [
                r for r in _memory_store["history"] 
                if r.get("client_id") == client_id and r.get("timestamp", "").startswith(today)
            ]
            return len(filtered)
    
    today = _get_today_iso()
    params = {
        "select": "id",
        "timestamp": f"gte.{today}T00:00:00Z",
        "client_id": f"eq.{client_id}",
    }
    headers, _ = _request("GET", "/rest/v1/history", params=params, count="exact")
    for k, v in headers:
        if k.lower() == "content-range":
            total = v.split("/")[-1]
            try:
                return int(total)
            except ValueError:
                return 0
    return 0


def _count_by_category(client_id):
    """按分类统计记录数"""
    if not _use_supabase():
        # 内存模式 - 线程安全
        with _memory_store_lock:
            filtered = [r for r in _memory_store["history"] if r.get("client_id") == client_id]
            by_category = {}
            for r in filtered:
                cat = r.get("category")
                if not cat:
                    continue
                by_category[cat] = by_category.get(cat, 0) + 1
            return by_category
    
    params = {"select": "category", "limit": "1000", "client_id": f"eq.{client_id}"}
    _, body = _request("GET", "/rest/v1/history", params=params)
    rows = json.loads(body) if body else []
    by_category = {}
    for r in rows:
        cat = r.get("category")
        if not cat:
            continue
        by_category[cat] = by_category.get(cat, 0) + 1
    return by_category


def get_stats(client_id):
    """Return basic stats for a client."""
    today_count = _count_today(client_id)
    by_category = _count_by_category(client_id)
    total = sum(by_category.values()) or 0
    top_category = None
    top_pct = 0
    if total > 0:
        top_category = max(by_category, key=by_category.get)
        top_pct = int(round(by_category[top_category] / total * 100))
    return {
        "today_count": today_count,
        "by_category": by_category,
        "top_category": top_category,
        "top_pct": top_pct,
        "ok": True
    }
