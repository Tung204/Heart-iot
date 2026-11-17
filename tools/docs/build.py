"""Build the offline Vietnamese documentation from repository Markdown sources."""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import quote, unquote, urlsplit

import markdown
from markdown.extensions.toc import slugify


ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
OUTPUT = ROOT / "docs/html/index.html"
CHAPTERS = [
    ("01", "tong-quan", "docs/01-tong-quan-va-y-tuong.md", "Tổng quan và ý tưởng"),
    ("02", "yeu-cau", "docs/02-yeu-cau-va-pham-vi.md", "Yêu cầu và phạm vi"),
    ("03", "kien-truc", "docs/03-kien-truc-he-thong.md", "Kiến trúc hệ thống"),
    ("04", "du-lieu", "docs/04-du-lieu-va-giao-tiep.md", "Dữ liệu và giao tiếp"),
    ("05", "phan-cung", "docs/05-phan-cung-va-firmware.md", "Phần cứng và firmware"),
    ("06", "giao-dien", "docs/06-trai-nghiem-va-man-hinh.md", "Trải nghiệm và màn hình"),
    ("07", "tro-ly-ai", "docs/07-tro-ly-ai.md", "Trợ lý AI"),
    ("08", "kiem-thu", "docs/08-kiem-thu-va-danh-gia.md", "Kiểm thử và đánh giá"),
    ("09", "lo-trinh", "docs/09-lo-trinh-va-ho-so.md", "Lộ trình và hồ sơ"),
    ("10", "nguon", "docs/10-nguon-va-cau-hoi-mo.md", "Nguồn và câu hỏi mở"),
    ("11", "nen-tang-ai", "docs/11-nen-tang-ai-va-cau-hinh-dong.md", "Nền tảng AI và cấu hình động"),
    ("12", "nguyen-tac-phat-trien", "docs/12-nguyen-tac-phat-trien-va-bang-chung.md", "Nguyên tắc phát triển và bằng chứng"),
    ("13", "thuc-thi-ai", "docs/13-dac-ta-thuc-thi-ai-va-cau-hinh.md", "Thực thi AI và cấu hình động"),
    ("14", "ke-hoach-trien-khai", "docs/14-ke-hoach-trien-khai-phan-mem.md", "Kế hoạch triển khai và trạng thái"),
    ("R", "review", "docs/reviews/01-thiet-ke-v0.1.md", "Review thiết kế v0.1"),
    ("R2", "review-ai", "docs/reviews/02-nen-tang-ai-va-cau-hinh-dong.md", "Review nền tảng AI"),
    ("A", "quyet-dinh", "docs/decisions/0001-dinh-huong-prototype.md", "Quyết định kiến trúc"),
    ("A2", "quyet-dinh-nen-tang", "docs/decisions/0002-nen-tang-trien-khai.md", "Quyết định nền tảng triển khai"),
    ("A3", "quyet-dinh-tro-ly", "docs/decisions/0003-tro-ly-la-trung-tam.md", "Quyết định trợ lý là trung tâm"),
    ("A4", "quyet-dinh-giao-dien-v4", "docs/decisions/0004-giao-dien-don-gian-v4.md", "Quyết định giao diện đơn giản v4"),
]
MODULES = [
    ("web", "apps/web/README.md", "apps/web — Giao diện web"),
    ("api", "apps/api/README.md", "apps/api — Backend"),
    ("firmware", "firmware/README.md", "firmware — Chương trình thiết bị"),
    ("hardware", "hardware/README.md", "hardware — Hồ sơ phần cứng"),
    ("infra", "infra/README.md", "infra — Hạ tầng"),
    ("simulator", "tools/simulator/README.md", "tools/simulator — Mô phỏng"),
    ("tests", "tests/README.md", "tests — Kiểm thử"),
    ("data", "data/README.md", "data — Dữ liệu"),
    ("reports", "reports/README.md", "reports — Báo cáo"),
]
PAYLOADS = [
    ("telemetry", "telemetry.v1.json", "Telemetry — nhịp tim và bước chân"),
    ("confirmed", "fall-confirmed.v1.json", "Confirmed — thiết bị xác nhận sự kiện"),
    ("ack", "event-ack.v1.json", "Application ACK — xác nhận đã lưu"),
    ("quarantine", "event-ack-quarantined.v1.json", "ACK — sự kiện bị cách ly"),
    ("insights", "insights.v1.json", "Insights — xu hướng nhiều ngày"),
]
ROUTES = {path: section for _, section, path, _ in CHAPTERS}
ROUTES.update({path: f"cau-truc-{key}" for key, path, _ in MODULES})
ROUTES.update({
    "README.md": "cau-truc",
    "docs/README.md": "mo-dau",
    "packages/contracts/README.md": "payload",
    "docs/html/index.html": "mo-dau",
})
ROUTES.update({f"packages/contracts/examples/{name}": f"payload-{key}" for key, name, _ in PAYLOADS})
SOURCES: dict[str, str] = {}


