from weekly_mezz.toc import build_toc_combinations
from maxawon.worker import weekly_mezz_toc_combinations


def test_build_toc_combinations_groups_reports_by_toc_titles(tmp_path):
    first = tmp_path / "first.html"
    second = tmp_path / "second.html"
    third = tmp_path / "third.html"
    first.write_text(
        """
        <html><body>
          <h2 id="toc_1">주요사항보고서 / 거래소 신고의무 사항</h2>
          <h2 id="toc_2">전환사채권 발행결정</h2>
        </body></html>
        """,
        encoding="utf-8",
    )
    second.write_text(first.read_text(encoding="utf-8"), encoding="utf-8")
    third.write_text(
        """
        <html><body>
          <h2 id="toc_1">주요사항보고서 / 거래소 신고의무 사항</h2>
          <h2 id="toc_2">교환사채권 발행결정</h2>
        </body></html>
        """,
        encoding="utf-8",
    )

    combinations = build_toc_combinations(
        [
            {"corp_name": "A사", "rcept_no": "20260101000001", "report_nm": "전환사채권발행결정", "html_path": str(first)},
            {"corp_name": "B사", "rcept_no": "20260102000002", "report_nm": "전환사채권발행결정", "html_path": str(second)},
            {"corp_name": "C사", "rcept_no": "20260103000003", "report_nm": "교환사채권발행결정", "html_path": str(third)},
        ]
    )

    assert len(combinations) == 2
    assert combinations[0]["count"] == 2
    assert combinations[0]["titles"] == ["주요사항보고서 / 거래소 신고의무 사항", "전환사채권 발행결정"]
    assert [file["corpName"] for file in combinations[0]["files"]] == ["A사", "B사"]
    assert combinations[0]["files"][0]["path"] == str(first)
    assert combinations[1]["count"] == 1


def test_weekly_mezz_toc_combinations_loads_manifest_next_to_output(tmp_path):
    downloads = tmp_path / "downloads"
    html_dir = downloads / "kind_downloads" / "viewer_html_contents"
    html_dir.mkdir(parents=True)
    html_path = html_dir / "report.html"
    html_path.write_text(
        """
        <html><body>
          <h2 id="toc_1">주요사항보고서 / 거래소 신고의무 사항</h2>
          <h2 id="toc_2">전환사채권 발행결정</h2>
        </body></html>
        """,
        encoding="utf-8",
    )
    (downloads / "kind_downloads" / "kind_manifest.json").write_text(
        """
        {
          "list": [
            {
              "corp_name": "A사",
              "rcept_no": "20260101000001",
              "report_nm": "전환사채권발행결정",
              "html_path": "%s"
            }
          ]
        }
        """
        % str(html_path).replace("\\", "\\\\"),
        encoding="utf-8",
    )

    result = weekly_mezz_toc_combinations(type("Args", (), {"output_path": str(downloads / "weekly.xlsx")})())

    assert result["manifestPath"].endswith("kind_manifest.json")
    assert result["tocCombinations"][0]["count"] == 1
    assert result["tocCombinations"][0]["files"][0]["corpName"] == "A사"
