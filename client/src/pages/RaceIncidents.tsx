import { useState, useEffect } from 'react';
import { getSessions, getRaceIncidents } from '../services/api';
import { useApi } from '../hooks/useApi';

interface Incident {
  type: string;
  startLap: number;
  endLap?: number;
  message: string;
  timestamp: string;
  key?: string;
}

function RaceIncidents({ year }: { year: number }) {
  const [selectedSession, setSelectedSession] = useState<number | null>(null);
  const [filterType, setFilterType] = useState<string>('All');
  const [isPreOpen, setIsPreOpen] = useState(false);
  const [isPostOpen, setIsPostOpen] = useState(false);
  
  const { data: sessions } = useApi(() => getSessions(year), [year]);
  const { data: incidents, loading: incidentsLoading, error } = useApi(
    (signal?: AbortSignal) => (selectedSession ? getRaceIncidents(selectedSession, signal) : Promise.resolve([])),
    [selectedSession]
  );

  useEffect(() => {
    if (sessions && sessions.length > 0 && !selectedSession) {
      // Find the first Race session (usually the main event)
      const raceSession = sessions.find((s: any) => s.sessionType === 'Race');
      if (raceSession) setSelectedSession(raceSession.sessionKey);
      else setSelectedSession(sessions[0].sessionKey);
    }
  }, [sessions, selectedSession]);

  const getIncidentClass = (type: string) => {
    switch (type) {
      case 'Safety Car': return 'incident-sc';
      case 'VSC': return 'incident-vsc';
      case 'Yellow Flag': return 'incident-yellow';
      case 'Red Flag': return 'incident-red';
      default: return 'incident-other';
    }
  };

  const incidentTypes = ['All', ...Array.from(new Set(incidents?.map((i: Incident) => i.type) || []))];
  
  const filteredIncidents = (incidents as Incident[] | undefined)?.filter((incident: Incident) => 
    filterType === 'All' || incident.type === filterType
  );

  const formatTime = (timestamp: string) => {
    if (!timestamp) return '-';
    try {
      // OpenF1 timestamps are UTC but often lack the 'Z' suffix
      const utcTimestamp = timestamp.endsWith('Z') || timestamp.includes('+') ? timestamp : `${timestamp}Z`;
      const date = new Date(utcTimestamp);
      return date.toLocaleTimeString(undefined, { 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit',
        hour12: false 
      });
    } catch (e) {
      return timestamp;
    }
  };

  const splitIncidents = () => {
    if (!filteredIncidents) return { pre: [], session: [], post: [] };
    
    const startedIdx = filteredIncidents.findIndex(i => 
      i.message.toUpperCase().includes('SESSION STARTED')
    );
    const finishedIdx = filteredIncidents.findIndex(i => 
      i.message.toUpperCase().includes('SESSION FINISHED')
    );
    
    if (startedIdx === -1) {
      return { pre: [], session: filteredIncidents, post: [] };
    }
    
    const pre = filteredIncidents.slice(0, startedIdx);
    
    if (finishedIdx === -1) {
      return { pre, session: filteredIncidents.slice(startedIdx), post: [] };
    }
    
    return {
      pre,
      session: filteredIncidents.slice(startedIdx, finishedIdx + 1),
      post: filteredIncidents.slice(finishedIdx + 1)
    };
  };

  const { pre, session, post } = splitIncidents();

  const renderTable = (items: Incident[], emptyMessage: string = '기록된 인시던트가 없습니다.') => (
    <table className="data-table">
      <thead>
        <tr>
          <th>유형</th>
          <th>발생 시간</th>
          <th>시작 (Lap)</th>
          <th>종료 (Lap)</th>
          <th>지속</th>
          <th>상세 내용</th>
        </tr>
      </thead>
      <tbody>
        {items && items.length > 0 ? (
          items.map((incident: Incident, idx: number) => {
            const duration = incident.endLap !== undefined ? incident.endLap - incident.startLap : 0;
            return (
              <tr key={idx}>
                <td>
                  <span className={`badge ${getIncidentClass(incident.type)}`}>
                    {incident.type}
                  </span>
                </td>
                <td className="time-cell">{formatTime(incident.timestamp)}</td>
                <td>{incident.startLap}</td>
                <td>{incident.endLap || '-'}</td>
                <td>{duration > 0 ? `${duration} Laps` : (incident.endLap !== undefined ? 'Instant' : 'Ongoing')}</td>
                <td className="message-cell">{incident.message}</td>
              </tr>
            );
          })
        ) : (
          <tr>
            <td colSpan={6} className="empty-state">{emptyMessage}</td>
          </tr>
        )}
      </tbody>
    </table>
  );

  return (
    <div className="page-container">
      <header className="page-header">
        <div className="header-title">
          <h2>레이스 인시던트</h2>
          <p>{year} 시즌 중요 이벤트 요약</p>
        </div>
        
        <div className="header-controls">
          <div className="filter-group">
            <span className="filter-label">세션:</span>
            <select 
              className="session-select"
              value={selectedSession || ''} 
              onChange={(e) => setSelectedSession(Number(e.target.value))}
            >
              {sessions?.map((s: any) => (
                <option key={s.sessionKey} value={s.sessionKey}>
                  {s.circuitShortName} - {s.sessionName}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <span className="filter-label">유형 필터:</span>
            <select 
              className="session-select"
              value={filterType} 
              onChange={(e) => setFilterType(e.target.value)}
            >
              {(incidentTypes as string[]).map((type: string) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>
        </div>
      </header>

      {incidentsLoading ? (
        <div className="loading-state">인시던트 데이터를 분석 중입니다...</div>
      ) : error ? (
        <div className="error-state">데이터를 불러오는 중 오류가 발생했습니다.</div>
      ) : (
        <div className="incidents-layout">
          {/* 세션 시작 전 섹션 */}
          {pre.length > 0 && (
            <div className="accordion-item">
              <div className="accordion-header" onClick={() => setIsPreOpen(!isPreOpen)}>
                <div className="accordion-title">
                  <span>세션 시작 전 인시던트</span>
                  <span className="badge incident-other">{pre.length}</span>
                </div>
                <div className={`accordion-icon ${isPreOpen ? 'open' : ''}`}>▼</div>
              </div>
              {isPreOpen && (
                <div className="accordion-content card">
                  {renderTable(pre)}
                </div>
              )}
            </div>
          )}

          {/* 메인 세션 섹션 */}
          <div className="main-incidents card">
            <div className="card-title">세션 중 인시던트</div>
            {renderTable(session)}
          </div>

          {/* 세션 종료 후 섹션 */}
          {post.length > 0 && (
            <div className="accordion-item">
              <div className="accordion-header" onClick={() => setIsPostOpen(!isPostOpen)}>
                <div className="accordion-title">
                  <span>세션 종료 후 인시던트</span>
                  <span className="badge incident-other">{post.length}</span>
                </div>
                <div className={`accordion-icon ${isPostOpen ? 'open' : ''}`}>▼</div>
              </div>
              {isPostOpen && (
                <div className="accordion-content card">
                  {renderTable(post)}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default RaceIncidents;
