import re

import requests
from bs4 import BeautifulSoup

DART_MAIN_URL = "https://dart.fss.or.kr/dsaf001/main.do"


def _response_text(response) -> str:
    encoding = getattr(response, "apparent_encoding", None) or response.encoding or "utf-8"
    return response.content.decode(encoding, errors="replace")


def parse_family_rcept_numbers(main_page_html: str) -> list[str]:
    soup = BeautifulSoup(main_page_html or "", "html.parser")
    family_select = soup.find("select", id="family")
    if family_select is None:
        return []

    rcept_numbers = []
    seen = set()
    for option in family_select.find_all("option"):
        value = option.get("value") or ""
        match = re.search(r"(?:^|[?&])rcpNo=(\d{14})", value)
        if not match:
            continue
        rcept_no = match.group(1)
        if rcept_no in seen:
            continue
        seen.add(rcept_no)
        rcept_numbers.append(rcept_no)
    return rcept_numbers


_parse_family_rcept_numbers = parse_family_rcept_numbers


def find_previous_family_rcept_no(rcept_no: str, family_rcept_numbers: list[str]) -> str:
    current = (rcept_no or "").strip()
    ordered = sorted({value for value in family_rcept_numbers if re.fullmatch(r"\d{14}", value)})
    try:
        index = ordered.index(current)
    except ValueError:
        return ""
    if index == 0:
        return ""
    return ordered[index - 1]


def fetch_previous_family_rcept_no(rcept_no: str, timeout: int = 30) -> str:
    current = (rcept_no or "").strip()
    if not re.fullmatch(r"\d{14}", current):
        return ""
    response = requests.get(DART_MAIN_URL, params={"rcpNo": current}, timeout=timeout)
    response.raise_for_status()
    family_rcept_numbers = parse_family_rcept_numbers(_response_text(response))
    return find_previous_family_rcept_no(current, family_rcept_numbers)
