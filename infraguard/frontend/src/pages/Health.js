import React, { useState, useEffect, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import axios from 'axios';

const STATUS_COLORS = { green: '#4ade80', yellow: '#fbbf24', red: '#f87171' };

function StatusCard({ server, onCollect, onSmart }) {
  const color = STATUS_COLORS[server.status_color] || '#94a3b8';
  const h = server.health || {};
  return (
    <div style={{ ...cardStyles.card, borderLeft: `4px solid ${color}` }}>
      <div style={cardStyles.header}>
        <div>
          <div style={cardStyles.name}>{server.name}</div>
          <div style={cardStyles.ip}>{server.ip}</div>
        </div>
        <span style={{ ...cardStyles.dot, color }}>{server.status?.toUpperCase()}</span>
      </div>
      <div style={cardStyles.metrics}>
        {[['CPU', h.cpu, '#3b82f6'], ['RAM', h.ram, '#8b5cf6'], ['Disk', h.disk, '#f59e0b']].map(([label, val, clr]) => (
          <div key={label} style={cardStyles.metric}>
            <span style={cardStyles.metricLabel}>{label}</span>
            <div style={cardStyles.bar}><div style={{ ...cardStyles.fill, width: `${val || 0}%`, background: clr }} /></div>
            <span style={cardStyles.metricVal}>{val != null ? `${val.toFixed(1)}%` : 'N/A'}</span>
          </div>
        ))}
      </div>
      {h.smart_status && (
        <div style={cardStyles.smart}>
          S.M.A.R.T: <span style={{ color: h.smart_status === 'PASSED' ? '#4ade80' : '#f87171' }}>{h.smart_status}</span>
        </div>
      )}
      <div style={cardStyles.actions}>
        <button style={cardStyles.btn('#1d4ed8')} onClick={() => onCollect(server.id)}>Refresh</button>
        <button style={cardStyles.btn('#7c3aed')} onClick={() => onSmart(server.id)}>S.M.A.R.T</button>
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
    <div style={trendStyles.wrap}>
      <div style={trendStyles.title}>{serverName} — 7-Day Trend</div>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 10 }} />
          <YAxis domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 10 }} />
          <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', color: '#f1f5f9', fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
          <Line type="monotone" dataKey="cpu" stroke="#3b82f6" dot={false} strokeWidth={2} name="CPU" />
          <Line type="monotone" dataKey="ram" stroke="#8b5cf6" dot={false} strokeWidth={2} name="RAM" />
          <Line type="monotone" dataKey="disk" stroke="#f59e0b" dot={false} strokeWidth={2} name="Disk" />
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

  const criticalCount = servers.filter(s => s.status_color === 'red').length;
  const warnCount = servers.filter(s => s.status_color === 'yellow').length;

  return (
    <div>
      <div style={styles.topBar}>
        <h2 style={styles.heading}>💚 System Health</h2>
        <div style={styles.summary}>
          <span style={styles.summaryItem('#4ade80')}>✅ {servers.filter(s => s.status_color === 'green').length} Healthy</span>
          <span style={styles.summaryItem('#fbbf24')}>⚠️ {warnCount} Warning</span>
          <span style={styles.summaryItem('#f87171')}>🔴 {criticalCount} Critical</span>
        </div>
        <div style={styles.actions}>
          {['overview', 'trends', 'alerts', 'audit'].map(v => (
            <button key={v} style={{ ...styles.tab, ...(activeView === v ? styles.tabActive : {}) }}
              onClick={() => setActiveView(v)}>
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
          <button style={styles.pdfBtn} onClick={downloadPDF} disabled={pdfLoading}>
            {pdfLoading ? '⏳ Generating...' : '📄 PDF Report'}
          </button>
        </div>
      </div>

      {activeView === 'overview' && (
        <div style={styles.grid}>
          {servers.map(s => (
            <div key={s.id}>
              <StatusCard server={s} onCollect={collectHealth} onSmart={runSmart} />
              {smartResults[s.id] && (
                <div style={styles.smartBox}>
                  <div style={styles.smartTitle}>S.M.A.R.T Results — {s.name}</div>
                  <div style={styles.smartRow}>
                    <span>Status: <strong style={{ color: smartResults[s.id].status === 'PASSED' ? '#4ade80' : '#f87171' }}>
                      {smartResults[s.id].status}</strong></span>
                    <span>Health: <strong style={{ color: '#f1f5f9' }}>{smartResults[s.id].health_pct}%</strong></span>
                    {smartResults[s.id].days_remaining != null && (
                      <span style={{ color: smartResults[s.id].days_remaining < 30 ? '#f87171' : '#4ade80' }}>
                        Est. {smartResults[s.id].days_remaining} days remaining
                      </span>
                    )}
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
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Alerts ({alerts.length})</h3>
          {alerts.length === 0 ? <p style={styles.empty}>No alerts</p> : alerts.map(a => (
            <div key={a.id} style={styles.alertRow(a.severity)}>
              <span style={styles.severityBadge(a.severity)}>{a.severity.toUpperCase()}</span>
              <span style={{ color: '#f1f5f9', flex: 1 }}>{a.message}</span>
              <span style={styles.dimText}>{new Date(a.timestamp).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}

      {activeView === 'audit' && (
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Audit Logs</h3>
          <table style={styles.table}>
            <thead>
              <tr>{['Time', 'User ID', 'Action', 'Target'].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {auditLogs.map(l => (
                <tr key={l.id}>
                  <td style={styles.td}>{new Date(l.timestamp).toLocaleString()}</td>
                  <td style={styles.td}>{l.user_id}</td>
                  <td style={styles.td}><span style={styles.actionChip}>{l.action}</span></td>
                  <td style={styles.td}>{l.target}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const styles = {
  topBar: { display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' },
  heading: { color: '#f1f5f9', fontSize: 22, margin: 0 },
  summary: { display: 'flex', gap: 12 },
  summaryItem: (c) => ({ color: c, fontSize: 13, fontWeight: 600 }),
  actions: { display: 'flex', gap: 6, marginLeft: 'auto', flexWrap: 'wrap' },
  tab: { background: '#1e293b', color: '#94a3b8', border: '1px solid #334155', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 13 },
  tabActive: { background: '#1d4ed8', color: '#fff', border: '1px solid #1d4ed8' },
  pdfBtn: { background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 },
  card: { background: '#1e293b', borderRadius: 10, padding: 20, border: '1px solid #334155', marginBottom: 16 },
  cardTitle: { color: '#f1f5f9', fontSize: 15, fontWeight: 600, marginBottom: 14, marginTop: 0 },
  smartBox: { background: '#1e293b', borderRadius: 8, padding: 14, border: '1px solid #334155', marginTop: -8 },
  smartTitle: { color: '#94a3b8', fontSize: 12, marginBottom: 8 },
  smartRow: { display: 'flex', gap: 16, fontSize: 13, color: '#94a3b8', flexWrap: 'wrap' },
  alertRow: (sev) => ({
    display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0',
    borderBottom: '1px solid #334155', fontSize: 13,
    background: sev === 'critical' ? 'rgba(239,68,68,0.05)' : 'transparent'
  }),
  severityBadge: (sev) => ({
    background: sev === 'critical' ? '#7f1d1d' : sev === 'warning' ? '#78350f' : '#1e3a5f',
    color: '#f1f5f9', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700
  }),
  dimText: { color: '#64748b', fontSize: 12 },
  empty: { color: '#64748b', fontSize: 13 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { color: '#64748b', fontWeight: 600, padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #334155' },
  td: { color: '#cbd5e1', padding: '8px 12px', borderBottom: '1px solid #1e293b' },
  actionChip: { background: '#1e3a5f', color: '#93c5fd', padding: '2px 8px', borderRadius: 4, fontSize: 11 }
};

const cardStyles = {
  card: { background: '#1e293b', borderRadius: 10, padding: 16, border: '1px solid #334155' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  name: { color: '#f1f5f9', fontWeight: 600, fontSize: 15 },
  ip: { color: '#64748b', fontSize: 12, fontFamily: 'monospace' },
  dot: { fontSize: 12, fontWeight: 700 },
  metrics: { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 },
  metric: { display: 'flex', alignItems: 'center', gap: 8 },
  metricLabel: { color: '#64748b', fontSize: 12, width: 36 },
  bar: { flex: 1, background: '#0f172a', borderRadius: 4, height: 6, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4, transition: 'width 0.5s ease' },
  metricVal: { color: '#f1f5f9', fontSize: 12, width: 44, textAlign: 'right' },
  smart: { color: '#64748b', fontSize: 12, marginBottom: 10 },
  actions: { display: 'flex', gap: 8 },
  btn: (bg) => ({ background: bg, color: '#fff', border: 'none', borderRadius: 5, padding: '5px 12px', cursor: 'pointer', fontSize: 12 })
};

const trendStyles = {
  wrap: { background: '#1e293b', borderRadius: 10, padding: 16, border: '1px solid #334155' },
  title: { color: '#94a3b8', fontSize: 13, marginBottom: 10 }
};
