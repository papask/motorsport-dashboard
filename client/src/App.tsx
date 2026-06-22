import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { useState } from 'react';
import Dashboard from './pages/Dashboard';
import DriverStandings from './pages/DriverStandings';
import ConstructorStandings from './pages/ConstructorStandings';
import RaceSchedule from './pages/RaceSchedule';
import RaceResults from './pages/RaceResults';
import RaceTimeline from './pages/RaceTimeline';
import Telemetry from './pages/Telemetry';
import RaceIncidents from './pages/RaceIncidents';
import './index.css';

const NAV_ITEMS = [
  { path: '/', label: '대시보드', icon: '🏠' },
  { 
    label: '스탠딩', 
    icon: '🏆',
    children: [
      { path: '/drivers', label: '드라이버', icon: '👤' },
      { path: '/constructors', label: '컨스트럭터', icon: '🏎️' },
    ]
  },
  { path: '/schedule', label: '스케줄', icon: '📅' },
  { 
    label: '리뷰', 
    icon: '🔍',
    children: [
      { path: '/results', label: '레이스 결과', icon: '🏁' },
      { path: '/timeline', label: '타임라인', icon: '📈' },
    ]
  },
  { 
    label: '분석', 
    icon: '📊',
    children: [
      { path: '/telemetry', label: '텔레메트리', icon: '⚡' },
      { path: '/incidents', label: '인시던트', icon: '🚩' },
    ]
  },
];

const AVAILABLE_YEARS = [2026, 2025, 2024, 2023];

function NavContent({ NAV_ITEMS }: { NAV_ITEMS: any[] }) {
  const location = useLocation();
  
  return (
    <nav className="top-nav-links">
      {NAV_ITEMS.map((item) => {
        if (item.children) {
          const isChildActive = item.children.some((child: any) => location.pathname === child.path);
          return (
            <div key={item.label} className="nav-item-container">
              <div className={`nav-link ${isChildActive ? 'active' : ''}`} style={{ cursor: 'default' }}>
                <span className="nav-icon">{item.icon}</span>
                {item.label}
                <span className="nav-chevron">▼</span>
              </div>
              <div className="dropdown-menu">
                {item.children.map((child: any) => (
                  <NavLink
                    key={child.path}
                    to={child.path}
                    className={({ isActive }) => `dropdown-item ${isActive ? 'active' : ''}`}
                  >
                    <span className="dropdown-icon">{child.icon}</span>
                    {child.label}
                  </NavLink>
                ))}
              </div>
            </div>
          );
        }

        return (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            <span className="nav-icon">{item.icon}</span>
            {item.label}
          </NavLink>
        );
      })}
    </nav>
  );
}

function App() {
  const [selectedYear, setSelectedYear] = useState(2025);

  return (
    <BrowserRouter>
      <div className="app-layout">
        <header className="top-nav">
          <div className="top-nav-logo">
            <h1>F1 대시보드</h1>
            <span>모터스포츠 데이터</span>
          </div>
          <NavContent NAV_ITEMS={NAV_ITEMS} />
          <div className="top-nav-season">
            <div className="season-label">시즌 선택</div>
            <select
              className="season-select"
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
            >
              {AVAILABLE_YEARS.map((y) => (
                <option key={y} value={y}>{y} 시즌</option>
              ))}
            </select>
          </div>
        </header>
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Dashboard year={selectedYear} />} />
            <Route path="/drivers" element={<DriverStandings year={selectedYear} />} />
            <Route path="/constructors" element={<ConstructorStandings year={selectedYear} />} />
            <Route path="/schedule" element={<RaceSchedule year={selectedYear} />} />
            <Route path="/results" element={<RaceResults year={selectedYear} />} />
            <Route path="/timeline" element={<RaceTimeline year={selectedYear} />} />
            <Route path="/telemetry" element={<Telemetry year={selectedYear} />} />
            <Route path="/incidents" element={<RaceIncidents year={selectedYear} />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;

