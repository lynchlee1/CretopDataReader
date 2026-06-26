import threading

from weekly_mezz import kind
from weekly_mezz.export import build_export_rows_with_audit


def _report(rcept_no):
    return {
        "corp_cls": "K",
        "corp_name": f"회사{rcept_no}",
        "report_nm": "전환사채권발행결정",
        "rcept_no": rcept_no,
    }


def test_build_export_rows_parses_reports_in_parallel(monkeypatch):
    barrier = threading.Barrier(2, timeout=1)
    thread_names = set()

    def parse_report(report):
        thread_names.add(threading.current_thread().name)
        barrier.wait()
        return {
            "종류": "CB",
            "납입일": "2026-01-01",
            "만기일": "2029-01-01",
            "발행금액": 100,
        }

    monkeypatch.setattr("weekly_mezz.export.parse_report_documents", parse_report)
    monkeypatch.setattr("weekly_mezz.export.fetch_previous_family_rcept_no", lambda rcept_no: "")

    rows, summary, audit_rows = build_export_rows_with_audit(
        {"list": [_report("20260101000001"), _report("20260102000002")], "total_count": 2},
        parse_max_workers=2,
    )

    assert summary["parse_failure_count"] == 0
    assert summary["exported_count"] == 2
    assert len(rows) == 2
    assert len(audit_rows) == 2
    assert len(thread_names) == 2


def test_fetch_mezzanine_reports_fetches_later_result_pages_in_parallel(monkeypatch, tmp_path):
    barrier = threading.Barrier(2, timeout=1)
    parallel_page_hits = []

    class Response:
        def __init__(self, content=b""):
            self.content = content

        def raise_for_status(self):
            return None

    class Session:
        headers = {}

        def get(self, *args, **kwargs):
            return Response(b"search")

        def post(self, url, data, timeout):
            page_no = int(dict(data)["pageIndex"])
            if page_no in {2, 3}:
                parallel_page_hits.append((page_no, threading.current_thread().name))
                barrier.wait()
            return Response(f"page-{page_no}".encode())

        def close(self):
            return None

    monkeypatch.setattr(kind, "_new_kind_session", Session)
    monkeypatch.setattr(kind, "_infer_total_pages", lambda markup, fallback: 3 if fallback == 1 else fallback)
    monkeypatch.setattr(
        kind,
        "_parse_result_rows",
        lambda markup: [
            _report(f"2026010{markup.decode()[-1]}000001"),
        ],
    )
    monkeypatch.setattr(kind, "_download_report_html", lambda report, **kwargs: {"html_path": "cached.html"})

    result = kind.fetch_mezzanine_reports(
        kind.date(2026, 1, 1),
        kind.date(2026, 1, 31),
        output_dir=tmp_path,
        search_max_workers=2,
        html_max_workers=1,
    )

    assert result["total_page"] == 3
    assert result["total_count"] == 3
    assert {page_no for page_no, _ in parallel_page_hits} == {2, 3}
    assert len({thread_name for _, thread_name in parallel_page_hits}) == 2
