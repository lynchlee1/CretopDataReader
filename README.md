# Maxawon

Maxawon은 사용자가 직접 로그인한 뒤, 화면에 열린 조건검색 결과 테이블을 CSV로 저장하는 데스크탑 도구입니다.

로그인은 자동으로 처리하지 않습니다. 사용자가 Chrome에서 직접 로그인하고, 앱으로 돌아와 `로그인 완료`를 눌러야 합니다.

## 준비

- Python 3
- Node.js
- Google Chrome
- Maxawon에 접근할 수 있는 계정

처음 한 번만 설치합니다.

```bash
python -m pip install -e .
npm install
```

## 실행

일반 실행:

```bash
npm run desktop
```

개발자 도구를 같이 열어야 할 때:

```bash
npm run desktop:dev
```

## 사용 순서

1. 앱에서 `Chrome 열기`를 누릅니다.
2. 열린 Chrome에서 Maxawon에 직접 로그인합니다.
3. Maxawon에서 조건검색을 직접 실행하고, 결과 테이블이 보이는 화면까지 이동합니다.
4. 앱으로 돌아와 `로그인 완료`를 누릅니다.
5. 왼쪽 메뉴의 `Cretop` 아래에서 `Cretop 검색결과 저장하기`를 엽니다.
6. 필요하면 `최대 페이지`와 `저장 파일`을 변경합니다.
7. `현재 조건검색 테이블 저장`을 누릅니다.

복사가 끝나면 지정한 CSV 파일에 결과가 저장되고, 앱 화면에는 앞부분만 미리보기로 표시됩니다.

## 저장 위치

기본 저장 파일은 앱 데이터 폴더 아래의 `output/maxawon_condition_search.csv`입니다.

다른 위치에 저장하려면 `조건검색 테이블 CSV 저장` 화면에서 `변경`을 누르고 CSV 파일 경로를 선택하세요.

## PPT Forger

왼쪽 메뉴에서 `PPT Forger`를 열면 `finiq-pptforger`의 PPT 데이터 생성과 PPTX 템플릿 치환 기능을 사용할 수 있습니다.

1. 종목코드, 메자닌 종류, 투자금액, 발행금액, 지분율 조건을 입력합니다.
2. `Model.xlsx`와 `{{key}}` 플레이스홀더가 들어 있는 `.pptx` 템플릿을 선택합니다.
3. 필요하면 AI 문구 입력칸에 투자포인트, 주가 포인트, 리스크 문구를 직접 입력합니다.
4. `데이터 만들기`를 눌러 FnGuide/KIND와 `Model.xlsx` 기반 치환 JSON을 만듭니다.
5. `저장 파일`에서 결과 `.pptx` 경로를 선택하고 `PPT 생성`을 누릅니다.

현재 이식 범위는 FnGuide/KIND 회사 조회, `Model.xlsx` 읽기, 원본 PPT 치환 데이터 조립, PPTX 템플릿 치환과 저장입니다. Gemini 자동 문구 생성과 기본 템플릿 번들은 후속 단계에서 연결해야 합니다.

## Chrome 종료

- `실행된 Chrome 종료`: 이 앱에서 연 Chrome만 종료합니다.
- `전체 Chrome 종료`: 사용자가 따로 열어 둔 Chrome까지 모두 종료할 수 있습니다. 필요한 경우에만 사용하세요.

## 아직 지원하지 않는 기능

- 엑셀 파일을 읽어 Maxawon 검색을 자동으로 반복 실행하는 기능
- 여러 후보가 나왔을 때 회사를 자동으로 판별하는 기능
- 로그인 자동화
- PPT Forger의 Gemini 자동 문구 생성과 기본 템플릿 번들

이 프로그램은 CAPTCHA, 봇 탐지, 접근 제한, 속도 제한 같은 보호 장치를 우회하지 않습니다.

## 기존 Tkinter UI

Electron UI가 기본 실행 방식입니다. 예전 Tkinter UI가 필요하면 아래 명령으로 실행할 수 있습니다.

```bash
python -m maxawon
```

또는:

```bash
maxawon
```
