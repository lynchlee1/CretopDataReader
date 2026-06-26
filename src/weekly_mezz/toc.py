from __future__ import annotations

import re
from pathlib import Path

from lxml import html

TOC_HEADING_RE = re.compile(
    r"<h[1-6][^>]*\bid\s*=\s*['\"]toc_[^'\"]*['\"][^>]*>(?P<title>.*?)</h[1-6]>",
    re.IGNORECASE | re.DOTALL,
)
TAG_RE = re.compile(r"<[^>]+>")


def _clean_text(value) -> str:
    return " ".join(str(value or "").split())


def extract_toc_titles(html_path) -> list[str]:
    path = Path(html_path)
    if not path.exists():
        return []
    markup = path.read_bytes()
    markup_text = markup.decode("utf-8", errors="replace")
    titles = []
    for match in TOC_HEADING_RE.finditer(markup_text):
        title = _clean_text(TAG_RE.sub(" ", match.group("title")))
        if title and title not in titles:
            titles.append(title)
    if titles:
        return titles

    document = html.fromstring(markup, parser=html.HTMLParser(encoding="utf-8", recover=True, huge_tree=True))
    for node in document.xpath("//*[starts-with(@id, 'toc_')]"):
        title = _clean_text(" ".join(node.itertext()))
        if title and title not in titles:
            titles.append(title)
    return titles


def build_toc_combinations(reports: list[dict]) -> list[dict]:
    groups = {}
    for report in reports or []:
        html_path = report.get("html_path") or report.get("viewer_html_path") or ""
        titles = extract_toc_titles(html_path)
        if not titles:
            titles = [_clean_text(report.get("report_nm")) or "목차 없음"]
        key = "\n".join(titles)
        group = groups.setdefault(
            key,
            {
                "id": f"toc-{len(groups) + 1}",
                "titles": titles,
                "title": " > ".join(titles),
                "count": 0,
                "files": [],
            },
        )
        group["count"] += 1
        group["files"].append(
            {
                "corpName": report.get("corp_name", ""),
                "rceptNo": report.get("rcept_no", ""),
                "reportName": report.get("report_nm", ""),
                "path": str(html_path),
                "fileName": Path(html_path).name if html_path else "",
            }
        )

    return sorted(groups.values(), key=lambda item: (-item["count"], item["title"]))
