#!/usr/bin/env python3
"""Pre-deploy checks for the static site. Standard library only.

1. progress.json parses and follows schema 1.
2. Every local href/src in index.html points at a file in the repo, and no
   URL is root-absolute (the site is served under /<repo>/).
3. No e-mail addresses in the published text files.
"""
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
STAGES = {"merged", "implementing", "tests", "planned", "spec-approved", "spec-draft", "not-started"}
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


def check_no_emails():
    pattern = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z0-9.-]*[A-Za-z]")
    for path in ROOT.rglob("*"):
        if ".git" in path.parts or not path.is_file():
            continue
        if path.suffix not in {".html", ".css", ".js", ".json", ".svg", ".md", ".txt"}:
            continue
        for match in pattern.findall(path.read_text(encoding="utf-8", errors="ignore")):
            errors.append(f"{path.relative_to(ROOT)}: e-mail address found: {match}")


check_progress()
check_refs()
check_no_emails()
if errors:
    print("\n".join(errors))
    sys.exit(1)
print("site checks passed")
