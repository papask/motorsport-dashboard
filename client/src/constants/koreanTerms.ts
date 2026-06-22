// F1 한국어 표준 용어 사전 (나무위키 기준)

// 팀명 매핑 (API 영문 → 한국어)
export const TEAM_NAMES_KR: Record<string, string> = {
  'McLaren': '맥라렌',
  'Mercedes': '메르세데스',
  'Red Bull': '레드불',
  'Red Bull Racing': '레드불 레이싱',
  'Ferrari': '페라리',
  'Williams': '윌리엄스',
  'RB': '레이싱 불스',
  'Racing Bulls': '레이싱 불스',
  'AlphaTauri': '알파타우리',
  'Aston Martin': '애스턴 마틴',
  'Haas F1 Team': '하스',
  'Haas': '하스',
  'Kick Sauber': '아우디',
  'Sauber': '자우버',
  'Audi': '아우디',
  'Alpine F1 Team': '알핀',
  'Alpine': '알핀',
  'Cadillac': '캐딜락',
  'Alfa Romeo': '알파 로메오',
  'Renault': '르노',
};

// 드라이버명 매핑 (API driverId → 한국어)
export const DRIVER_NAMES_KR: Record<string, string> = {
  'max_verstappen': '막스 페르스타펀',
  'hamilton': '루이스 해밀턴',
  'norris': '랜도 노리스',
  'leclerc': '샤를 르클레르',
  'sainz': '카를로스 사인츠',
  'piastri': '오스카 피아스트리',
  'russell': '조지 러셀',
  'perez': '세르히오 페레즈',
  'alonso': '페르난도 알론소',
  'stroll': '랜스 스트롤',
  'gasly': '피에르 가슬리',
  'ocon': '에스테반 오콘',
  'albon': '알렉산더 알본',
  'tsunoda': '카쿠다 츠노다',
  'bottas': '발테리 보타스',
  'zhou': '저우 관위',
  'magnussen': '케빈 마그누센',
  'hulkenberg': '니코 휠켄베르그',
  'ricciardo': '다니엘 리카르도',
  'sargeant': '로건 사전트',
  'lawson': '리암 로슨',
  'bearman': '올리버 베어만',
  'colapinto': '프랑코 콜라핀토',
  'doohan': '잭 두한',
  'antonelli': '안드레아 키미 안토넬리',
  'hadjar': '이삭 하자르',
  'bortoleto': '가브리엘 보르톨레토',
};

// 세션 이름 매핑
export const SESSION_NAMES_KR: Record<string, string> = {
  'Practice 1': '프랙티스 1 (FP1)',
  'Practice 2': '프랙티스 2 (FP2)',
  'Practice 3': '프랙티스 3 (FP3)',
  'Qualifying': '퀄리파잉',
  'Race': '레이스',
  'Sprint': '스프린트',
  'Sprint Qualifying': '스프린트 퀄리파잉',
  'Sprint Shootout': '스프린트 슈트아웃',
};

// 레이스 결과 상태
export const STATUS_KR: Record<string, string> = {
  'Finished': '완주',
  '+1 Lap': '+1 랩',
  '+2 Laps': '+2 랩',
  '+3 Laps': '+3 랩',
  'Retired': '리타이어',
  'Disqualified': '실격',
  'Not classified': '미분류',
  'Withdrew': '기권',
  'Accident': '사고',
  'Collision': '충돌',
  'Engine': '엔진',
  'Gearbox': '기어박스',
  'Hydraulics': '유압',
  'Brakes': '브레이크',
  'Suspension': '서스펜션',
  'Electrical': '전기 계통',
  'Power Unit': '파워유닛',
  'Spun off': '스핀 아웃',
};

// 국가명 매핑
export const COUNTRY_NAMES_KR: Record<string, string> = {
  'Bahrain': '바레인',
  'Saudi Arabia': '사우디아라비아',
  'Australia': '호주',
  'Japan': '일본',
  'China': '중국',
  'USA': '미국',
  'United States': '미국',
  'Italy': '이탈리아',
  'Monaco': '모나코',
  'Spain': '스페인',
  'Canada': '캐나다',
  'Austria': '오스트리아',
  'UK': '영국',
  'United Kingdom': '영국',
  'Hungary': '헝가리',
  'Belgium': '벨기에',
  'Netherlands': '네덜란드',
  'Singapore': '싱가포르',
  'Mexico': '멕시코',
  'Brazil': '브라질',
  'Qatar': '카타르',
  'Abu Dhabi': '아부다비',
  'UAE': '아부다비',
  'Azerbaijan': '아제르바이잔',
  'Las Vegas': '라스베이거스',
  'Miami': '마이애미',
};

