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
import { useTheme, type ThemePref } from './theme/useTheme';
import './index.css';

// Nav labels are resolved per-language; `id` is a stable key used for layout
// decisions (e.g. where the season selector attaches) so it survives translation.
function getNavItems(t: (k: any) => string) {
  return [
    { id: 'schedule', path: '/schedule', label: t('navSchedule') },
    {
      id: 'standings',
      label: t('navStandings'),
      children: [
        { path: '/drivers', label: t('navDrivers') },
        { path: '/constructors', label: t('navConstructors') },
      ],
    },
    {
      id: 'review',
      label: t('navReview'),
      children: [
        { path: '/results', label: t('navResults') },
        { path: '/timeline', label: t('navTimeline') },
      ],
    },
    {
      id: 'analysis',
      label: t('navAnalysis'),
      children: [
        { path: '/telemetry', label: t('navTelemetry') },
        { path: '/incidents', label: t('navIncidents') },
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

// System / light / dark. "System" sets no attribute, so the palette follows
// prefers-color-scheme — that is the default the design calls for.
function ThemeToggle() {
  const { pref, setPref } = useTheme();
  const t = useT();
  const options: { value: ThemePref; label: string }[] = [
    { value: 'system', label: t('themeSystem') },
    { value: 'light', label: t('themeLight') },
    { value: 'dark', label: t('themeDark') },
  ];
  return (
    <div className="theme-toggle" role="group" aria-label={t('themeToggleAria')}>
      {options.map((o) => (
        <button
          key={o.value}
          className={`theme-btn ${pref === o.value ? 'active' : ''}`}
          onClick={() => setPref(o.value)}
          aria-pressed={pref === o.value}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function NavContent({ selectedYear, setSelectedYear }: { selectedYear: number; setSelectedYear: (y: number) => void }) {
  const location = useLocation();
  const t = useT();
  const navItems = getNavItems(t);

  // Picking an item should dismiss its menu straight away. Hover alone cannot:
  // after the click the pointer is still inside the menu, so it would stay open
  // until the user moved away. This marks the group as dismissed until the
  // pointer or focus actually leaves it.
  const [dismissed, setDismissed] = useState<string | null>(null);

  return (
    <nav className="top-nav-links">
      {navItems.map((item) => {
        if (item.children) {
          const isChildActive = item.children.some((child) => location.pathname === child.path);
          return (
            <div key={item.id} className="nav-item-container-group">
              <div
                className={`nav-item-container ${dismissed === item.id ? 'is-dismissed' : ''}`}
                onFocus={(e) => {
                  // Only a keyboard arrival re-opens a dismissed menu. Testing
                  // :focus-visible is what separates that from the focus a mouse
                  // click leaves behind, which must not re-open it.
                  if ((e.target as HTMLElement).matches(':focus-visible')) {
                    setDismissed((d) => (d === item.id ? null : d));
                  }
                }}
              >
                {/* A button, not a div: the dropdown opens on focus as well as
                    hover, so the group is reachable by keyboard.

                    Re-entering the trigger is what clears a dismissal. Clearing
                    it on the container's mouseleave would loop: hiding the menu
                    moves the pointer out of the container, which would clear the
                    dismissal and re-open the menu under the same pointer. */}
                <button
                  type="button"
                  className={`nav-link nav-group-trigger ${isChildActive ? 'active' : ''}`}
                  aria-expanded={undefined}
                  onMouseEnter={() => setDismissed((d) => (d === item.id ? null : d))}
                >
                  {item.label}
                  <span className="nav-chevron">▼</span>
                </button>
                <div className="dropdown-menu">
                  {item.children.map((child) => (
                    <NavLink
                      key={child.path}
                      to={child.path}
                      className={({ isActive }) => `dropdown-item ${isActive ? 'active' : ''}`}
                      onClick={() => setDismissed(item.id)}
                    >
                      {child.label}
                    </NavLink>
                  ))}
                </div>
              </div>
              {item.id === 'analysis' && (
                <div className="nav-tail">
                  <YearSelect selectedYear={selectedYear} setSelectedYear={setSelectedYear} />
                  {/* Below 768px the header has no room for these, so the
                      drawer carries them at its foot — as the canvas shows. */}
                  <div className="drawer-only">
                    <LangToggle />
                    <ThemeToggle />
                  </div>
                </div>
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
  const { lang } = useLang();
  // Korean UI shows the "F1 온더리밋" lockup, English the ONTHELIMIT wordmark.
  const logoVariant = lang === 'en' ? 'en' : 'compact';

  // Close the mobile drawer whenever the route changes.
  useEffect(() => { setMenuOpen(false); }, [location]);

  return (
    <header className="top-nav">
      <Link to="/" className="top-nav-logo" aria-label={t('homeAria')}>
        {/* Both theme variants are rendered; CSS shows the one matching the
            active palette, so it follows system/light/dark like the tokens. */}
        <h1>
          <img className="brand-logo brand-logo--light" src={`/brand/onthelimit-logo-${logoVariant}-light.svg`} alt={t('logoTitle')} />
          <img className="brand-logo brand-logo--dark" src={`/brand/onthelimit-logo-${logoVariant}-dark.svg`} alt={t('logoTitle')} />
        </h1>
      </Link>
      <div className={`top-nav-drawer ${menuOpen ? 'open' : ''}`}>
        <NavContent selectedYear={selectedYear} setSelectedYear={setSelectedYear} />
      </div>
      <HeaderCountdown year={selectedYear} />
      <div className="header-only">
        <LangToggle />
        <ThemeToggle />
      </div>
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
