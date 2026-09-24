# F1 대시보드 소개 영상

![poster](poster.jpg)

- 파일: [`f1-dashboard-intro.mp4`](f1-dashboard-intro.mp4) (1920×1080, 30fps, H.264 + AAC, 약 1분 57초)
- 구성: 인트로 → 데스크탑 9개 장면 → 모바일 전환 카드 → 모바일 4개 장면 → 데스크탑+모바일 동시 화면 → 아웃트로

| 구간 | 내용 |
| --- | --- |
| DESKTOP 01–09 | 대시보드, 스케줄, 드라이버 스탠딩, 레이스 결과, 순위 변동 차트, 레이스 리플레이, 텔레메트리, 인시던트, 한/EN 전환 |
| MOBILE 01–04 | 모바일 대시보드, 드로어 메뉴 + 컨스트럭터 스탠딩, 모바일 리플레이, 결과표 + 텔레메트리 |
| DESKTOP + MOBILE | 같은 리플레이를 두 화면에서 동시에 재생 |

## 사용한 소스와 라이선스

외부 스톡 소스를 가져오지 않고, 저작권 문제가 없도록 모든 요소를 직접 만들거나 자유 라이선스 자료만 썼습니다.

| 요소 | 출처 | 라이선스 |
| --- | --- | --- |
| 화면 영상 | 이 저장소의 앱을 Playwright(Chromium)로 직접 녹화 | 자체 제작 |
| 배경 음악 · 효과음 | `scripts/music.py`로 코드에서 합성(킥·하이햇·베이스·패드·아르페지오·라이저·휘시 효과음). 샘플 음원은 쓰지 않음 | 자체 제작 |
| 그래픽 (배경, 브라우저·스마트폰 프레임, 전환 효과, 인트로·아웃트로) | `scripts/make_video.py`에서 Pillow로 그림 | 자체 제작 |
| 글꼴 | [Pretendard](https://github.com/orioncactus/pretendard) | SIL Open Font License 1.1 |

> ⚠️ 녹화 환경의 네트워크 정책 때문에 Jolpica/FastF1 API에 접속할 수 없었습니다. 그래서 영상 속 2026 시즌 경기 기록(순위, 결과, 랩 차트, 텔레메트리, 인시던트)은 `scripts/mock-server.cjs`가 만든 **시연용 샘플 데이터**이고, 실제 기록이 아닙니다. 영상 인트로와 아웃트로에도 같은 안내 문구가 들어가 있습니다.

## 다시 만드는 방법

필요한 것: Node 22, Python 3(`numpy`, `scipy`, `pillow`, `imageio-ffmpeg`), Playwright + Chromium, Pretendard 글꼴(`~/.fonts`에 설치).

1. **샘플 데이터 서버** — `node scripts/mock-server.cjs` (포트 4010)
   - Ergast 형식 엔드포인트(`/ergast/f1/...`)와 FastF1 헬퍼 대체용 `/fastf1/...` 엔드포인트를 제공합니다.
2. **API 서버** — `server/`를 복사한 사본에서 다음 두 가지만 바꿔 실행합니다(원본 코드는 수정하지 않음).
   - `jolpicaService.ts`의 `BASE_URL` → `http://127.0.0.1:4010/ergast/f1`
   - `fastf1Service.ts`의 Python 실행 파일 → `python3`, 헬퍼 스크립트 → `scripts/fake_helper.py`
3. **클라이언트** — `cd client && npx vite --port 5173`
4. **녹화** — `node scripts/record.cjs` → `rec/<장면>/` 폴더에 CDP 스크린캐스트 프레임이 저장됩니다.
   - 데스크탑은 1920×1080, 모바일은 iPhone 13 뷰포트(DPR 2)로 녹화합니다.
5. **클립 변환** — `python3 scripts/toclip.py` → `clips/*.mp4` (30fps CFR)
6. **합성과 음악** — `python3 scripts/make_video.py` → `out/intro_video.mp4`

스크립트는 모두 자기 파일이 있는 디렉터리를 작업 폴더로 씁니다(`rec/`, `clips/`, `out/`). 그래서 한 폴더에 모아 두고 실행하세요.
