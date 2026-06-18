#!/usr/bin/env python3
import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request


PRIMARY_LABELS = {"bug", "enhancement", "documentation", "question"}
NEEDS_LABELS = {"needs-info", "needs-repro", "needs-logs"}
AREA_LABELS = {
    "area:api",
    "area:management",
    "area:auth",
    "area:billing",
    "area:deployment",
    "area:model-routing",
    "area:docs",
}
SPECIAL_LABELS = {"security", "ui", "performance", "triaged"}
MANAGED_LABELS = PRIMARY_LABELS | NEEDS_LABELS | AREA_LABELS | SPECIAL_LABELS
SYNCED_LABELS = PRIMARY_LABELS | NEEDS_LABELS | AREA_LABELS

LABEL_DEFS = {
    "bug": ("Something isn't working", "d73a4a"),
    "enhancement": ("New feature or request", "0075ca"),
    "documentation": ("Improvements or additions to documentation", "0075ca"),
    "question": ("Further information is requested", "d876e3"),
    "security": ("Security-sensitive report or hardening", "b60205"),
    "ui": ("UI and UX improvements", "fbca04"),
    "performance": ("Performance or latency issues", "5319e7"),
    "needs-info": ("More information is needed from the reporter", "ededed"),
    "needs-repro": ("Reproduction steps are needed", "ededed"),
    "needs-logs": ("Sanitized logs or request details are needed", "ededed"),
    "triaged": ("Reviewed by the issue triage agent", "0e8a16"),
    "area:api": ("Request forwarding and API compatibility", "c5def5"),
    "area:management": ("Management panel and management API", "c5def5"),
    "area:auth": ("Auth files, OAuth accounts, keys, and permissions", "c5def5"),
    "area:billing": ("Usage logs, billing, quotas, and statistics", "c5def5"),
    "area:deployment": ("Deployment, Docker, reverse proxy, and operations", "c5def5"),
    "area:model-routing": ("Models, routing, channel groups, and fallback", "c5def5"),
    "area:docs": ("Documentation", "c5def5"),
}

COMMENT_MARKER = "<!-- issue-triage-agent -->"


def redact_text(text):
    if not text:
        return ""
    replacements = [
        (r"(?i)(authorization\s*:\s*bearer\s+)[^\s`]+", r"\1[REDACTED]"),
        (r"(?i)((?:api[-_ ]?key|x-api-key|token|secret|password|cookie)\s*[:=]\s*)[^\s`,;]+", r"\1[REDACTED]"),
        (r"cli-proxy-api-default-auto-created-sk-[A-Za-z0-9_\-]+", "cli-proxy-api-default-auto-created-sk-[REDACTED]"),
        (r"sk-[A-Za-z0-9_\-]{8,}", "sk-[REDACTED]"),
        (r"github_pat_[A-Za-z0-9_]+", "github_pat_[REDACTED]"),
        (r"gh[pousr]_[A-Za-z0-9_]{20,}", "ghx_[REDACTED]"),
        (r"\b[A-Za-z0-9_\-]{48,}\b", "[REDACTED_LONG_TOKEN]"),
    ]
    redacted = text
    for pattern, repl in replacements:
        redacted = re.sub(pattern, repl, redacted)
    return redacted


def compact(text, limit):
    text = redact_text(text or "").strip()
    if len(text) <= limit:
        return text
    return text[:limit].rsplit("\n", 1)[0] + "\n...[truncated]"


def github_request(method, path, token, data=None):
    url = f"https://api.github.com{path}"
    body = None if data is None else json.dumps(data).encode()
    request = urllib.request.Request(url, data=body, method=method)
    request.add_header("Accept", "application/vnd.github+json")
    request.add_header("X-GitHub-Api-Version", "2022-11-28")
    request.add_header("Authorization", f"Bearer {token}")
    if data is not None:
        request.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read().decode()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        if exc.code in {404, 422}:
            return None
        detail = exc.read().decode(errors="replace")
        raise RuntimeError(f"GitHub API {method} {path} failed: {exc.code} {detail}") from exc


def load_event():
    event_path = os.environ.get("GITHUB_EVENT_PATH")
    if not event_path:
        raise RuntimeError("GITHUB_EVENT_PATH is not set")
    with open(event_path, encoding="utf-8") as handle:
        return json.load(handle)


def get_issue(event, event_name, repo, token):
    if event_name == "workflow_dispatch":
        number = os.environ.get("TRIAGE_ISSUE_NUMBER") or event.get("inputs", {}).get("issue_number")
        if not number:
            raise RuntimeError("workflow_dispatch requires issue_number")
        issue = github_request("GET", f"/repos/{repo}/issues/{number}", token)
        return issue, None

    issue = event.get("issue")
    if not issue:
        raise RuntimeError(f"No issue payload for {event_name}")
    if issue.get("pull_request"):
        print("Skipping pull request issue payload.")
        return None, None
    return issue, event.get("comment")


def fetch_comments(repo, issue_number, token):
    comments = github_request(
        "GET",
        f"/repos/{repo}/issues/{issue_number}/comments?per_page=100",
        token,
    )
    return comments or []


