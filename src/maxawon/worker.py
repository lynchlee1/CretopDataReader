from __future__ import annotations

import argparse
import asyncio
import importlib.util
import json
from pathlib import Path

from maxawon.table_capture import CapturedTable, capture_current_maxawon_table_sync, write_table_csv
from weekly_mezz.cli import collect_and_export, parse_yyyymmdd
from weekly_mezz.toc import build_toc_combinations


REQUIRED_MODULES = ["playwright", "bs4", "FinanceDataReader", "lxml", "openpyxl", "requests"]


def print_json(payload: dict) -> None:
    print(json.dumps(payload, ensure_ascii=False))


def check_runtime(_args: argparse.Namespace) -> int:
    missing = [name for name in REQUIRED_MODULES if importlib.util.find_spec(name) is None]
    print_json({"missing": missing})
    return 0


def capture_table(args: argparse.Namespace) -> int:
    max_pages = int(args.max_pages) if args.max_pages else None
    output_path = Path(args.output_path)
    result = capture_current_maxawon_table_sync(max_pages=max_pages)
    if not result.rows:
        raise RuntimeError("현재 화면에서 복사할 테이블 데이터를 찾지 못했습니다.")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    write_table_csv(output_path, CapturedTable(result.headers, result.rows))
    print_json(
        {
            "headers": result.headers,
            "rows": result.rows[:100],
            "pages": result.pages,
            "rowCount": len(result.rows),
            "outputPath": str(output_path),
        }
    )
    return 0


def weekly_mezz_collect(args: argparse.Namespace) -> int:
    output_path = Path(args.output_path).expanduser()
    result = collect_and_export(
        parse_yyyymmdd(args.from_date),
        parse_yyyymmdd(args.to_date),
        output_path,
        last_reprt_at=args.last_report_value or "ALL",
    )
    manifest_path = output_path.resolve().parent / "kind_downloads" / "kind_manifest.json"
    toc_combinations = []
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        toc_combinations = build_toc_combinations(manifest.get("list", []))
    print_json(
        {
            "outputPath": str(result.output_path),
            "rawPath": str(result.raw_path) if result.raw_path else "",
            "auditPath": str(result.audit_path) if result.audit_path else "",
            "summary": result.summary,
            "tocCombinations": toc_combinations,
        }
    )
    return 0


def weekly_mezz_toc_combinations(args: argparse.Namespace) -> dict:
    output_path = Path(args.output_path).expanduser()
    manifest_path = output_path.resolve().parent / "kind_downloads" / "kind_manifest.json"
    if not manifest_path.exists():
        return {"manifestPath": str(manifest_path), "tocCombinations": []}
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    return {
        "manifestPath": str(manifest_path),
        "tocCombinations": build_toc_combinations(manifest.get("list", [])),
    }


def weekly_mezz_toc(args: argparse.Namespace) -> int:
    print_json(weekly_mezz_toc_combinations(args))
    return 0


def network_logger(args: argparse.Namespace) -> int:
    from maxawon.network_logger import NetworkLogger

    asyncio.run(NetworkLogger(Path(args.log_dir), cdp_url=args.cdp_url).run())
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="maxawon-worker")
    subparsers = parser.add_subparsers(dest="command", required=True)

    check_parser = subparsers.add_parser("check")
    check_parser.set_defaults(func=check_runtime)

    capture_parser = subparsers.add_parser("capture-table")
    capture_parser.add_argument("--max-pages", default="")
    capture_parser.add_argument("--output-path", required=True)
    capture_parser.set_defaults(func=capture_table)

    weekly_parser = subparsers.add_parser("weekly-mezz-collect")
    weekly_parser.add_argument("--from-date", required=True)
    weekly_parser.add_argument("--to-date", required=True)
    weekly_parser.add_argument("--output-path", required=True)
    weekly_parser.add_argument("--last-report-value", default="ALL")
    weekly_parser.set_defaults(func=weekly_mezz_collect)

    toc_parser = subparsers.add_parser("weekly-mezz-toc")
    toc_parser.add_argument("--output-path", required=True)
    toc_parser.set_defaults(func=weekly_mezz_toc)

    logger_parser = subparsers.add_parser("network-logger")
    logger_parser.add_argument("--log-dir", required=True)
    logger_parser.add_argument("--cdp-url", required=True)
    logger_parser.set_defaults(func=network_logger)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