def read(path: str) -> str:
    value = (ROOT / path).read_text(encoding="utf-8")
    SOURCES[path] = hashlib.sha256(value.encode("utf-8")).hexdigest()
    return value


def source_href(path: str) -> str:
    return "../../" + quote(path, safe="/")


def local_link(target: str, source: str) -> str:
    url = urlsplit(html.unescape(target))
    if url.scheme or url.netloc or not url.path:
        return target
    resolved = ((ROOT / source).parent / unquote(url.path)).resolve()
    relative = resolved.relative_to(ROOT).as_posix()
    if relative in ROUTES:
        anchor = ROUTES[relative]
        if url.fragment:
            anchor += "-" + url.fragment
        return "#" + anchor
    return html.escape(source_href(relative) + ("#" + url.fragment if url.fragment else ""), quote=True)


def relation_diagram(source: str) -> str:
    """Render the three Mermaid subsets used by these docs as offline HTML flows.

    Unknown syntax fails the build, preventing a silently incomplete diagram.
    Every relationship is generated from the Markdown, not a second model.
    """
    lines = [line.strip() for line in source.strip().splitlines() if line.strip()]
    kind = lines.pop(0)
    rows: list[tuple[str, str, str]] = []
    if kind == "flowchart LR":
        labels: dict[str, str] = {}

        def node(expression: str) -> str:
            match = re.fullmatch(r'(\w+)(?:\[\(?"([^"]+)"\)?\])?', expression)
            if not match:
                raise ValueError(f"Unsupported flowchart node: {expression}")
            key, label = match.groups()
            if label:
                labels[key] = label
            return key

        edges = []
        for line in lines:
            match = re.fullmatch(r'(.+?)\s+-->(?:\|"([^"]+)"\|)?\s+(.+)', line)
            if not match:
                raise ValueError(f"Unsupported flowchart relationship: {line}")
            left, label, right = match.groups()
            edges.append((node(left), label or "", node(right)))
        rows = [(labels.get(left, left), label, labels.get(right, right)) for left, label, right in edges]
        caption = "Kiến trúc — thành phần và hướng giao tiếp"
    elif kind == "stateDiagram-v2":
        for line in lines:
            match = re.fullmatch(r'(\[\*\]|\w+)\s+-->\s+(\[\*\]|\w+)(?::\s*(.+))?', line)
            if not match:
                raise ValueError(f"Unsupported state transition: {line}")
            left, right, label = match.groups()
            rows.append(("Bắt đầu" if left == "[*]" else left, label or "", "Kết thúc" if right == "[*]" else right))
        caption = "Vòng đời incident — các chuyển trạng thái"
    elif kind == "erDiagram":
        for line in lines:
            match = re.fullmatch(r'(\w+)\s+\|\|--o\{\s+(\w+)\s*:\s*(\w+)', line)
            if not match:
                raise ValueError(f"Unsupported entity relationship: {line}")
            left, right, label = match.groups()
            rows.append((left, f"1 → 0..n · {label}", right))
        caption = "Quan hệ dữ liệu — một tới không hoặc nhiều bản ghi"
    else:
        raise ValueError(f"Unsupported Mermaid diagram type: {kind}")

    items = "".join(
        f'<li><span class="relation-node">{html.escape(left)}</span>'
        f'<span class="relation-edge">{html.escape(label)}<b aria-hidden="true">→</b>'
        f'<span class="sr-only"> tới </span></span><span class="relation-node">{html.escape(right)}</span></li>'
        for left, label, right in rows
    )
    return (
        f'<figure class="relationship-figure"><figcaption>{caption}</figcaption>'
        f'<ul class="relationships">{items}</ul>'
        f'<details><summary>Xem mã sơ đồ Mermaid gốc</summary><pre><code>{html.escape(source.strip())}</code></pre></details></figure>'
    )


def render_source(path: str, prefix: str) -> tuple[str, str]:
    source = re.sub(r"\A# [^\n]+\n", "", read(path), count=1)
    renderer = markdown.Markdown(
        extensions=["tables", "fenced_code", "toc", "sane_lists"],
        extension_configs={"toc": {"slugify": lambda value, sep: prefix + "-" + slugify(value.replace("đ", "d").replace("Đ", "D"), sep)}},
    )
    content = renderer.convert(source)
    content = re.sub(r'<pre><code class="language-mermaid">(.*?)</code></pre>', lambda m: relation_diagram(html.unescape(m[1])), content, flags=re.S)
    content = re.sub(r'<a href="([^"]+)"', lambda m: '<a href="' + local_link(m[1], path) + '"', content)
    content = re.sub(r'<(/?)h([1-5])\b', lambda m: f'<{m[1]}h{int(m[2]) + 1}', content)
    content = re.sub(r'<table>(.*?)</table>', r'<div class="table-wrap" tabindex="0" role="region" aria-label="Bảng dữ liệu có thể cuộn ngang"><table>\1</table></div>', content, flags=re.S)
    toc = "".join(f'<a href="#{item["id"]}">{html.escape(item["name"])}</a>' for item in renderer.toc_tokens)
    return content, toc