def ensure_labels(repo, token):
    for name, (description, color) in LABEL_DEFS.items():
        github_request(
            "POST",
            f"/repos/{repo}/labels",
            token,
            {"name": name, "description": description, "color": color},
        )


def sync_issue_labels(repo, issue, token, desired_labels):
    current = {label["name"] for label in issue.get("labels", [])}
    desired = set(desired_labels) & MANAGED_LABELS
    desired.add("triaged")
    to_remove = sorted((current & SYNCED_LABELS) - (desired & SYNCED_LABELS))
    to_add = sorted(desired - current)

    if to_add:
        github_request(
            "POST",
            f"/repos/{repo}/issues/{issue['number']}/labels",
            token,
            {"labels": to_add},
        )

    for label in to_remove:
        github_request(
            "DELETE",
            f"/repos/{repo}/issues/{issue['number']}/labels/{urllib.parse.quote(label, safe='')}",
            token,
        )

    return to_add, to_remove


def security_hint(text):
    terms = [
        "leak",
        "泄露",
        "security",
        "vulnerability",
        "漏洞",
        "token",
        "secret",
        "cookie",
        "api key",
        "apikey",
        "auth file",
        "未授权",
    ]
    lower = text.lower()
    return any(term in lower for term in terms)


def fallback_triage(issue, comments):
    text = f"{issue.get('title', '')}\n{issue.get('body', '')}"
    lower = text.lower()
    labels = []
    if security_hint(text):
        labels.append("security")
    if any(word in lower for word in ["docs", "documentation", "文档"]):
        primary = "documentation"
    elif any(word in lower for word in ["feature", "希望", "建议", "support", "add "]):
        primary = "enhancement"
    elif "?" in text or any(word in lower for word in ["how", "why", "请教", "怎么"]):
        primary = "question"
    else:
        primary = "bug"
    labels.append(primary)
    if primary == "bug" and len(issue.get("body") or "") < 300:
        labels.extend(["needs-info", "needs-repro"])
    if any(word in lower for word in ["ui", "界面", "页面", "布局"]):
        labels.append("ui")
        labels.append("area:management")
    if any(word in lower for word in ["slow", "卡", "latency", "performance"]):
        labels.append("performance")
    comment = (
        "已做初步分类。请补充最小复现步骤、版本信息和脱敏日志，这样维护者可以更快定位。"
        if re.search(r"[\u4e00-\u9fff]", text)
        else "Initial triage is done. Please add minimal reproduction steps, version details, and sanitized logs so maintainers can investigate faster."
    )
    return {"primary_label": primary, "labels": labels, "comment_required": True, "comment": comment}


def build_prompt(repo, event_name, issue, comments, source_comment):
    recent_comments = []
    for comment in comments[-8:]:
        user = comment.get("user", {}).get("login", "unknown")
        body = compact(comment.get("body"), 1200)
        if COMMENT_MARKER in body:
            continue
        recent_comments.append(f"{user}:\n{body}")

    payload = {
        "repo": repo,
        "event": event_name,
        "issue": {
            "number": issue.get("number"),
            "title": compact(issue.get("title"), 500),
            "body": compact(issue.get("body"), 9000),
            "labels": [label["name"] for label in issue.get("labels", [])],
            "author": issue.get("user", {}).get("login"),
        },
        "latest_comment": None
        if not source_comment
        else {
            "author": source_comment.get("user", {}).get("login"),
            "body": compact(source_comment.get("body"), 2500),
        },
        "recent_comments": recent_comments,
    }

    system = """
You are a senior maintainer triaging GitHub issues for CliRelay and codeProxy.
Return only JSON. No markdown fence.

Allowed JSON shape:
{
  "primary_label": "bug|enhancement|documentation|question",
  "labels": ["..."],
  "comment_required": true,
  "comment": "..."
}

Managed labels:
- Primary: bug, enhancement, documentation, question. Choose exactly one primary_label.
- State: needs-info, needs-repro, needs-logs, triaged.
- Special: security, ui, performance.
- Area: area:api, area:management, area:auth, area:billing, area:deployment, area:model-routing, area:docs.

Rules:
- Use the same language as the reporter when practical.
- No emoji. Do not say you are an AI.
- Do not close issues, promise fixes, assign people, or ask for private secrets.
- Never repeat API keys, tokens, cookies, auth files, private domains, or long log bodies.
- Add security for key leaks, auth bypass, exposed management panels, credential handling, SSRF, RCE, supply chain, or other security-sensitive reports.
- For public security reports, remind the reporter not to share secrets; if live credentials or exploit details are involved, suggest GitHub Security Advisory or a private maintainer channel.
- Add needs-repro when a bug lacks clear minimal reproduction steps.
- Add needs-logs when a runtime/API/deployment/billing bug lacks sanitized logs, request id, response error, or relevant screenshots.
- Add needs-info when versions, deployment mode, affected page/API/model, or expected/actual behavior are missing.
- For bug reports, include a concise investigation or likely fix direction if there is enough evidence.
- For feature requests, include a concise implementation direction and any obvious scope split.
- For questions, answer if possible; otherwise ask only for the missing facts.
- For issue_comment events, set comment_required=false unless a new reply would materially help.
""".strip()

    return system, json.dumps(payload, ensure_ascii=False, indent=2)


