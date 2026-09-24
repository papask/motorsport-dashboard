# F1 온더리밋 홍보 영상

## v2 — `f1-onthelimit-promo.mp4` (최신)

![poster](poster-v2.jpg)

- 1920×1080, 30fps, H.264 + AAC, 약 2분 10초
- 실제 2026 시즌 데이터(Jolpica-F1 API, FastF1)를 불러온 상태에서 녹화했습니다. 화면에 나오는 경기는 14라운드 스페인 그랑프리입니다.
- 브라우저 주소창에는 URL 대신 서비스명 **F1 온더리밋**을 표시합니다.
- 장면마다 번호 말머리 없이 **메뉴명과 기능 설명**만 넣었습니다.

| 구간 | 내용 |
| --- | --- |
| 인트로 | 회전계와 스타트 라이트 → 비트에 맞춘 F1 사진 몽타주 → 타이틀 |
| 대시보드 · 스케줄 | 카운트다운, 시즌 리더, TOP 5, 포디움 / 레이스만 보기와 전 세션 보기 전환 |
| **STANDINGS** 스팅어 → 드라이버 · 컨스트럭터 스탠딩 | 순위 변동 차트, 획득 포인트, 팀 포인트 막대 |
| **REVIEW** 스팅어 → 레이스 결과 · 타임라인 · 리플레이 | 퀄리파잉 탭, 57랩 순위 차트, 480배속 리플레이 |
| **ANALYSIS** 스팅어 → 텔레메트리 · 인시던트 | 두 드라이버 비교(ANT vs VER), 인시던트 밀도, 필터 |
| 라이트/다크 · 한/EN | 테마와 언어 전환 |
| 모바일 | 빛 궤적 영상 전환 → 대시보드, 드로어 메뉴, 리플레이, 결과·텔레메트리, 인시던트 |
| 마무리 | 데스크탑과 모바일 동시 재생 → 체커기 배경의 아웃트로(크레딧 포함) |

### 사용한 소스와 라이선스

