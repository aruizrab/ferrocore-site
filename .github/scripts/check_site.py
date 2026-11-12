#!/usr/bin/env python3
"""Pre-deploy checks for the static site. Standard library only.

1. progress.json parses and follows schema 1.
2. Every local href/src in index.html points at a file in the repo, and no
   URL is root-absolute (the site is served under /<repo>/).
3. No e-mail addresses, links to the private ferrocore repository or absolute
   filesystem paths in the published text files.
"""
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
# Keep in sync with STAGES in js/progress.js and with the stage ladder of the
# progress feed in ferrocore's CI.
STAGES = {"merged", "implemented", "implementing", "tests", "planned", "spec-approved", "spec-draft", "not-started"}
errors = []


def check_progress():
    path = ROOT / "progress.json"
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        errors.append(f"progress.json: {exc}")
        return
    if data.get("schema") != 1:
        errors.append("progress.json: schema must be 1")
    if not isinstance(data.get("placeholder"), bool):
        errors.append("progress.json: placeholder must be a boolean")
    if not re.fullmatch(r"[0-9a-f]{7,40}", str(data.get("commit", ""))):
        errors.append("progress.json: commit must be a hex sha")
    for key in ("generatedAt", "method"):
        if not isinstance(data.get(key), str) or not data[key]:
            errors.append(f"progress.json: {key} must be a non-empty string")

    def pct(where, v):
        if not isinstance(v, (int, float)) or not 0 <= v <= 100:
            errors.append(f"progress.json: {where} percent out of range: {v!r}")

    pct("overall", data.get("overall"))
    ms_ids = set()
    for m in data.get("milestones", []):
        ms_ids.add(m.get("id"))
        pct(m.get("id"), m.get("percent"))
        count = m.get("features")
        if isinstance(count, bool) or not isinstance(count, int) or count < 0:
            errors.append(f"progress.json: {m.get('id')} features must be a non-negative integer count, got {count!r}")
    if not ms_ids:
        errors.append("progress.json: milestones must not be empty")
    for f in data.get("features", []):
        fid = f.get("id")
        pct(fid, f.get("percent"))
        if f.get("stage") not in STAGES:
            errors.append(f"progress.json: {fid} has unknown stage {f.get('stage')!r}")
        if f.get("milestone") not in ms_ids:
            errors.append(f"progress.json: {fid} references unknown milestone {f.get('milestone')!r}")


class Refs(HTMLParser):
    def __init__(self):
        super().__init__()
        self.refs = []

    def handle_starttag(self, tag, attrs):
        for name, value in attrs:
            if name in ("href", "src") and value:
                self.refs.append(value)


def check_refs():
    parser = Refs()
    parser.feed((ROOT / "index.html").read_text(encoding="utf-8"))
    for ref in parser.refs:
        if re.match(r"^(https?:|mailto:|#|data:)", ref):
            if ref.startswith("mailto:"):
                errors.append(f"index.html: mailto link not allowed: {ref}")
            continue
        if ref.startswith("/"):
            errors.append(f"index.html: root-absolute URL breaks under /<repo>/: {ref}")
            continue
        target = ROOT / ref.split("#")[0].split("?")[0]
        if not target.is_file():
            errors.append(f"index.html: missing file for {ref}")


LEAKS = [
    ("e-mail address", re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z0-9.-]*[A-Za-z]")),
    # The ferrocore source repository is private; only ferrocore-site may be linked.
    ("link to the private repository", re.compile(r"github\.com[/:]aruizrab/ferrocore(?![-\w])", re.IGNORECASE)),
    ("absolute filesystem path", re.compile(r"(?<![\w.:/])(?:/home/|/Users/|/mnt/[a-z]/|/tmp/|[A-Za-z]:\\(?:Users|Windows)\\)")),
]


def check_no_leaks():
    for path in ROOT.rglob("*"):
        if ".git" in path.parts or not path.is_file():
            continue
        if path.suffix not in {".html", ".css", ".js", ".json", ".svg", ".md", ".txt"}:
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        for what, pattern in LEAKS:
            for match in pattern.findall(text):
                errors.append(f"{path.relative_to(ROOT)}: {what} found: {match}")


check_progress()
check_refs()
check_no_leaks()
if errors:
    print("\n".join(errors))
    sys.exit(1)
print("site checks passed")
