import React, { useState, useEffect, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import axios from 'axios';

const STATUS_COLORS = { green: '#3fb950', yellow: '#d29922', red: '#f85149' };

// SVG Circular Progress Ring for S.M.A.R.T health %
function SmartProgressRing({ pct }) {
  const radius = 24;
  const strokeWidth = 4;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  let color = '#3fb950'; // green
  if (pct < 50) color = '#f85149'; // red
  else if (pct < 85) color = '#d29922'; // yellow

  return (
    <div style={{ position: 'relative', width: 56, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <svg width="56" height="56" viewBox="0 0 56 56">
        <circle
          cx="28"
          cy="28"
          r={radius}
          fill="transparent"
          stroke="#47484c"
          strokeWidth={strokeWidth}
        />
        <circle
          cx="28"
          cy="28"
          r={radius}
          fill="transparent"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 28 28)"
          style={{ transition: 'stroke-dashoffset 0.4s ease' }}
        />
      </svg>
      <div style={{ position: 'absolute', fontSize: 11, fontWeight: 700, color: '#ffffff' }}>
        {pct}%
      </div>
    </div>
  );
}

function StatusCard({ server, onCollect, onSmart }) {
  const color = STATUS_COLORS[server.status_color] || '#a0a0a8';
  const h = server.health || {};
  return (
    <div className="info-card" style={{ ...cardStyles.card, borderLeft: `4px solid ${color}` }}>
      <div style={cardStyles.header}>
        <div>
          <div style={cardStyles.name}>{server.name}</div>
          <div style={cardStyles.ip}>{server.ip}</div>
        </div>
        <span style={{ ...cardStyles.dot, color }}>{server.status?.toUpperCase()}</span>
      </div>
      
      <div style={cardStyles.metrics}>
        {[['CPU', h.cpu, '#3fb950'], ['RAM', h.ram, '#58a6ff'], ['Disk', h.disk, '#f0883e']].map(([label, val, clr]) => (
          <div key={label} style={cardStyles.metric}>
            <span style={cardStyles.metricLabel}>{label}</span>
            <div style={cardStyles.bar}>
              <div style={{ ...cardStyles.fill, width: `${val || 0}%`, background: clr }} />
            </div>
            <span style={cardStyles.metricVal}>{val != null ? `${val.toFixed(1)}%` : '0.0%'}</span>
          </div>
        ))}
      </div>

      {h.smart_status && (
        <div style={cardStyles.smart}>
          S.M.A.R.T Status: <span style={{ color: h.smart_status === 'PASSED' ? '#3fb950' : '#f85149', fontWeight: 600 }}>{h.smart_status}</span>
        </div>
      )}

      <div style={cardStyles.actions}>
        <button className="btn-accent" onClick={() => onCollect(server.id)} style={{ height: 32, padding: '0 16px', borderRadius: 20, fontSize: 12 }}>
          🔄 Refresh
        </button>
        <button className="btn-outlined-accent" onClick={() => onSmart(server.id)} style={{ height: 32, padding: '0 16px', borderRadius: 20, fontSize: 12 }}>
          ⚡ S.M.A.R.T
        </button>
      </div>
    </div>
  );
}

function TrendChart({ serverId, serverName }) {
  const [data, setData] = useState([]);

  useEffect(() => {
    axios.get(`/api/health/${serverId}/trends`).then(r => {
      setData(r.data.map(d => ({
        ...d,
        time: new Date(d.timestamp).toLocaleDateString()
      })));
    }).catch(() => {});
  }, [serverId]);

  return (
    <div className="info-card" style={trendStyles.wrap}>
      <div style={trendStyles.title}>{serverName} — 7-Day Resource Trend</div>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#47484c" />
          <XAxis dataKey="time" tick={{ fill: '#a0a0a8', fontSize: 10 }} />
          <YAxis domain={[0, 100]} tick={{ fill: '#a0a0a8', fontSize: 10 }} />
          <Tooltip contentStyle={{ background: '#2a2b2f', border: '1px solid #47484c', color: '#ffffff', fontSize: 12, borderRadius: 8 }} />
          <Legend wrapperStyle={{ fontSize: 12, color: '#a0a0a8' }} />
          <Line type="monotone" dataKey="cpu" stroke="#3fb950" dot={false} strokeWidth={2} name="CPU" />
          <Line type="monotone" dataKey="ram" stroke="#58a6ff" dot={false} strokeWidth={2} name="RAM" />
          <Line type="monotone" dataKey="disk" stroke="#f0883e" dot={false} strokeWidth={2} name="Disk" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function Health() {
  const [servers, setServers] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [smartResults, setSmartResults] = useState({});
  const [auditLogs, setAuditLogs] = useState([]);
  const [activeView, setActiveView] = useState('overview');
  const [pdfLoading, setPdfLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    const [healthRes, alertsRes, auditRes] = await Promise.all([
      axios.get('/api/health'),
      axios.get('/api/health/alerts'),
      axios.get('/api/health/audit-logs')
    ]);
    setServers(healthRes.data);
    setAlerts(alertsRes.data);
    setAuditLogs(auditRes.data);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const collectHealth = async (serverId) => {
    await axios.post(`/api/health/${serverId}/collect`);
    fetchAll();
  };

  const runSmart = async (serverId) => {
    const res = await axios.get(`/api/health/${serverId}/smart`);
    setSmartResults(prev => ({ ...prev, [serverId]: res.data }));
  };

  const downloadPDF = async () => {
    setPdfLoading(true);
    try {
      const res = await axios.get('/api/health/report/pdf', { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a'); a.href = url; a.download = 'infraguard_report.pdf'; a.click();
    } finally { setPdfLoading(false); }
  };

  // Local Dismiss Alert Functionality
  const dismissAlert = (alertId) => {
    setAlerts(prev => prev.filter(a => a.id !== alertId));
  };

  const criticalCount = servers.filter(s => s.status_color === 'red').length;
  const warnCount = servers.filter(s => s.status_color === 'yellow').length;

  return (
    <div>
      <div style={styles.topBar}>
        <div style={styles.summary}>
          <span style={styles.summaryItem('#3fb950')}>● {servers.filter(s => s.status_color === 'green').length} Healthy</span>
          <span style={styles.summaryItem('#d29922')}>● {warnCount} Warning</span>
          <span style={styles.summaryItem('#f85149')}>● {criticalCount} Critical</span>
        </div>
        <div style={styles.actions}>
          {['overview', 'trends', 'alerts', 'audit'].map(v => (
            <button key={v} style={{ ...styles.tab, ...(activeView === v ? styles.tabActive : {}) }}
              onClick={() => setActiveView(v)}>
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
          <button className="btn-accent" onClick={downloadPDF} disabled={pdfLoading} style={{ height: 36, borderRadius: 8, padding: '0 16px', fontWeight: 600 }}>
            {pdfLoading ? '⏳ Generating...' : '📄 PDF Report'}
          </button>
        </div>
      </div>

      {activeView === 'overview' && (
        <div style={styles.grid}>
          {servers.map(s => (
            <div key={s.id} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <StatusCard server={s} onCollect={collectHealth} onSmart={runSmart} />
              
              {/* S.M.A.R.T Circular Progress Card */}
              {smartResults[s.id] && (
                <div className="info-card" style={styles.smartBox}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={styles.smartTitle}>S.M.A.R.T Health — {s.name}</div>
                      <div style={styles.smartMeta}>
                        Status: <strong style={{ color: smartResults[s.id].status === 'PASSED' ? '#3fb950' : '#f85149' }}>
                          {smartResults[s.id].status}
                        </strong>
                      </div>
                      {smartResults[s.id].days_remaining != null && (
                        <div style={{ ...styles.smartMeta, marginTop: 4, color: smartResults[s.id].days_remaining < 30 ? '#f85149' : '#a0a0a8' }}>
                          Est. {smartResults[s.id].days_remaining} days remaining
                        </div>
                      )}
                    </div>
                    <SmartProgressRing pct={smartResults[s.id].health_pct || 0} />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {activeView === 'trends' && (
        <div style={styles.grid}>
          {servers.map(s => <TrendChart key={s.id} serverId={s.id} serverName={s.name} />)}
        </div>
      )}

      {activeView === 'alerts' && (
        <div className="info-card" style={styles.card}>
          <h3 style={styles.cardTitle}>Alerts Feed ({alerts.length})</h3>
          {alerts.length === 0 ? (
            <div style={styles.empty}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🔔</div>
              <div>All systems operational. No active alerts.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {alerts.map(a => (
                <div key={a.id} className="info-card" style={styles.alertRow(a.severity)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                    <span style={styles.severityBadge(a.severity)}>{a.severity}</span>
                    <span style={{ color: '#ffffff', fontSize: 14 }}>{a.message}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <span style={styles.dimText}>{new Date(a.timestamp).toLocaleString()}</span>
                    <button
                      className="btn-outlined-danger"
                      onClick={() => dismissAlert(a.id)}
                      style={{ height: 26, padding: '0 12px', fontSize: 11, borderRadius: 12 }}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeView === 'audit' && (
        <div className="info-card" style={styles.card}>
          <h3 style={styles.cardTitle}>Audit Activity Logs</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.thRow}>
                  {['Time', 'User ID', 'Action', 'Target'].map(h => <th key={h} style={styles.th}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {auditLogs.map(l => (
                  <tr key={l.id} style={styles.tr}>
                    <td style={styles.td}>{new Date(l.timestamp).toLocaleString()}</td>
                    <td style={styles.td}><span style={{ color: '#58a6ff', fontWeight: 600 }}>{l.user_id}</span></td>
                    <td style={styles.td}><span style={styles.actionChip}>{l.action}</span></td>
                    <td style={styles.td} style={{ fontFamily: 'monospace', color: '#a0a0a8' }}>{l.target}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  topBar: { display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, flexWrap: 'wrap' },
  summary: { display: 'flex', gap: 16 },
  summaryItem: (c) => ({ color: c, fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }),
  actions: { display: 'flex', gap: 8, marginLeft: 'auto', flexWrap: 'wrap', alignItems: 'center' },
  tab: { background: '#2a2b2f', color: '#a0a0a8', border: '1px solid #47484c', borderRadius: 20, padding: '8px 18px', cursor: 'pointer', fontSize: 13, fontWeight: 500, transition: 'all 200ms ease' },
  tabActive: { background: '#58a6ff', color: '#ffffff', border: '1px solid #58a6ff' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20 },
  card: { background: '#2a2b2f', borderRadius: 12, padding: 20, border: '1px solid #47484c', marginBottom: 24 },
  cardTitle: { color: '#ffffff', fontSize: 16, fontWeight: 600, marginBottom: 20, marginTop: 0 },
  smartBox: { background: '#2a2b2f', borderRadius: 12, padding: 16, border: '1px solid #47484c' },
  smartTitle: { color: '#ffffff', fontSize: 13, fontWeight: 600, marginBottom: 6 },
  smartMeta: { fontSize: 13, color: '#a0a0a8' },
  
  alertRow: (sev) => {
    let borderColor = '#58a6ff'; // info
    if (sev === 'critical') borderColor = '#f85149';
    else if (sev === 'warning') borderColor = '#d29922';
    
    return {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px 20px',
      borderLeft: `4px solid ${borderColor}`,
      borderRadius: 12,
      background: '#2a2b2f',
      border: '1px solid #47484c',
      borderLeftWidth: 4,
      flexWrap: 'wrap',
      gap: 12
    };
  },
  
  severityBadge: (sev) => {
    let bg = '#1a2a3a';
    let col = '#58a6ff';
    if (sev === 'critical') { bg = '#3a1a1a'; col = '#f85149'; }
    else if (sev === 'warning') { bg = '#3a3a1a'; col = '#d29922'; }
    
    return {
      background: bg,
      color: col,
      padding: '4px 10px',
      borderRadius: 12,
      fontSize: 11,
      fontWeight: 700,
      textTransform: 'uppercase'
    };
  },
  
  dimText: { color: '#a0a0a8', fontSize: 12 },
  empty: { color: '#a0a0a8', fontSize: 13, textAlign: 'center', padding: '48px 0', display: 'flex', flexDirection: 'column', alignItems: 'center' },
  
  // Table style
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  thRow: { background: '#1e2023' },
  th: { color: '#a0a0a8', fontWeight: 500, padding: '12px 16px', textAlign: 'left', borderBottom: '1px solid #47484c', fontSize: 12, textTransform: 'uppercase' },
  tr: { borderBottom: '1px solid #47484c', height: 48, transition: 'background 150ms ease' },
  td: { color: '#ffffff', padding: '12px 16px' },
  actionChip: { background: '#1a2a3a', color: '#58a6ff', padding: '4px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600 }
};

const cardStyles = {
  card: { background: '#2a2b2f', borderRadius: 12, padding: 20, border: '1px solid #47484c', transition: 'border-color 200ms ease' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  name: { color: '#ffffff', fontWeight: 600, fontSize: 15 },
  ip: { color: '#a0a0a8', fontSize: 12, fontFamily: 'monospace' },
  dot: { fontSize: 12, fontWeight: 700 },
  metrics: { display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 },
  metric: { display: 'flex', alignItems: 'center', gap: 10 },
  metricLabel: { color: '#a0a0a8', fontSize: 12, width: 36 },
  bar: { flex: 1, background: '#47484c', borderRadius: 3, height: 6, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3, transition: 'width 0.5s ease' },
  metricVal: { color: '#ffffff', fontSize: 12, width: 44, textAlign: 'right', fontWeight: 600 },
  smart: { color: '#a0a0a8', fontSize: 12, marginBottom: 16 },
  actions: { display: 'flex', gap: 10 }
};

const trendStyles = {
  wrap: { background: '#2a2b2f', borderRadius: 12, padding: 20, border: '1px solid #47484c' },
  title: { color: '#ffffff', fontSize: 14, fontWeight: 600, marginBottom: 16 }
};
