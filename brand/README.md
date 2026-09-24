# F1 온더리밋 (OnTheLimit) 로고

![preview](preview.png)

## 콘셉트

- **심볼:** 회전계 바늘이 레드존에 들어가 있는 모습입니다. "한계에서(On the limit)" 달린다는 이름을 그대로 그림으로 옮겼습니다.
- **워드마크:** 두꺼운 이탤릭체로 속도감을 줬습니다. 영문판은 `ONTHE`를 검정, `LIMIT`를 빨강으로 쓰고, 그 아래 같은 기울기의 속도 바를 넣었습니다. 국문판은 빨간 `F1` 태그 옆에 `온더리밋`을 붙였습니다.
- **색상**

  | 이름 | 값 | 쓰는 곳 |
  | --- | --- | --- |
  | Racing Red | `#D9101A` | 레드존, 바늘, `LIMIT`, `F1` 태그 |
  | Ink | `#111114` | 라이트 배경의 글자 |
  | Tile | `#0E0E11` | 심볼 배경 |
  | Paper | `#FFFFFF` | 다크 배경의 글자, 게이지 |

  빨강은 F1 공식 브랜드 컬러와 일부러 다르게 잡았습니다. 서체도 F1 공식 로고체가 아닌 Pretendard를 씁니다.
- **서체:** Pretendard Black / Bold (SIL OFL 1.1). 글자를 모두 윤곽선 경로로 바꿔 두었기 때문에, 이 서체가 설치되지 않은 환경에서도 똑같이 보입니다.

## 파일 (`client/public/brand/`)

| 파일 | 용도 |
| --- | --- |
| `onthelimit-logo-ko-{light,dark}.svg` | **데스크탑용.** 태그라인(ONTHELIMIT · F1 RACE DATA)이 들어간 가로형입니다. 랜딩 화면이나 푸터처럼 48px 이상으로 표시할 때 씁니다. |
| `onthelimit-logo-compact-{light,dark}.svg` | **헤더용** (데스크탑과 모바일 공통). 태그라인이 없고, 높이 32–40px에 맞춘 버전입니다. |
| `onthelimit-logo-en-{light,dark}.svg` | 영문 UI, SNS, 발표 자료에 쓰는 영문 워드마크입니다. |
| `onthelimit-mark.svg`, `onthelimit-mark-{512,192}.png`, `apple-touch-icon.png` | 앱 아이콘, PWA 아이콘, SNS 프로필 이미지 |
| `favicon.svg`, `favicon-{32,16}.png` | 파비콘. 작은 크기에서도 보이도록 눈금을 빼고 선을 굵게 만들었습니다. |
| `*@2x.png` | SVG를 쓸 수 없는 곳에 넣는 2배 해상도 PNG |

`light`는 밝은 배경용(검정 글자), `dark`는 어두운 배경용(흰 글자)입니다. `dark` 버전은 심볼 타일에 얇은 테두리가 있어서, 어두운 배경에서도 심볼의 모양이 보입니다.

### 쓰는 방법

앱 헤더에서는 테마에 맞춰 두 파일을 번갈아 보여 주면 됩니다.

```html
<img class="logo-light" src="/brand/onthelimit-logo-compact-light.svg" alt="F1 온더리밋" height="36">
<img class="logo-dark"  src="/brand/onthelimit-logo-compact-dark.svg"  alt="F1 온더리밋" height="36">
```

- 로고 둘레에는 심볼 높이의 1/4 이상 여백을 둡니다.
- 로고를 늘이거나 색을 바꾸지 않습니다.
- 헤더에 넣을 때는 높이 32px 미만으로 줄이지 않습니다.

## 다시 만들기

```bash
python3 brand/make_logo.py      # SVG 생성. 필요한 것: fontTools, ~/.fonts/Pretendard-*.otf
node brand/export_png.cjs       # PNG 생성. 필요한 것: Playwright + Chromium
```
