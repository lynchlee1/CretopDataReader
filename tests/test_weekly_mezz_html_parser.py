from weekly_mezz.html_bond_parser import parse_bond_issuance_html


def test_html_parser_preserves_stable_basic_and_refixing_keys(tmp_path):
    html = """
    <html>
      <head><title>전환사채권발행결정</title></head>
      <body>
        <h1>전환사채권발행결정</h1>
        <table>
          <tr><th>2. 정정대상 공시서류의 최초제출일 :</th><td>2025년 07월 22일</td></tr>
        </table>
        <table>
          <tr><th>사채의 종류</th><td>회차</td><td>1</td><td>전환사채</td></tr>
          <tr><th>사채의 권면(전자등록)총액</th><td>10,000,000,000</td></tr>
          <tr><th>자금조달의 목적</th><td>운영자금</td><td>10,000,000,000</td></tr>
          <tr><th>표면이자율</th><td>0.0</td></tr>
          <tr><th>만기이자율</th><td>2.0</td></tr>
          <tr><th>사채만기일</th><td>2029년 01월 01일</td></tr>
          <tr><th>전환가액 (원/주)</th><td>5,000</td></tr>
          <tr><th>전환가액 결정방법</th><td>기준주가의 110%로 산정하며 이 문장은 잘리지 않아야 한다</td></tr>
          <tr><th>납입일</th><td>2026년 01월 01일</td></tr>
          <tr><th>시가하락에 따른 전환가액 조정</th><td>3,500</td></tr>
          <tr><th>전환가액 조정에 관한 사항</th><td>매 3개월마다 전환가액의 70% 이상으로 한다</td></tr>
        </table>
      </body>
    </html>
    """
    html_path = tmp_path / "report.html"
    html_path.write_text(html, encoding="utf-8")

    parsed = parse_bond_issuance_html(
        html,
        file_path=html_path,
        report={"report_nm": "전환사채권발행결정", "rcept_no": "20260101000001"},
    )

    assert parsed["발행금액"] == 100.0
    assert parsed["발행금액(억)"] == 100.0
    assert parsed["최초공시일"] == "2025-07-22"
    assert parsed["행사가액"] == 5000
    assert parsed["전환가액(원)"] == 5000
    assert parsed["전환가액 결정방법"] == "기준주가의 110%로 산정하며 이 문장은 잘리지 않아야 한다"
    assert parsed["할증관련텍스트"] == "기준주가의 110%로 산정하며 이 문장은 잘리지 않아야 한다"
    assert parsed["리픽싱(원)"] == 3500
    assert parsed["리픽싱(%)"] in {"70%", "70.0%"}
    assert parsed["리픽싱가격"] in {"70%", "70.0%"}
    assert parsed["리픽싱주가"] == 3


def test_html_parser_omits_section_headers_from_premium_and_refixing_values(tmp_path):
    html = """
    <html>
      <body>
        <table>
          <tr><th>사채의 종류</th><td>회차</td><td>1</td><td>전환사채</td></tr>
          <tr><th>사채의 권면총액</th><td>1,000,000,000</td></tr>
          <tr><th>자금조달의 목적</th><td>운영자금</td><td>1,000,000,000</td></tr>
          <tr><th>전환가액(원/주)</th><td>1,000</td></tr>
          <tr><th>9. 전환에 관한 사항</th><td>전환가액 결정방법</td><td>기준주가의 100%</td></tr>
          <tr><th>9. 전환에 관한 사항</th><td>시가하락에 따른 전환가액 조정</td><td>최저 조정가액 근거</td><td>-</td></tr>
        </table>
      </body>
    </html>
    """
    html_path = tmp_path / "report.html"
    html_path.write_text(html, encoding="utf-8")

    parsed = parse_bond_issuance_html(
        html,
        file_path=html_path,
        report={"report_nm": "전환사채권발행결정", "rcept_no": "20260101000001"},
    )

    assert parsed["전환가액 결정방법"] == "기준주가의 100%"
    assert parsed["리픽싱사유"] == "-"


def test_html_parser_uses_first_body_table_and_ignores_label_numbers(tmp_path):
    html = """
    <html>
      <body>
        <p class="CORRECTION">정 정 신 고 (보고)</p>
        <table class="TABLE">
          <tr><th>1. 사채의 종류</th><td>회차</td><td>18</td><td>전환사채</td></tr>
          <tr><th>2. 사채의 권면(전자등록)총액 (원)</th><td>1,000,000,000</td></tr>
          <tr><th>3. 자금조달의 목적</th><td>운영자금 (원)</td><td>1,000,000,000</td></tr>
          <tr><th>9. 전환에 관한 사항</th><td>전환가액 (원/주)</td><td>999</td></tr>
        </table>
        <h2 class="SECTION-1" id="toc_1">주요사항보고서 / 거래소 신고의무 사항</h2>
        <table class="nb">
          <tr><td>금융위원회 / 한국거래소 귀중</td></tr>
        </table>
        <table class="TABLE">
          <tr><th>1. 사채의 종류</th><td>회차</td><td>18</td><td>무기명식 이권부 무보증 사모 전환사채</td></tr>
          <tr><th>2. 사채의 권면(전자등록)총액 (원)</th><td>-</td></tr>
          <tr><th>3. 자금조달의 목적</th><td>운영자금 (원)</td><td>-</td></tr>
          <tr><th>9. 전환에 관한 사항</th><td>전환가액 (원/주)</td><td>-</td></tr>
          <tr><th>9. 전환에 관한 사항</th><td>전환가액 결정방법</td><td>-</td></tr>
        </table>
      </body>
    </html>
    """
    html_path = tmp_path / "report.html"
    html_path.write_text(html, encoding="utf-8")

    parsed = parse_bond_issuance_html(
        html,
        file_path=html_path,
        report={"report_nm": "[정정]전환사채권발행결정", "rcept_no": "20260616000605"},
    )

    assert parsed["회차"] == "18"
    assert parsed["발행금액"] is None
    assert parsed["행사가액"] is None
    assert parsed["전환가액(원)"] is None
    assert parsed["리픽싱사유"] is None
    assert parsed["전환가액 결정방법"] == "-"


def test_html_parser_keeps_subsidiary_notice_body_table_blank(tmp_path):
    html = """
    <html>
      <body>
        <h2 class="SECTION-1" id="toc_1">주요사항보고서 / 거래소 신고의무 사항</h2>
        <table class="TABLE">
          <tr><th>자회사인</th><td>(주)에이프로젠바이오로직스</td><td>의 주요경영사항신고</td></tr>
        </table>
        <table class="TABLE">
          <tr><th>1. 사채의 종류</th><td>회차</td><td>1</td><td>전환사채</td></tr>
          <tr><th>2. 사채의 권면(전자등록)총액 (원)</th><td>10,000,000,000</td></tr>
          <tr><th>9. 전환에 관한 사항</th><td>전환가액 (원/주)</td><td>5,000</td></tr>
        </table>
      </body>
    </html>
    """
    html_path = tmp_path / "report.html"
    html_path.write_text(html, encoding="utf-8")

    parsed = parse_bond_issuance_html(
        html,
        file_path=html_path,
        report={"report_nm": "[정정]전환사채권발행결정", "rcept_no": "20260619000848"},
    )

    assert parsed["발행금액"] is None
    assert parsed["행사가액"] is None
    assert parsed["전환가액(원)"] is None
