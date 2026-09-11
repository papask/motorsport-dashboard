import { BrowserRouter, Routes, Route, NavLink, Link, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Dashboard from './pages/Dashboard';
import DriverStandings from './pages/DriverStandings';
import ConstructorStandings from './pages/ConstructorStandings';
import RaceSchedule from './pages/RaceSchedule';
import RaceResults from './pages/RaceResults';
import RaceTimeline from './pages/RaceTimeline';
import Telemetry from './pages/Telemetry';
import RaceIncidents from './pages/RaceIncidents';
import HeaderCountdown from './components/HeaderCountdown';
import { useLang, useT, type Lang } from './i18n';
import './index.css';

// Nav labels are resolved per-language; `id` is a stable key used for layout
// decisions (e.g. where the season selector attaches) so it survives translation.
function getNavItems(t: (k: any) => string) {
  return [
    { id: 'schedule', path: '/schedule', label: t('navSchedule'), icon: '📅' },
    {
      id: 'standings',
      label: t('navStandings'),
      icon: '🏆',
      children: [
        { path: '/drivers', label: t('navDrivers'), icon: '👤' },
        { path: '/constructors', label: t('navConstructors'), icon: '🏎️' },
      ],
    },
    {
      id: 'review',
      label: t('navReview'),
      icon: '🔍',
      children: [
        { path: '/results', label: t('navResults'), icon: '🏁' },
        { path: '/timeline', label: t('navTimeline'), icon: '📈' },
      ],
    },
  ];
}

const CURRENT_YEAR = new Date().getFullYear();
const EARLIEST_YEAR = 2023;
const AVAILABLE_YEARS = Array.from(
  { length: CURRENT_YEAR - EARLIEST_YEAR + 1 },
  (_, i) => CURRENT_YEAR - i
);

function YearSelect({ selectedYear, setSelectedYear }: { selectedYear: number; setSelectedYear: (y: number) => void }) {
  const t = useT();
  return (
    <div className="top-nav-season">
      <div className="season-label">{t('seasonSelectLabel')}</div>
      <select
        className="season-select"
        value={selectedYear}
        onChange={(e) => setSelectedYear(Number(e.target.value))}
      >
        {AVAILABLE_YEARS.map((y) => (
          <option key={y} value={y}>{t('seasonOption', { year: y })}</option>
        ))}
      </select>
    </div>
  );
}

function LangToggle() {
  const { lang, setLang } = useLang();
  const t = useT();
  const options: Lang[] = ['ko', 'en'];
  return (
    <div className="lang-toggle" role="group" aria-label={t('langToggleAria')}>
      {options.map((l) => (
        <button
          key={l}
          className={`lang-btn ${lang === l ? 'active' : ''}`}
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
        >
          {l === 'ko' ? '한' : 'EN'}
        </button>
      ))}
    </div>
  );
}

function NavContent({ selectedYear, setSelectedYear }: { selectedYear: number; setSelectedYear: (y: number) => void }) {
  const location = useLocation();
  const t = useT();
  const navItems = getNavItems(t);

  return (
    <nav className="top-nav-links">
      {navItems.map((item) => {
        if (item.children) {
          const isChildActive = item.children.some((child) => location.pathname === child.path);
          return (
            <div key={item.id} className="nav-item-container-group">
              <div className="nav-item-container">
                <div className={`nav-link ${isChildActive ? 'active' : ''}`} style={{ cursor: 'default' }}>
                  <span className="nav-icon">{item.icon}</span>
                  {item.label}
                  <span className="nav-chevron">▼</span>
                </div>
                <div className="dropdown-menu">
                  {item.children.map((child) => (
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
              {item.id === 'review' && (
                <YearSelect selectedYear={selectedYear} setSelectedYear={setSelectedYear} />
              )}
            </div>
          );
        }

        return (
          <NavLink
            key={item.path}
            to={item.path!}
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

function Header({ selectedYear, setSelectedYear }: { selectedYear: number; setSelectedYear: (y: number) => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const t = useT();

  // Close the mobile drawer whenever the route changes.
  useEffect(() => { setMenuOpen(false); }, [location]);

  return (
    <header className="top-nav">
      <Link to="/" className="top-nav-logo" aria-label={t('homeAria')}>
        <h1>{t('logoTitle')}</h1>
        <span>{t('logoSubtitle')}</span>
      </Link>
      <div className={`top-nav-drawer ${menuOpen ? 'open' : ''}`}>
        <NavContent selectedYear={selectedYear} setSelectedYear={setSelectedYear} />
      </div>
      <HeaderCountdown year={selectedYear} />
      <LangToggle />
      <button
        className={`nav-hamburger ${menuOpen ? 'open' : ''}`}
        aria-label={t('menuAria')}
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((v) => !v)}
      >
        <span /><span /><span />
      </button>
      {menuOpen && <div className="nav-overlay" onClick={() => setMenuOpen(false)} />}
    </header>
  );
}

function App() {
  const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR);
  // Subscribe App to language changes so the whole page tree re-renders (and
  // every translated string re-evaluates) when the language flips.
  const { lang } = useLang();

  return (
    <BrowserRouter>
      <div className="app-layout" data-lang={lang}>
        <Header selectedYear={selectedYear} setSelectedYear={setSelectedYear} />
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
