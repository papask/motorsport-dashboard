# F1 Motorsport Dashboard

A full-stack Formula 1 dashboard that visualizes standings, schedules, race results, timelines, telemetry, and race incidents. Data is sourced from the [Jolpica (Ergast) API](https://api.jolpi.ca/) and the [FastF1](https://docs.fastf1.dev/) Python library.

> 🇰🇷 한국어 설명은 [아래](#f1-모터스포츠-대시보드-한국어)에 있습니다.

---

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, TypeScript, Vite, React Router 7, Recharts, Axios |
| Backend | Node.js, Express 4, TypeScript, node-cache |
| Data | Jolpica/Ergast REST API, FastF1 (Python) via `child_process` |
| Tooling | Concurrently, tsx, ESLint |

## Architecture

```
motorsport-dashboard/
├── package.json          # Root workspace runner (concurrently)
├── client/               # React + Vite SPA (Korean UI)
│   └── src/
│       ├── App.tsx       # Router + top navigation + season selector
│       ├── pages/        # Dashboard, standings, schedule, results, timeline, telemetry, incidents
│       ├── services/     # API client (Axios)
│       └── hooks/        # useApi data-fetching hook
└── server/               # Express API
    └── src/
        ├── index.ts      # App entry, mounts routers on /api/*
        ├── routes/       # standings, schedule, results, telemetry
        └── services/
            ├── jolpicaService.ts    # Jolpica/Ergast fetch + parse (5-min cache)
            ├── fastf1Service.ts     # Spawns Python helper (10-min cache)
            ├── fastf1_helper.py     # FastF1 interface, outputs JSON
            └── timelineCompiler.ts  # Builds lap-by-lap race timeline
```

The Express server exposes a REST API under `/api`. Lightweight data (standings, schedule, results) comes from the Jolpica/Ergast API, while richer telemetry and incident data is retrieved by spawning a Python helper that wraps FastF1. Responses are cached in-memory to avoid redundant upstream calls and repeated Python process spawns.

## Features

- **Dashboard** — season overview at a glance
- **Standings** — driver and constructor championship tables
- **Schedule** — full-season race calendar
- **Results** — per-race finishing results
- **Timeline** — lap-by-lap race timeline compiled from lap timings and pit stops
- **Telemetry** — driver telemetry charts (speed, throttle, etc.) via FastF1
- **Incidents** — race incident / flag review
- **FiA Documents** — the latest Grand Prix's FiA documents, checked every 30 minutes and summarized in Korean and English by Claude (needs `ANTHROPIC_API_KEY`)
- Season selector (2023–2026)

## API Endpoints

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/api/health` | Health check |
| GET | `/api/standings/drivers/:year` | Driver standings |
| GET | `/api/standings/constructors/:year` | Constructor standings |
| GET | `/api/schedule/:year` | Season schedule |
| GET | `/api/results/last` | Most recent race results |
| GET | `/api/results/:year/:round` | Race results |
| GET | `/api/results/timeline/:year/:round` | Race timeline |
| GET | `/api/telemetry/sessions/:year/:round` | Available sessions |
| GET | `/api/telemetry/drivers/:year/:round` | Drivers in a session |
| GET | `/api/telemetry/:year/:round/:driverNumber` | Driver telemetry |
| GET | `/api/telemetry/incidents/:year/:round` | Race incidents |
| GET | `/api/fia/documents` | Summarized FiA documents |

## Prerequisites

- **Node.js** 18+ and npm
- **Python** 3.9+ (for FastF1 telemetry/incident features)

## Setup

1. **Install Node dependencies** (root, server, and client):

   ```bash
   npm run install:all
   ```

2. **Set up the Python environment** for FastF1. From the `server/` directory:

   ```bash
   cd server
   python -m venv venv
   # Windows
   venv\Scripts\activate
   # macOS / Linux
   source venv/bin/activate
   pip install -r requirements.txt
   ```

   The server uses `server/venv/` when it exists (`Scripts/python.exe` on Windows, `bin/python` on macOS/Linux), otherwise the system `python3`. Set `PYTHON_PATH` to use another interpreter. FastF1's own cache is stored under `server/fastf1_cache/` (auto-created, git-ignored; override with `FASTF1_CACHE_DIR`).

## Running

Start both the server and client together from the project root:

```bash
npm run dev
```

- Client (Vite): http://localhost:5173
- Server (Express): http://localhost:3001

You can also run them individually with `npm run dev:server` or `npm run dev:client`.

The client calls the API at `/api`; in development Vite proxies it to the Express server on port 3001.

## Build

```bash
# Server
cd server && npm run build   # → dist/, run with npm start

# Client
cd client && npm run build   # → dist/ (static assets)
```

When `client/dist` exists, the Express server serves it together with the API, so `cd server && npm start` runs the whole app at http://localhost:3001.

## Deployment

The app deploys as a single Docker container: Express serves the built client and the API from one origin, with Python and FastF1 installed alongside. It needs a host that runs long-lived containers (Render, Railway, Fly.io, a VPS, …); serverless platforms can't run the Python helper.

```bash
docker build -t onthelimit .
docker run -p 3001:3001 -v onthelimit-data:/data onthelimit
```

| Variable | Default (in the image) | Purpose |
| --- | --- | --- |
| `PORT` | `3001` | HTTP port. Most hosts set it for you. |
| `FASTF1_CACHE_DIR` | `/data/fastf1_cache` | FastF1 cache. Mount a volume at `/data` to keep it across restarts. |
| `PYTHON_PATH` | `/opt/venv/bin/python` | Python interpreter with FastF1 installed |
| `CLIENT_DIST` | `../client/dist` | Built client served by Express |
| `ANTHROPIC_API_KEY` | — | Claude API key for FiA document summaries. Locally, put it in `server/.env`. |
| `DATA_DIR` | `/data` | Where the FiA summaries are stored (`fia-documents.json`) |

FastF1 loads whole sessions into memory, so give the container at least 1 GB of RAM.

> **Note:** The current UI is in Korean.

---

# F1 모터스포츠 대시보드 (한국어)

포뮬러 1 순위, 일정, 레이스 결과, 타임라인, 텔레메트리, 인시던트를 시각화하는 풀스택 대시보드입니다. 데이터는 [Jolpica(Ergast) API](https://api.jolpi.ca/)와 [FastF1](https://docs.fastf1.dev/) 파이썬 라이브러리에서 가져옵니다.

## 기술 스택

| 계층 | 기술 |
| --- | --- |
| 프론트엔드 | React 19, TypeScript, Vite, React Router 7, Recharts, Axios |
| 백엔드 | Node.js, Express 4, TypeScript, node-cache |
| 데이터 | Jolpica/Ergast REST API, FastF1(Python) — `child_process`로 실행 |
| 도구 | Concurrently, tsx, ESLint |

## 아키텍처

```
motorsport-dashboard/
├── package.json          # 루트 워크스페이스 실행기 (concurrently)
├── client/               # React + Vite SPA (한국어 UI)
│   └── src/
│       ├── App.tsx       # 라우터 + 상단 내비게이션 + 시즌 선택
│       ├── pages/        # 대시보드, 스탠딩, 스케줄, 결과, 타임라인, 텔레메트리, 인시던트
│       ├── services/     # API 클라이언트 (Axios)
│       └── hooks/        # useApi 데이터 페칭 훅
└── server/               # Express API
    └── src/
        ├── index.ts      # 앱 진입점, /api/* 에 라우터 마운트
        ├── routes/       # standings, schedule, results, telemetry
        └── services/
            ├── jolpicaService.ts    # Jolpica/Ergast 페치 + 파싱 (5분 캐시)
            ├── fastf1Service.ts     # 파이썬 헬퍼 실행 (10분 캐시)
            ├── fastf1_helper.py     # FastF1 인터페이스, JSON 출력
            └── timelineCompiler.ts  # 랩 단위 레이스 타임라인 생성
```

Express 서버는 `/api` 아래에 REST API를 제공합니다. 가벼운 데이터(스탠딩, 스케줄, 결과)는 Jolpica/Ergast API에서 가져오고, 더 풍부한 텔레메트리와 인시던트 데이터는 FastF1을 감싼 파이썬 헬퍼를 실행해 가져옵니다. 응답은 메모리에 캐시하여 중복된 외부 호출과 파이썬 프로세스 재실행을 방지합니다.

## 주요 기능

- **대시보드** — 시즌 개요를 한눈에
- **스탠딩** — 드라이버 / 컨스트럭터 챔피언십 순위표
- **스케줄** — 시즌 전체 레이스 일정
- **결과** — 레이스별 최종 성적
- **타임라인** — 랩 타이밍과 피트스톱으로 구성한 랩 단위 타임라인
- **텔레메트리** — FastF1 기반 드라이버 텔레메트리 차트(속도, 스로틀 등)
- **인시던트** — 레이스 인시던트 / 플래그 리뷰
- **FiA 문서** — 최신 그랑프리의 FiA 문서를 30분마다 확인해 Claude로 한국어·영어 요약 (`ANTHROPIC_API_KEY` 필요)
- 시즌 선택기 (2023–2026)

## API 엔드포인트

| 메서드 | 엔드포인트 | 설명 |
| --- | --- | --- |
| GET | `/api/health` | 헬스 체크 |
| GET | `/api/standings/drivers/:year` | 드라이버 스탠딩 |
| GET | `/api/standings/constructors/:year` | 컨스트럭터 스탠딩 |
| GET | `/api/schedule/:year` | 시즌 스케줄 |
| GET | `/api/results/last` | 최근 레이스 결과 |
| GET | `/api/results/:year/:round` | 레이스 결과 |
| GET | `/api/results/timeline/:year/:round` | 레이스 타임라인 |
| GET | `/api/telemetry/sessions/:year/:round` | 세션 목록 |
| GET | `/api/telemetry/drivers/:year/:round` | 세션 참가 드라이버 |
| GET | `/api/telemetry/:year/:round/:driverNumber` | 드라이버 텔레메트리 |
| GET | `/api/telemetry/incidents/:year/:round` | 레이스 인시던트 |
| GET | `/api/fia/documents` | 요약된 FiA 문서 |

## 사전 요구사항

- **Node.js** 18+ 및 npm
- **Python** 3.9+ (FastF1 텔레메트리/인시던트 기능용)

## 설치

1. **Node 의존성 설치** (루트, 서버, 클라이언트):

   ```bash
   npm run install:all
   ```

2. FastF1을 위한 **파이썬 환경 설정**. `server/` 디렉터리에서:

   ```bash
   cd server
   python -m venv venv
   # Windows
   venv\Scripts\activate
   # macOS / Linux
   source venv/bin/activate
   pip install -r requirements.txt
   ```

   서버는 `server/venv/`가 있으면 그 파이썬을 쓰고(Windows는 `Scripts/python.exe`, macOS/Linux는 `bin/python`), 없으면 시스템의 `python3`를 씁니다. 다른 파이썬을 쓰려면 `PYTHON_PATH`를 지정합니다. FastF1 자체 캐시는 `server/fastf1_cache/`에 저장됩니다(자동 생성, git 무시, `FASTF1_CACHE_DIR`로 변경 가능).

## 실행

프로젝트 루트에서 서버와 클라이언트를 함께 실행합니다:

```bash
npm run dev
```

- 클라이언트 (Vite): http://localhost:5173
- 서버 (Express): http://localhost:3001

`npm run dev:server` 또는 `npm run dev:client`로 개별 실행도 가능합니다.

클라이언트는 `/api`로 API를 호출하고, 개발 중에는 Vite가 이 요청을 3001번 포트의 Express 서버로 넘겨줍니다.

## 빌드

```bash
# 서버
cd server && npm run build   # → dist/, npm start 로 실행

# 클라이언트
cd client && npm run build   # → dist/ (정적 파일)
```

`client/dist`가 있으면 Express 서버가 API와 함께 화면도 제공합니다. 그래서 `cd server && npm start`만 실행해도 http://localhost:3001 에서 앱 전체가 뜹니다.

## 배포

앱은 Docker 컨테이너 하나로 배포합니다. Express가 빌드된 화면과 API를 같은 주소에서 제공하고, 같은 이미지에 Python과 FastF1이 함께 설치됩니다. 컨테이너를 계속 띄워 두는 호스팅(Render, Railway, Fly.io, VPS 등)이 필요합니다. 서버리스 플랫폼에서는 파이썬 헬퍼를 실행할 수 없습니다.

```bash
docker build -t onthelimit .
docker run -p 3001:3001 -v onthelimit-data:/data onthelimit
```

| 변수 | 기본값(이미지) | 용도 |
| --- | --- | --- |
| `PORT` | `3001` | HTTP 포트. 대부분의 호스팅이 알아서 지정합니다. |
| `FASTF1_CACHE_DIR` | `/data/fastf1_cache` | FastF1 캐시. `/data`에 볼륨을 붙이면 재시작해도 유지됩니다. |
| `PYTHON_PATH` | `/opt/venv/bin/python` | FastF1이 설치된 파이썬 |
| `CLIENT_DIST` | `../client/dist` | Express가 제공할 빌드된 화면 |
| `ANTHROPIC_API_KEY` | — | FiA 문서 요약용 Claude API 키. 로컬에서는 `server/.env`에 넣습니다. |
| `DATA_DIR` | `/data` | FiA 요약 저장 위치(`fia-documents.json`) |

FastF1은 세션 데이터를 통째로 메모리에 올리므로 컨테이너 메모리는 1 GB 이상을 권장합니다.

> **참고:** 현재 UI는 한국어로 되어 있습니다.