// UI 레이블
export const UI_LABELS = {
  dashboard: '대시보드',
  driverStandings: '드라이버 스탠딩',
  constructorStandings: '컨스트럭터 스탠딩',
  raceSchedule: '레이스 스케줄',
  raceResults: '레이스 결과',
  telemetry: '텔레메트리',
  season: '시즌',
  position: '순위',
  points: '포인트',
  wins: '우승',
  podium: '포디움',
  polePosition: '폴 포지션',
  fastestLap: '패스티스트 랩',
  grid: '그리드',
  gap: '갭',
  interval: '인터벌',
  lap: '랩',
  lapTime: '랩타임',
  sector: '섹터',
  speed: '속도',
  throttle: '스로틀',
  brake: '브레이크',
  rpm: 'RPM',
  gear: '기어',
  drs: 'DRS',
  pitStop: '피트 스톱',
  driver: '드라이버',
  team: '팀',
  circuit: '서킷',
  round: '라운드',
  nextRace: '다음 레이스',
  lastRace: '최근 레이스 결과',
  teamRadio: '팀 라디오',
  loading: '데이터 로딩 중...',
  error: '데이터를 불러올 수 없습니다',
  noData: '데이터가 없습니다',
  km_h: 'km/h',
} as const;

// 팀 컬러 (공식 브랜드 컬러)
export const TEAM_COLORS: Record<string, string> = {
  'McLaren': '#FF8000',
  'Mercedes': '#27F4D2',
  'Red Bull': '#3671C6',
  'Red Bull Racing': '#3671C6',
  'Ferrari': '#E8002D',
  'Williams': '#64C4FF',
  'RB': '#6692FF',
  'Racing Bulls': '#6692FF',
  'AlphaTauri': '#6692FF',
  'Aston Martin': '#229971',
  'Haas F1 Team': '#B6BABD',
  'Haas': '#B6BABD',
  'Kick Sauber': '#52E252',
  'Sauber': '#52E252',
  'Audi': '#52E252',
  'Alpine F1 Team': '#0093CC',
  'Alpine': '#0093CC',
  'Alfa Romeo': '#C92D4B',
  'Cadillac': '#FFD700',
};

// 서킷 이름 매핑
export const CIRCUIT_NAMES_KR: Record<string, string> = {
  'Sakhir': '사히르',
  'Jeddah': '제다',
  'Melbourne': '멜버른',
  'Suzuka': '스즈카',
  'Shanghai': '상하이',
  'Miami': '마이애미',
  'Imola': '이몰라',
  'Monaco': '모나코',
  'Montreal': '몬트리올',
  'Barcelona': '바르셀로나',
  'Spielberg': '슈필베르크',
  'Silverstone': '실버스톤',
  'Budapest': '부다페스트',
  'Spa': '스파',
  'Zandvoort': '잔드보르트',
  'Monza': '몬차',
  'Baku': '바쿠',
  'Singapore': '싱가포르',
  'Austin': '오스틴',
  'Mexico City': '멕시코시티',
  'Sao Paulo': '상파울루',
  'Las Vegas': '라스베이거스',
  'Lusail': '루사일',
  'Yas Marina': '야스 마리나',
  'Marina Bay': '마리나 베이',
  'Hungaroring': '헝가로링',
  'Interlagos': '인텔라고스',
  'Catalunya': '카탈루냐',
};

// 유틸리티 함수
export function getTeamNameKR(name: string): string {
  return TEAM_NAMES_KR[name] || name;
}

export function getDriverNameKR(driverId: string, fallbackName?: string): string {
  return DRIVER_NAMES_KR[driverId] || fallbackName || driverId;
}

export function getSessionNameKR(name: string): string {
  return SESSION_NAMES_KR[name] || name;
}

export function getCircuitNameKR(name: string): string {
  return CIRCUIT_NAMES_KR[name] || name;
}

export function getStatusKR(status: string): string {
  return STATUS_KR[status] || status;
}

export function getCountryNameKR(country: string): string {
  return COUNTRY_NAMES_KR[country] || country;
}

export function getTeamColor(teamName: string): string {
  return TEAM_COLORS[teamName] || '#888888';
}