def call_model(system, user_payload):
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set")
    base_url = os.environ.get("OPENAI_BASE_URL", "https://relay.07230805.xyz/v1").rstrip("/")
    model = os.environ.get("OPENAI_MODEL", "deepseek-v4-flash")
    data = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user_payload},
        ],
        "temperature": 0.1,
        "max_tokens": 1200,
    }
    request = urllib.request.Request(
        f"{base_url}/chat/completions",
        data=json.dumps(data).encode(),
        method="POST",
    )
    request.add_header("Content-Type", "application/json")
    request.add_header("Authorization", f"Bearer {api_key}")
    with urllib.request.urlopen(request, timeout=90) as response:
        result = json.loads(response.read().decode())
    return result["choices"][0]["message"]["content"]


def extract_json(text):
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start == -1 or end == -1 or end <= start:
            raise
        return json.loads(text[start : end + 1])


def normalize_triage(raw, issue, comments):
    if not isinstance(raw, dict):
        return fallback_triage(issue, comments)

    primary = raw.get("primary_label")
    if primary not in PRIMARY_LABELS:
        primary = fallback_triage(issue, comments)["primary_label"]

    labels = [label for label in raw.get("labels", []) if label in MANAGED_LABELS]
    labels.append(primary)
    labels.append("triaged")
    if security_hint(f"{issue.get('title', '')}\n{issue.get('body', '')}"):
        labels.append("security")

    comment = str(raw.get("comment") or "").strip()
    comment = redact_text(comment)
    return {
        "primary_label": primary,
        "labels": sorted(set(labels)),
        "comment_required": bool(raw.get("comment_required", True)),
        "comment": comment,
    }


def comment_already_posted(comments, marker):
    return any(marker in (comment.get("body") or "") for comment in comments)


def upsert_comment(repo, issue, token, comments, body, event_name, source_comment):
    if not body.strip():
        return "skipped-empty"

    event_marker = ""
    if event_name == "issue_comment" and source_comment:
        event_marker = f"<!-- issue-triage-agent:event:{source_comment['id']} -->"
        if comment_already_posted(comments, event_marker):
            return "skipped-duplicate"

    full_body = f"{COMMENT_MARKER}\n{event_marker}\n{body.strip()}".strip()

    if event_name != "issue_comment":
        for comment in comments:
            if COMMENT_MARKER in (comment.get("body") or ""):
                github_request(
                    "PATCH",
                    f"/repos/{repo}/issues/comments/{comment['id']}",
                    token,
                    {"body": full_body},
                )
                return "updated"

    github_request(
        "POST",
        f"/repos/{repo}/issues/{issue['number']}/comments",
        token,
        {"body": full_body},
    )
    return "created"


def run():
    token = os.environ.get("GITHUB_TOKEN")
    repo = os.environ.get("GITHUB_REPOSITORY")
    event_name = os.environ.get("GITHUB_EVENT_NAME", "")
    if not token or not repo:
        raise RuntimeError("GITHUB_TOKEN and GITHUB_REPOSITORY are required")

    event = load_event()
    issue, source_comment = get_issue(event, event_name, repo, token)
    if not issue:
        return

    comments = fetch_comments(repo, issue["number"], token)
    system, user_payload = build_prompt(repo, event_name, issue, comments, source_comment)

    content = call_model(system, user_payload)
    try:
        raw = extract_json(content)
    except Exception as exc:
        print(f"Model returned invalid JSON, using fallback: {exc}", file=sys.stderr)
        raw = fallback_triage(issue, comments)

    triage = normalize_triage(raw, issue, comments)
    ensure_labels(repo, token)
    added, removed = sync_issue_labels(repo, issue, token, triage["labels"])
    print(f"labels_added={added}")
    print(f"labels_removed={removed}")

    should_comment = triage["comment_required"] or event_name in {"issues", "workflow_dispatch"}
    if should_comment:
        result = upsert_comment(repo, issue, token, comments, triage["comment"], event_name, source_comment)
        print(f"comment={result}")
    else:
        print("comment=skipped")


def self_test():
    sample = "Authorization: Bearer sk-abc1234567890 token=github_pat_abc123456789012345678901234567890"
    redacted = redact_text(sample)
    assert "abc1234567890" not in redacted
    assert "github_pat_abc" not in redacted
    parsed = extract_json("noise {\"primary_label\":\"bug\",\"labels\":[\"bug\"]} tail")
    assert parsed["primary_label"] == "bug"
    triage = normalize_triage(
        {"primary_label": "bug", "labels": ["area:api", "unknown"], "comment": "ok"},
        {"title": "Key 泄露", "body": "", "labels": []},
        [],
    )
    assert "security" in triage["labels"]
    assert "unknown" not in triage["labels"]


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        print("self-test ok")
    else:
        run()
