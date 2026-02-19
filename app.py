"""
Student Expense Manager — Flask Backend
Python + HTML + CSS + JS
"""
import os, json, requests
from datetime import datetime
from flask import (Flask, render_template, request, jsonify,
                   session, redirect, url_for, make_response)
from functools import wraps
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", "dev-secret-change-in-production")

SUPABASE_URL  = os.getenv("SUPABASE_URL",  "https://nnjetsrreubzefyrkrbq.supabase.co")
SUPABASE_KEY  = os.getenv("SUPABASE_KEY",  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uamV0c3JyZXViemVmeXJrcmJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1MDAzMjgsImV4cCI6MjA4NzA3NjMyOH0.sy6orbtX5t8wbeHzXsS5PGqJZORNb4JzbsfxVVWPNYg")
OPENAI_KEY    = os.getenv("OPENAI_KEY",    "")

# ─── Supabase helpers ─────────────────────────────────────────────────────────

def sb_headers(token=None):
    h = {"apikey": SUPABASE_KEY, "Content-Type": "application/json"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    else:
        h["Authorization"] = f"Bearer {SUPABASE_KEY}"
    return h

def sb_auth(path, payload):
    url = f"{SUPABASE_URL}/auth/v1/{path}"
    r = requests.post(url, headers=sb_headers(), json=payload, timeout=10)
    return r.json(), r.status_code

def sb_query(table, token, method="GET", params=None, payload=None, match=None):
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    if params:
        qs = "&".join(f"{k}={v}" for k, v in params.items())
        url += f"?{qs}"
    if match:
        url += ("&" if "?" in url else "?") + "&".join(f"{k}=eq.{v}" for k, v in match.items())
    r = requests.request(
        method, url,
        headers={**sb_headers(token), "Prefer": "return=representation"},
        json=payload, timeout=10
    )
    return r.json() if r.text else [], r.status_code

def sb_rpc(fn, token, payload):
    url = f"{SUPABASE_URL}/rest/v1/rpc/{fn}"
    r = requests.post(url, headers=sb_headers(token), json=payload, timeout=10)
    return r.json(), r.status_code

# ─── Auth decorator ───────────────────────────────────────────────────────────

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if "access_token" not in session:
            return redirect(url_for("auth_page"))
        return f(*args, **kwargs)
    return decorated

# ─── Page routes ──────────────────────────────────────────────────────────────

@app.route("/")
@login_required
def dashboard():
    return render_template("dashboard.html",
        user=session.get("user", {}),
        profile=session.get("profile", {}),
        supabase_url=SUPABASE_URL,
        supabase_key=SUPABASE_KEY)

@app.route("/analytics")
@login_required
def analytics():
    return render_template("analytics.html",
        user=session.get("user", {}),
        profile=session.get("profile", {}),
        supabase_url=SUPABASE_URL, supabase_key=SUPABASE_KEY)

@app.route("/transactions")
@login_required
def transactions():
    return render_template("transactions.html",
        user=session.get("user", {}),
        profile=session.get("profile", {}),
        supabase_url=SUPABASE_URL, supabase_key=SUPABASE_KEY)

@app.route("/chat")
@login_required
def chat():
    return render_template("chat.html",
        user=session.get("user", {}),
        profile=session.get("profile", {}),
        supabase_url=SUPABASE_URL, supabase_key=SUPABASE_KEY)

@app.route("/fun")
@login_required
def fun():
    return render_template("fun.html",
        user=session.get("user", {}),
        profile=session.get("profile", {}),
        supabase_url=SUPABASE_URL, supabase_key=SUPABASE_KEY)

@app.route("/settings")
@login_required
def settings():
    return render_template("settings.html",
        user=session.get("user", {}),
        profile=session.get("profile", {}),
        supabase_url=SUPABASE_URL, supabase_key=SUPABASE_KEY)

@app.route("/auth")
def auth_page():
    if "access_token" in session:
        return redirect(url_for("dashboard"))
    return render_template("auth.html")

# ─── Auth API ─────────────────────────────────────────────────────────────────

@app.route("/api/signup", methods=["POST"])
def signup():
    data = request.json
    result, code = sb_auth("signup", {
        "email": data["email"],
        "password": data["password"],
        "data": {"full_name": data.get("name", "")}
    })
    if code in (200, 201) and "access_token" in result:
        _save_session(result)
        return jsonify({"ok": True})
    return jsonify({"ok": False, "error": result.get("error_description") or result.get("msg", "Signup failed")}), 400

@app.route("/api/login", methods=["POST"])
def login():
    data = request.json
    result, code = sb_auth("token?grant_type=password", {
        "email": data["email"],
        "password": data["password"]
    })
    if code == 200 and "access_token" in result:
        _save_session(result)
        return jsonify({"ok": True})
    return jsonify({"ok": False, "error": result.get("error_description", "Invalid credentials")}), 401

@app.route("/api/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"ok": True})

@app.route("/api/reset-password", methods=["POST"])
def reset_password():
    data = request.json
    result, code = sb_auth("recover", {"email": data["email"]})
    return jsonify({"ok": code < 300})

def _save_session(auth_result):
    session["access_token"] = auth_result["access_token"]
    session["user"] = auth_result.get("user", {})
    session["profile"] = {}
    # Fetch profile
    uid = auth_result["user"]["id"]
    profile_data, _ = sb_query("profiles", auth_result["access_token"],
                                params={"id": f"eq.{uid}", "select": "*"})
    if isinstance(profile_data, list) and profile_data:
        session["profile"] = profile_data[0]

# ─── Profile API ─────────────────────────────────────────────────────────────

@app.route("/api/profile", methods=["GET"])
@login_required
def get_profile():
    uid  = session["user"]["id"]
    tok  = session["access_token"]
    data, _ = sb_query("profiles", tok, params={"id": f"eq.{uid}", "select": "*"})
    return jsonify(data[0] if isinstance(data, list) and data else {})

@app.route("/api/profile", methods=["PATCH"])
@login_required
def update_profile():
    uid  = session["user"]["id"]
    tok  = session["access_token"]
    payload = request.json
    result, _ = sb_query("profiles", tok, method="PATCH", payload=payload, match={"id": uid})
    if isinstance(result, list) and result:
        session["profile"] = result[0]
    return jsonify(result[0] if isinstance(result, list) and result else {})

# ─── Incomes API ──────────────────────────────────────────────────────────────

@app.route("/api/incomes", methods=["GET"])
@login_required
def get_incomes():
    uid   = session["user"]["id"]
    tok   = session["access_token"]
    month = request.args.get("month", datetime.now().strftime("%Y-%m"))
    year, mon = month.split("-")
    data, _ = sb_query("incomes", tok, params={
        "user_id": f"eq.{uid}",
        "date":    f"gte.{year}-{mon}-01",
        "select":  "*",
        "order":   "date.desc"
    })
    # Filter to month end  
    end_day = "31"
    result = [r for r in (data if isinstance(data, list) else [])
              if r.get("date", "") <= f"{year}-{mon}-{end_day}"]
    return jsonify(result)

@app.route("/api/incomes", methods=["POST"])
@login_required
def add_income():
    tok  = session["access_token"]
    uid  = session["user"]["id"]
    body = {**request.json, "user_id": uid}
    result, code = sb_query("incomes", tok, method="POST", payload=body)
    return jsonify(result[0] if isinstance(result, list) else result), code

@app.route("/api/incomes/<id>", methods=["PATCH"])
@login_required
def update_income(id):
    tok    = session["access_token"]
    result, code = sb_query("incomes", tok, method="PATCH", payload=request.json, match={"id": id})
    return jsonify(result[0] if isinstance(result, list) else result), code

@app.route("/api/incomes/<id>", methods=["DELETE"])
@login_required
def delete_income(id):
    tok = session["access_token"]
    sb_query("incomes", tok, method="DELETE", match={"id": id})
    return jsonify({"ok": True})

# ─── Expenses API ─────────────────────────────────────────────────────────────

@app.route("/api/expenses", methods=["GET"])
@login_required
def get_expenses():
    uid   = session["user"]["id"]
    tok   = session["access_token"]
    month = request.args.get("month", datetime.now().strftime("%Y-%m"))
    year, mon = month.split("-")
    data, _ = sb_query("expenses", tok, params={
        "user_id": f"eq.{uid}",
        "date":    f"gte.{year}-{mon}-01",
        "select":  "*",
        "order":   "date.desc"
    })
    result = [r for r in (data if isinstance(data, list) else [])
              if r.get("date", "") <= f"{year}-{mon}-31"]
    return jsonify(result)

@app.route("/api/expenses", methods=["POST"])
@login_required
def add_expense():
    tok  = session["access_token"]
    uid  = session["user"]["id"]
    body = {**request.json, "user_id": uid}
    result, code = sb_query("expenses", tok, method="POST", payload=body)
    return jsonify(result[0] if isinstance(result, list) else result), code

@app.route("/api/expenses/<id>", methods=["PATCH"])
@login_required
def update_expense(id):
    tok    = session["access_token"]
    result, code = sb_query("expenses", tok, method="PATCH", payload=request.json, match={"id": id})
    return jsonify(result[0] if isinstance(result, list) else result), code

@app.route("/api/expenses/<id>", methods=["DELETE"])
@login_required
def delete_expense(id):
    tok = session["access_token"]
    sb_query("expenses", tok, method="DELETE", match={"id": id})
    return jsonify({"ok": True})

# ─── Savings Goals API ────────────────────────────────────────────────────────

@app.route("/api/goals", methods=["GET"])
@login_required
def get_goals():
    uid   = session["user"]["id"]
    tok   = session["access_token"]
    month = request.args.get("month", datetime.now().strftime("%Y-%m"))
    data, _ = sb_query("savings_goals", tok, params={
        "user_id": f"eq.{uid}", "month": f"eq.{month}", "select": "*"
    })
    return jsonify(data[0] if isinstance(data, list) and data else None)

@app.route("/api/goals", methods=["POST"])
@login_required
def upsert_goal():
    tok  = session["access_token"]
    uid  = session["user"]["id"]
    body = {**request.json, "user_id": uid}
    # Try delete + insert for upsert
    sb_query("savings_goals", tok, method="DELETE",
             match={"user_id": uid, "month": body["month"]})
    result, code = sb_query("savings_goals", tok, method="POST", payload=body)
    return jsonify(result[0] if isinstance(result, list) else result), code

# ─── Game Scores API ──────────────────────────────────────────────────────────

@app.route("/api/scores", methods=["POST"])
@login_required
def add_score():
    tok  = session["access_token"]
    uid  = session["user"]["id"]
    body = {**request.json, "user_id": uid}
    result, code = sb_query("game_scores", tok, method="POST", payload=body)
    return jsonify(result[0] if isinstance(result, list) else result), code

@app.route("/api/scores/leaderboard/<game>")
@login_required
def leaderboard(game):
    tok  = session["access_token"]
    data, _ = sb_query("game_scores", tok, params={
        "game_name": f"eq.{game}",
        "select":    "*, profiles(full_name)",
        "order":     "score.desc",
        "limit":     "10"
    })
    return jsonify(data if isinstance(data, list) else [])

# ─── AI Chat API ──────────────────────────────────────────────────────────────

@app.route("/api/chat", methods=["POST"])
@login_required
def ai_chat():
    body      = request.json
    messages  = body.get("messages", [])
    mode      = body.get("mode", "coach")
    user_data = body.get("userData", {})

    system_prompts = {
        "coach": f"""You are a friendly financial coach for college students. 
Give practical, actionable budgeting advice. Use emojis and short paragraphs.
Student data this month: Income ₹{user_data.get('income',0)}, Expenses ₹{user_data.get('expenses',0)}, Balance ₹{user_data.get('balance',0)}.
Survival days: {user_data.get('survivalDays',0)}. Daily safe limit: ₹{user_data.get('dailyLimit',0)}.""",
        "assistant": f"""You are an expense assistant. Answer questions about the student's data accurately.
Data: Income ₹{user_data.get('income',0)}, Expenses ₹{user_data.get('expenses',0)}, Balance ₹{user_data.get('balance',0)}.
Top categories: {user_data.get('topCategories','N/A')}. Survival days: {user_data.get('survivalDays',0)}.""",
        "fun": "You are a fun, upbeat companion for students. Mix financial wisdom with humour and motivation. Keep it light!"
    }

    if not OPENAI_KEY:
        # Smart demo responses
        last = messages[-1]["content"].lower() if messages else ""
        if any(w in last for w in ["spend","expense","much"]):
            reply = f"📊 Based on your data, your balance is ₹{user_data.get('balance',0):.0f}. You've spent ₹{user_data.get('expenses',0):.0f} this month across {len(user_data.get('topCategories','').split(','))} categories. Try to keep daily spending under ₹{user_data.get('dailyLimit',0):.0f}!"
        elif any(w in last for w in ["save","budget","tip"]):
            reply = "💡 **Top savings tips:**\n\n1. Cook at home 3× a week\n2. Use student discounts everywhere\n3. Transfer savings on payday first\n4. Cancel subscriptions you forgot about\n5. Buy second-hand textbooks"
        elif any(w in last for w in ["joke","fun","haha"]):
            reply = "Why did the student break up with their bank account? Too many 'insufficient funds' messages! 😂\n\nSeriously though — small daily savings add up to big freedom."
        elif any(w in last for w in ["motivat","help","stress"]):
            reply = "You're already ahead of 90% of students just by TRACKING your money! 🌟 Financial awareness is the first step to financial freedom. Keep going!"
        else:
            reply = "I'm your AI financial companion! Ask me about your spending patterns, get budgeting tips, or just chat. I'm here to help you master student finances! 🎓💰"
        return jsonify({"reply": reply})

    try:
        all_msgs = [{"role": "system", "content": system_prompts.get(mode, system_prompts["coach"])}]
        all_msgs += [{"role": m["role"], "content": m["content"]} for m in messages[-10:]]

        r = requests.post("https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {OPENAI_KEY}", "Content-Type": "application/json"},
            json={"model": "gpt-3.5-turbo", "messages": all_msgs, "max_tokens": 500, "temperature": 0.7},
            timeout=20)
        data = r.json()
        reply = data["choices"][0]["message"]["content"]
        return jsonify({"reply": reply})
    except Exception as e:
        return jsonify({"reply": f"Sorry, AI is taking a break! Error: {str(e)}"}), 500

# ─── Analytics helper ─────────────────────────────────────────────────────────

@app.route("/api/analytics/range")
@login_required
def analytics_range():
    uid   = session["user"]["id"]
    tok   = session["access_token"]
    start = request.args.get("start")
    end   = request.args.get("end")
    data, _ = sb_query("expenses", tok, params={
        "user_id": f"eq.{uid}",
        "date":    f"gte.{start}",
        "select":  "*",
        "order":   "date.asc"
    })
    if isinstance(data, list):
        data = [r for r in data if r.get("date", "") <= end]
    return jsonify(data if isinstance(data, list) else [])

# ─── Run ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    app.run(debug=True, port=5000, host="0.0.0.0")
