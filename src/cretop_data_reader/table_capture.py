from __future__ import annotations

import asyncio
import csv
from dataclasses import dataclass
from pathlib import Path
from typing import Any


CDP_URL = "http://127.0.0.1:9222"


@dataclass(frozen=True)
class CapturedTable:
    headers: list[str]
    rows: list[list[str]]


@dataclass(frozen=True)
class CaptureResult:
    headers: list[str]
    rows: list[list[str]]
    pages: int


def pick_largest_table(tables: list[dict[str, Any]]) -> CapturedTable | None:
    valid_tables = [
        table
        for table in tables
        if table.get("rows")
    ]
    if not valid_tables:
        return None

    table = max(valid_tables, key=lambda item: len(item.get("rows", [])))
    headers = [str(value or "").strip() for value in table.get("headers", [])]
    rows = [
        [str(value or "").strip() for value in row]
        for row in table.get("rows", [])
    ]

    if not headers and rows:
        headers = [f"Column {index + 1}" for index in range(max(len(row) for row in rows))]

    return CapturedTable(headers=headers, rows=rows)


def combine_tables(tables: list[CapturedTable]) -> CapturedTable:
    if not tables:
        return CapturedTable(headers=[], rows=[])

    headers = tables[0].headers
    rows: list[list[str]] = []
    width = len(headers)

    for table in tables:
        if len(table.headers) > width:
            width = len(table.headers)
            headers = table.headers
        for row in table.rows:
            rows.append(row)

    if width:
        rows = [row + [""] * (width - len(row)) for row in rows]
        rows = [row[:width] for row in rows]

    return CapturedTable(headers=headers, rows=rows)


def write_table_csv(path: Path, table: CapturedTable) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.writer(file)
        if table.headers:
            writer.writerow(table.headers)
        writer.writerows(table.rows)


async def capture_current_cretop_table(
    max_pages: int,
    cdp_url: str = CDP_URL,
) -> CaptureResult:
    try:
        from playwright.async_api import async_playwright
    except ImportError as exc:
        raise RuntimeError(
            "화면 테이블 복사 기능을 사용하려면 Playwright가 필요합니다. "
            "`python -m pip install -e .`를 실행하세요."
        ) from exc

    if max_pages < 1:
        raise ValueError("max_pages must be at least 1")

    async with async_playwright() as playwright:
        try:
            browser = await playwright.chromium.connect_over_cdp(cdp_url)
        except Exception as exc:
            raise RuntimeError(
                "Chrome에 연결하지 못했습니다. 앱의 'Chrome 열기' 버튼으로 연 창에서 "
                "Cretop에 로그인한 뒤 다시 시도하세요."
            ) from exc
        try:
            page = await _find_cretop_page(browser)
            captured: list[CapturedTable] = []
            seen_tables: set[tuple[tuple[str, ...], tuple[tuple[str, ...], ...]]] = set()

            for page_number in range(max_pages):
                await page.wait_for_load_state("domcontentloaded")
                table = pick_largest_table(await _extract_tables(page))
                if table is not None:
                    signature = table_signature(table)
                    if signature in seen_tables:
                        break
                    seen_tables.add(signature)
                    captured.append(table)

                if page_number == max_pages - 1:
                    break
                clicked = await _click_next_page(page)
                if not clicked:
                    break
                await page.wait_for_load_state("domcontentloaded")
                await page.wait_for_timeout(500)

            combined = combine_tables(captured)
            return CaptureResult(
                headers=combined.headers,
                rows=combined.rows,
                pages=len(captured),
            )
        finally:
            await browser.close()


def capture_current_cretop_table_sync(max_pages: int, cdp_url: str = CDP_URL) -> CaptureResult:
    return asyncio.run(capture_current_cretop_table(max_pages=max_pages, cdp_url=cdp_url))


def table_signature(table: CapturedTable) -> tuple[tuple[str, ...], tuple[tuple[str, ...], ...]]:
    return (
        tuple(table.headers),
        tuple(tuple(row) for row in table.rows),
    )


async def _find_cretop_page(browser: Any) -> Any:
    pages = [
        page
        for context in browser.contexts
        for page in context.pages
    ]
    for page in reversed(pages):
        if "cretop.com" in page.url:
            return page
    if pages:
        return pages[-1]
    raise RuntimeError("Chrome에서 열린 페이지를 찾지 못했습니다.")


async def _extract_tables(page: Any) -> list[dict[str, Any]]:
    return await page.evaluate(
        """
        () => Array.from(document.querySelectorAll('table')).map((table) => {
          const rows = Array.from(table.querySelectorAll('tr')).map((tr) =>
            Array.from(tr.querySelectorAll('th,td')).map((cell) => cell.innerText.trim())
          ).filter((row) => row.some((cell) => cell.length > 0));

          const firstRow = rows[0] || [];
          const hasHeaderCells = table.querySelector('tr th') !== null;
          const headers = hasHeaderCells ? firstRow : [];
          const bodyRows = hasHeaderCells ? rows.slice(1) : rows;
          return { headers, rows: bodyRows };
        })
        """
    )


async def _click_next_page(page: Any) -> bool:
    return await page.evaluate(
        """
        () => {
          const labels = ['다음', 'Next', 'next', '>', '›', '»'];
          const candidates = Array.from(document.querySelectorAll('a,button,[role="button"]'));
          const visible = (element) => {
            const style = window.getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.display !== 'none' && style.visibility !== 'hidden' &&
              rect.width > 0 && rect.height > 0;
          };
          const disabled = (element) =>
            element.disabled ||
            element.getAttribute('aria-disabled') === 'true' ||
            /disabled|off/i.test(element.className || '');

          for (const element of candidates) {
            if (!visible(element) || disabled(element)) continue;
            const text = (element.innerText || element.textContent || '').trim();
            const title = (element.getAttribute('title') || '').trim();
            const aria = (element.getAttribute('aria-label') || '').trim();
            const rel = (element.getAttribute('rel') || '').trim();
            const value = `${text} ${title} ${aria} ${rel}`.trim();
            if (labels.some((label) => value === label || value.includes(label)) || rel === 'next') {
              element.click();
              return true;
            }
          }
          return false;
        }
        """
    )
