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
   pip install fastf1 pandas numpy
   ```

   The server expects the virtual environment at `server/venv/`. On Windows it invokes `server/venv/Scripts/python.exe`. FastF1's own cache is stored under `server/fastf1_cache/` (auto-created, git-ignored).

## Running

Start both the server and client together from the project root:

```bash
npm run dev
```

- Client (Vite): http://localhost:5173
- Server (Express): http://localhost:3001

You can also run them individually with `npm run dev:server` or `npm run dev:client`.

## Build

```bash
# Server
cd server && npm run build   # → dist/, run with npm start

# Client
cd client && npm run build   # → dist/ (static assets)
```

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
   pip install fastf1 pandas numpy
   ```

   서버는 가상환경이 `server/venv/`에 있다고 가정하며, Windows에서는 `server/venv/Scripts/python.exe`를 실행합니다. FastF1 자체 캐시는 `server/fastf1_cache/`에 저장됩니다(자동 생성, git 무시).

## 실행

프로젝트 루트에서 서버와 클라이언트를 함께 실행합니다:

```bash
npm run dev
```

- 클라이언트 (Vite): http://localhost:5173
- 서버 (Express): http://localhost:3001

`npm run dev:server` 또는 `npm run dev:client`로 개별 실행도 가능합니다.

## 빌드

```bash
# 서버
cd server && npm run build   # → dist/, npm start 로 실행

# 클라이언트
cd client && npm run build   # → dist/ (정적 파일)
```

> **참고:** 현재 UI는 한국어로 되어 있습니다.