def section_html(number: str, key: str, title: str, path: str, body: str, toc: str = "") -> str:
    warning = ""
    if key in {"kien-truc", "du-lieu", "phan-cung", "tro-ly-ai", "kiem-thu"}:
        warning = '<div class="related-review">Đặc tả này có điểm cần làm rõ sau review. <a href="#review">Đọc các phát hiện và hướng sửa</a> trước khi triển khai.</div>'
    return (
        f'<section id="{key}" class="chapter{ " chapter-review" if key == "review" else ""}" data-nav="{key}" aria-labelledby="{key}-title">'
        f'<header class="chapter-header"><span class="chapter-number">{number}</span><div><h2 id="{key}-title">{html.escape(title)}</h2>'
        f'<p>Bản đề xuất · <a href="{source_href(path)}">Xem nguồn Markdown</a></p></div></header>'
        f'{warning}' + (f'<nav class="chapter-toc" aria-label="Trong phần {html.escape(title)}">{toc}</nav>' if toc else "") +
        f'<div class="prose">{body}</div></section>'
    )


class LinkAudit(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.ids: set[str] = set()
        self.links: list[str] = []
        self.errors: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if values.get("id"):
            value = values["id"]
            if value in self.ids:
                self.errors.append(f"Duplicate ID: {value}")
            self.ids.add(value)
        if tag == "a" and values.get("href"):
            self.links.append(values["href"])

    def validate(self) -> None:
        for target in self.links:
            url = urlsplit(target)
            if url.scheme or url.netloc:
                continue
            if not url.path:
                if unquote(url.fragment) not in self.ids:
                    self.errors.append(f"Missing fragment: {target}")
            elif not (OUTPUT.parent / unquote(url.path)).resolve().exists():
                self.errors.append(f"Missing local file: {target}")
        if self.errors:
            raise ValueError("\n".join(self.errors))


def build() -> str:
    sections = []
    for number, key, path, title in CHAPTERS:
        content, toc = render_source(path, key)
        sections.append(section_html(number, key, title, path, content, toc))

    content, toc = render_source("README.md", "cau-truc")
    for key, path, title in MODULES:
        content += f'<h3 id="cau-truc-{key}">{html.escape(title)}</h3>'
        rendered, _ = render_source(path, f"cau-truc-{key}")
        content += rendered
    sections.append(section_html("B", "cau-truc", "Cấu trúc dự án và trách nhiệm", "README.md", content, toc))

    content, _ = render_source("packages/contracts/README.md", "payload")
    for key, name, title in PAYLOADS:
        path = f"packages/contracts/examples/{name}"
        value = read(path)
        json.loads(value)
        content += f'<h3 id="payload-{key}">{html.escape(title)}</h3><p><a href="{source_href(path)}">Mở {name}</a></p><pre><code class="language-json">{html.escape(value.strip())}</code></pre>'
    sections.append(section_html("C", "payload", "Payload JSON minh họa", "packages/contracts/README.md", content))

    nav = lambda items: "".join(f'<a href="#{key}"><span class="nav-number">{number}</span><span>{html.escape(title)}</span></a>' for number, key, _, title in items)
    replacements = {
        "STYLE": read("tools/docs/style.css"),
        "SCRIPT": read("tools/docs/app.js"),
        "NAV_MAIN": nav([chapter for chapter in CHAPTERS if chapter[0].isdecimal()]),
        "NAV_EXTRA": nav([chapter for chapter in CHAPTERS if not chapter[0].isdecimal()] + [("B", "cau-truc", "", "Cấu trúc dự án"), ("C", "payload", "", "Payload minh họa")]),
        "CONTENT": "\n".join(sections),
    }
    result = read("tools/docs/template.html")
    for key, value in replacements.items():
        result = result.replace(f"@@{key}@@", value)
    # Fingerprint the sources without a build timestamp so --check is deterministic.
    read("tools/docs/build.py")
    read("tools/docs/requirements.txt")
    fingerprint = hashlib.sha256(json.dumps(SOURCES, sort_keys=True).encode("utf-8")).hexdigest()
    result = result.replace("<!doctype html>", f'<!doctype html>\n<!-- Generated by tools/docs/build.py; source digest: {fingerprint}. Do not edit generated content. -->', 1)
    audit = LinkAudit()
    audit.feed(result)
    audit.validate()
    print(f"Validated {len(audit.links)} links and {len(audit.ids)} unique IDs; {len(sections)} sections.")
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Validate sources and fail if generated HTML is stale; do not write files.")
    args = parser.parse_args()
    result = build()
    if args.check:
        if not OUTPUT.exists() or OUTPUT.read_text(encoding="utf-8") != result:
            print("HTML is missing or stale. Run tools/docs/build.py.", file=sys.stderr)
            return 1
        print("Generated HTML matches current sources.")
    else:
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT.write_text(result, encoding="utf-8", newline="\n")
        print(f"Wrote {OUTPUT.relative_to(ROOT)} ({len(result.encode('utf-8')):,} bytes).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