| 요소 | 출처 | 라이선스 |
| --- | --- | --- |
| 앱 화면 | 이 저장소의 앱을 Playwright(Chromium)로 직접 녹화 | 자체 제작 |
| 배경 음악 | Mixkit "Games Music"(0–82초), "Trap Electro Vibes"(모바일 구간) | Mixkit Stock Music Free License |
| 효과음 | Mixkit: Racing motorcycle speeding up, Fast car drive by, Fast whoosh transition, Cinematic whoosh fast transition, Movie impact intro presentation, Epic movie trailer whoosh impact, Garage pneumatic screwer | Mixkit Sound Effects Free License |
| 스톡 영상 | Mixkit: Accelerating car dashboard(인트로 회전계), Cars traveling at high speed on a highway at night(모바일 전환) | Mixkit Stock Video Free License (Restricted 라이선스 항목은 쓰지 않음) |
| F1 사진 | Flickr(Openverse에서 검색), 아래 표 참고 | CC BY 2.0 |
| 그래픽 (프레임, 전환, 스팅어, 스타트 라이트) | `scripts/v2/make_video2.py`에서 Pillow로 그림 | 자체 제작 |
| 글꼴 | [Pretendard](https://github.com/orioncactus/pretendard) | SIL Open Font License 1.1 |

**사진 출처 (CC BY 2.0)** — 원본을 잘라내고 확대했으며, 명암과 채도를 보정하고 색조를 입혔습니다. 영상 아웃트로에도 촬영자 이름을 표기했습니다.

| 제목 | 촬영자 | 원본 | 라이선스 |
| --- | --- | --- | --- |
| Vettel on Pole | Michael Elleray | [Flickr](https://www.flickr.com/photos/36021014@N06/8093437730) | CC BY 2.0 |
| Learn from the start. | rarye | [Flickr](https://www.flickr.com/photos/26840420@N05/4491902207) | CC BY 2.0 |
| Lewis, doing start pratice at the end of FP3 | franpe | [Flickr](https://www.flickr.com/photos/99725323@N00/8224182470) | CC BY 2.0 |
| Seb, doing start pratice at the end of FP3 | franpe | [Flickr](https://www.flickr.com/photos/99725323@N00/8223143223) | CC BY 2.0 |
| Sebastian Vettel drifts wide after sustaining a puncture | Ben Sutherland | [Flickr](https://www.flickr.com/photos/60179301@N00/4795171283) | CC BY 2.0 |
| Formula 1 Circuit of the Americas, November 2013 | nan palmero | [Flickr](https://www.flickr.com/photos/97402086@N00/10948746545) | CC BY 2.0 |
| Button Rocket | polarjez | [Flickr](https://www.flickr.com/photos/46367436@N04/4942337889) | CC BY 2.0 |
| Vettel's 2013 Contender | Michael Elleray | [Flickr](https://www.flickr.com/photos/36021014@N06/8468329710) | CC BY 2.0 |
| Force India | worldinframes | [Flickr](https://www.flickr.com/photos/9061964@N06/6315503551) | CC BY 2.0 |
| Vettel | Nick J Webb | [Flickr](https://www.flickr.com/photos/11540081@N05/5765270061) | CC BY 2.0 |
| F1 Virgins | Warren D | [Flickr](https://www.flickr.com/photos/13390389@N08/4691786968) | CC BY 2.0 |
| Chequered flag flying at Donington | Ben Sutherland | [Flickr](https://www.flickr.com/photos/60179301@N00/14662062161) | CC BY 2.0 |

> 사진에는 팀·스폰서 로고와 실제 드라이버가 등장합니다. CC BY는 사진의 저작권만 허락하는 라이선스이고, 상표권이나 초상권까지 허락하지는 않습니다. 광고처럼 상업적으로 쓸 계획이라면 따로 확인하는 것이 좋습니다.

### 다시 만드는 방법 (v2)

1. API 서버: `server/`를 복사한 사본에서 `fastf1Service.ts`의 Python 실행 파일만 `python3`로 바꿉니다. 이 환경은 프록시를 거쳐 외부에 접속해서, 사본의 axios를 1.16.1 이상으로 올려야 합니다. 그리고 `pip install fastf1`을 실행합니다.
2. 클라이언트: `cd client && npx vite --port 5173`
3. 녹화: `node scripts/v2/record2.cjs` → `rec2/`
   - 다크 테마로 녹화하고, 모바일은 390×844 뷰포트(DPR 2)를 씁니다.
4. 클립 변환: `python3 scripts/v2/toclip2.py` → `clips2/`
5. 합성: `python3 scripts/v2/make_video2.py` → `out/promo_v2.mp4`
   - `media/dl/`에 위 음악·효과음·영상·사진이 있어야 합니다.
   - v1의 `make_video.py`를 헬퍼로 가져다 씁니다.

---

## v1 — `f1-dashboard-intro.mp4` (이전 버전)

![poster](poster.jpg)

- 1920×1080, 30fps, 약 1분 57초. 코드 업데이트 이전 UI로 녹화했습니다.
- 녹화 당시에는 네트워크 정책 때문에 외부 API에 접속할 수 없었습니다. 그래서 `scripts/mock-server.cjs`가 만든 **시연용 샘플 데이터**로 촬영했고, 음악·효과음·그래픽도 코드로 직접 합성했습니다(`scripts/music.py`, `scripts/make_video.py`).
- 알려진 문제: 모바일 장면의 녹화 뷰포트(390×664)를 390×844 화면 비율로 늘려서, 모바일 화면이 세로로 약 27% 늘어나 보입니다. v2에서는 이 문제를 고쳤습니다.
- 다시 만드는 방법: `scripts/mock-server.cjs` → `scripts/record.cjs` → `scripts/toclip.py` → `scripts/make_video.py`
