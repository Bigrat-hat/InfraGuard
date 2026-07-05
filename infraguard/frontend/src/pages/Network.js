import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

// ── Reusable terminal-style output box ──────────────────────────────────────
function ToolOutput({ output, loading }) {
  if (loading) return <div style={S.termLoading}>⏳ Running...</div>;
  if (!output) return null;
  return <pre style={S.termOutput}>{output}</pre>;
}

// ── Tool Panel: single input + run button ────────────────────────────────────
function ToolPanel({ title, placeholder, onRun, extraInput, isAdmin, adminOnly }) {
  const [host, setHost] = useState('');
  const [extra, setExtra] = useState('');
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);

  const run = async () => {
    if (!host.trim()) return;
    setLoading(true); setOutput('');
    try {
      const result = await onRun(host.trim(), extra.trim());
      setOutput(result);
    } catch (e) {
      setOutput(`Error: ${e.response?.data?.detail || e.message}`);
    } finally { setLoading(false); }
  };

  if (adminOnly && !isAdmin) return null;

  return (
    <div style={S.toolCard}>
      <div style={S.toolTitle}>{title}</div>
      <div style={S.toolRow}>
        <input style={S.toolInput} placeholder={placeholder} value={host}
          onChange={e => setHost(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && run()} />
        {extraInput && (
          <input style={{ ...S.toolInput, width: 140 }} placeholder={extraInput.placeholder}
            value={extra} onChange={e => setExtra(e.target.value)} />
        )}
        <button style={S.runBtn} onClick={run} disabled={loading}>
          {loading ? '...' : 'Run'}
        </button>
      </div>
      <ToolOutput output={output} loading={loading} />
    </div>
  );
}

// ── Port Scanner ─────────────────────────────────────────────────────────────
function PortScanner() {
  const [ip, setIp] = useState('');
  const [portsInput, setPortsInput] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);

  const scan = async () => {
    if (!ip.trim()) return;
    setLoading(true); setResults(null);
    try {
      const ports = portsInput.trim()
        ? portsInput.split(',').map(p => parseInt(p.trim())).filter(Boolean)
        : null;
      const res = await axios.post('/api/network/tools/portscan', { ip: ip.trim(), ports });
      setResults(res.data);
    } catch (e) {
      setResults({ error: e.response?.data?.detail || e.message });
    } finally { setLoading(false); }
  };

  return (
    <div style={S.toolCard}>
      <div style={S.toolTitle}>🔍 Port Scanner</div>
      <div style={S.toolRow}>
        <input style={S.toolInput} placeholder="IP address (e.g. 192.168.1.1)" value={ip}
          onChange={e => setIp(e.target.value)} onKeyDown={e => e.key === 'Enter' && scan()} />
        <input style={{ ...S.toolInput, width: 200 }} placeholder="Ports: 22,80,443 (blank = common)"
          value={portsInput} onChange={e => setPortsInput(e.target.value)} />
        <button style={S.runBtn} onClick={scan} disabled={loading}>{loading ? '...' : 'Scan'}</button>
      </div>
      {loading && <div style={S.termLoading}>⏳ Scanning ports...</div>}
      {results && !results.error && (
        <div>
          <div style={S.scanSummary}>
            Target: <span style={S.highlight}>{results.ip}</span> —
            <span style={{ color: '#4ade80', marginLeft: 8 }}>{results.total_open} open port{results.total_open !== 1 ? 's' : ''}</span>
          </div>
          {results.open_ports.length === 0
            ? <div style={S.dimText}>No open ports found</div>
            : <table style={S.table}>
                <thead><tr>
                  <th style={S.th}>Port</th><th style={S.th}>Service</th><th style={S.th}>State</th>
                </tr></thead>
                <tbody>
                  {results.open_ports.map(p => (
                    <tr key={p.port}>
                      <td style={S.td}><span style={S.portBadge}>{p.port}</span></td>
                      <td style={S.td}>{p.service || '—'}</td>
                      <td style={S.td}><span style={S.openBadge}>OPEN</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
          }
        </div>
      )}
      {results?.error && <pre style={S.termOutput}>{results.error}</pre>}
    </div>
  );
}

// ── ARP Table ─────────────────────────────────────────────────────────────────
function ArpTable() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/network/tools/arp');
      setData(res.data);
    } catch (e) {
      setData({ error: e.message });
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const filtered = data?.devices?.filter(d =>
    !search || d.ip.includes(search) || d.mac.includes(search.toUpperCase()) || d.hostname?.includes(search)
  ) || [];

  return (
    <div>
      {/* Interface cards */}
      {data?.interfaces?.length > 0 && (
        <div style={S.ifaceGrid}>
          {data.interfaces.map((iface, i) => (
            <div key={i} style={S.ifaceCard}>
              <div style={S.ifaceName}>{iface.interface}</div>
              <div style={S.ifaceIP}>{iface.ip}</div>
              <div style={S.ifaceMeta}>
                <span style={{ color: iface.is_up ? '#4ade80' : '#f87171' }}>
                  {iface.is_up ? '● UP' : '● DOWN'}
                </span>
                {iface.speed > 0 && <span style={S.dimText}> · {iface.speed} Mbps</span>}
                {iface.netmask && <span style={S.dimText}> · {iface.netmask}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={S.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={S.cardTitle}>Local Network Devices — ARP Cache ({filtered.length})</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <input style={{ ...S.toolInput, width: 200 }} placeholder="Search IP / MAC / hostname"
              value={search} onChange={e => setSearch(e.target.value)} />
            <button style={S.runBtn} onClick={load} disabled={loading}>
              {loading ? '...' : '🔄 Refresh'}
            </button>
          </div>
        </div>

        {loading && <div style={S.termLoading}>⏳ Reading ARP cache...</div>}

        {!loading && filtered.length === 0 && (
          <div style={S.emptyState}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📡</div>
            <div style={{ color: '#64748b' }}>No devices found in ARP cache.</div>
            <div style={{ color: '#475569', fontSize: 12, marginTop: 4 }}>Try pinging devices on your network first to populate the ARP table.</div>
          </div>
        )}

        {filtered.length > 0 && (
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>#</th>
                <th style={S.th}>IP Address</th>
                <th style={S.th}>MAC Address</th>
                <th style={S.th}>Hostname</th>
                <th style={S.th}>Type</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d, i) => (
                <tr key={i}>
                  <td style={{ ...S.td, color: '#475569', width: 32 }}>{i + 1}</td>
                  <td style={S.td}><span style={S.ipBadge}>{d.ip}</span></td>
                  <td style={S.td}><span style={S.macBadge}>{d.mac}</span></td>
                  <td style={S.td}>{d.hostname || <span style={S.dimText}>—</span>}</td>
                  <td style={S.td}>
                    <span style={S.typeBadge(d.type)}>{d.type}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Main Network Page ─────────────────────────────────────────────────────────
export default function Network() {
  const { isAdmin } = useAuth();
  const [connections, setConnections] = useState([]);
  const [blockedIPs, setBlockedIPs] = useState([]);
  const [blockReason, setBlockReason] = useState('');
  const [status, setStatus] = useState('');
  const [activeTab, setActiveTab] = useState('monitor');
  const wsRef = useRef(null);

  const fetchBlocked = useCallback(() => axios.get('/api/network/blocked').then(r => setBlockedIPs(r.data)), []);

  useEffect(() => {
    fetchBlocked();
    const token = localStorage.getItem('token');
    const host = window.location.hostname || 'localhost';
    const ws = new WebSocket(`ws://${host}:8080/ws/network?token=${token}`);
    wsRef.current = ws;
    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      setConnections(data.connections || []);
    };
    return () => ws.close();
  }, [fetchBlocked]);

  const blockIP = async (ip) => {
    try {
      await axios.post('/api/network/block', { ip, reason: blockReason || 'Manual block' });
      setStatus(`✅ Blocked ${ip}`); fetchBlocked();
    } catch (e) { setStatus(`❌ ${e.response?.data?.detail || 'Error'}`); }
  };

  const unblockIP = async (ip) => {
    try {
      await axios.post('/api/network/unblock', { ip });
      setStatus(`✅ Unblocked ${ip}`); fetchBlocked();
    } catch (e) { setStatus(`❌ ${e.response?.data?.detail || 'Error'}`); }
  };

  const killConn = async (pid, ip) => {
    if (!window.confirm(`Kill process ${pid}?`)) return;
    try {
      await axios.post('/api/network/kill', { pid, ip });
      setStatus(`✅ Killed PID ${pid}`);
    } catch (e) { setStatus(`❌ ${e.response?.data?.detail || 'Error'}`); }
  };

  const TABS = [
    { id: 'monitor', label: '📊 Monitor' },
    { id: 'portscan', label: '🔍 Port Scanner' },
    { id: 'arp', label: '📋 ARP Table' },
    { id: 'tools', label: '🛠️ Tools' },
  ];

  return (
    <div>
      <div style={S.topBar}>
        <h2 style={S.heading}>🌐 Network</h2>
        <div style={S.tabs}>
          {TABS.map(t => (
            <button key={t.id} style={{ ...S.tab, ...(activeTab === t.id ? S.tabActive : {}) }}
              onClick={() => setActiveTab(t.id)}>{t.label}</button>
          ))}
        </div>
      </div>

      {status && <div style={S.statusBar} onClick={() => setStatus('')}>{status} <span style={S.dimText}>✕</span></div>}

      {/* ── MONITOR TAB ── */}
      {activeTab === 'monitor' && (
        <>
          <div style={S.card}>
              <h3 style={S.cardTitle}>Blocked IPs ({blockedIPs.length})</h3>
              {isAdmin && (
                <input style={{ ...S.toolInput, marginBottom: 10, width: '100%' }}
                  placeholder="Block reason (optional)" value={blockReason}
                  onChange={e => setBlockReason(e.target.value)} />
              )}
              <div style={S.scrollBox}>
                {blockedIPs.length === 0 ? <p style={S.dimText}>No blocked IPs</p> :
                  blockedIPs.map(b => (
                    <div key={b.id} style={S.blockedRow}>
                      <span style={S.ipBadge}>{b.ip}</span>
                      <span style={S.dimText}>{b.reason}</span>
                      {isAdmin && <button style={S.btnGreen} onClick={() => unblockIP(b.ip)}>Unblock</button>}
                    </div>
                  ))}
              </div>
          </div>

          <div style={S.card}>
            <h3 style={S.cardTitle}>Active Connections ({connections.length})</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={S.table}>
                <thead>
                  <tr>{['Remote IP', 'Port', 'Process', 'PID', 'Status', 'Actions'].map(h =>
                    <th key={h} style={S.th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {connections.map((c, i) => (
                    <tr key={i} style={{ background: c.suspicious ? 'rgba(239,68,68,0.08)' : 'transparent' }}>
                      <td style={S.td}>
                        {c.suspicious && <span title="Suspicious">⚠️ </span>}
                        {c.remote_ip}
                      </td>
                      <td style={S.td}>{c.remote_port}</td>
                      <td style={S.td}>{c.process || '—'}</td>
                      <td style={S.td}>{c.pid || '—'}</td>
                      <td style={S.td}><span style={S.statusBadge}>{c.status}</span></td>
                      <td style={S.td}>
                        {isAdmin && (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button style={S.btnRed} onClick={() => blockIP(c.remote_ip)}>Block</button>
                            {c.pid && <button style={S.btnOrange} onClick={() => killConn(c.pid, c.remote_ip)}>Kill</button>}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </>
      )}

      {/* ── PORT SCANNER TAB ── */}
      {activeTab === 'portscan' && <PortScanner />}

      {/* ── ARP TABLE TAB ── */}
      {activeTab === 'arp' && <ArpTable />}

      {/* ── TOOLS TAB ── */}
      {activeTab === 'tools' && (
        <div style={S.toolsGrid}>
          <ToolPanel
            title="🏓 Ping"
            placeholder="Host or IP (e.g. 8.8.8.8)"
            extraInput={{ placeholder: "Count (default 4)" }}
            onRun={async (host, args) => {
              const res = await axios.post('/api/network/tools/ping', { host, args: args || '4' });
              return res.data.output;
            }}
            isAdmin={isAdmin}
          />
          <ToolPanel
            title="🗺️ Traceroute"
            placeholder="Host or IP (e.g. google.com)"
            onRun={async (host) => {
              const res = await axios.post('/api/network/tools/traceroute', { host });
              return res.data.output;
            }}
            isAdmin={isAdmin}
          />
          <ToolPanel
            title="🔎 NSLookup / DNS"
            placeholder="Domain (e.g. google.com)"
            onRun={async (host) => {
              const res = await axios.post('/api/network/tools/nslookup', { host });
              return res.data.output;
            }}
            isAdmin={isAdmin}
          />
          <ToolPanel
            title="🌍 Whois"
            placeholder="Domain or IP (e.g. google.com)"
            onRun={async (host) => {
              const res = await axios.post('/api/network/tools/whois', { host });
              return res.data.output;
            }}
            isAdmin={isAdmin}
          />
          <ToolPanel
            title="🗂️ Netstat"
            placeholder="(no input needed — press Run)"
            onRun={async () => {
              const res = await axios.get('/api/network/tools/netstat');
              return res.data.output;
            }}
            isAdmin={isAdmin}
          />
          <ToolPanel
            title="🛡️ Nmap (Admin only)"
            placeholder="Host or IP (e.g. 192.168.1.1)"
            extraInput={{ placeholder: "Args (e.g. -sV -p 1-1000)" }}
            adminOnly={true}
            onRun={async (host, args) => {
              const res = await axios.post('/api/network/tools/nmap', { host, args: args || '-sV --open -T4' });
              return res.data.output;
            }}
            isAdmin={isAdmin}
          />
        </div>
      )}
    </div>
  );
}

const S = {
  topBar: { display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' },
  heading: { color: '#f1f5f9', fontSize: 22, margin: 0 },
  tabs: { display: 'flex', gap: 4, flexWrap: 'wrap' },
  tab: { background: '#1e293b', color: '#94a3b8', border: '1px solid #334155', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 13 },
  tabActive: { background: '#1d4ed8', color: '#fff', border: '1px solid #1d4ed8' },
  statusBar: { background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: '10px 16px', marginBottom: 16, color: '#f1f5f9', fontSize: 14, cursor: 'pointer', display: 'flex', justifyContent: 'space-between' },
  card: { background: '#1e293b', borderRadius: 10, padding: 20, marginBottom: 16, border: '1px solid #334155' },
  cardTitle: { color: '#f1f5f9', fontSize: 15, fontWeight: 600, marginBottom: 14, marginTop: 0 },
  ifaceGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 16 },
  ifaceCard: { background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: '14px 16px' },
  ifaceName: { color: '#94a3b8', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  ifaceIP: { color: '#f1f5f9', fontFamily: 'monospace', fontSize: 15, fontWeight: 700, marginBottom: 4 },
  ifaceMeta: { fontSize: 12 },
  emptyState: { textAlign: 'center', padding: '40px 0' },
  typeBadge: (t) => ({
    background: t === 'dynamic' ? '#1e3a5f' : t === 'static' ? '#14532d' : '#3b1f1f',
    color: t === 'dynamic' ? '#93c5fd' : t === 'static' ? '#4ade80' : '#f87171',
    padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600
  }),
  toolsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(460px, 1fr))', gap: 16 },
  toolCard: { background: '#1e293b', borderRadius: 10, padding: 18, border: '1px solid #334155' },
  toolTitle: { color: '#f1f5f9', fontWeight: 600, fontSize: 14, marginBottom: 12 },
  toolRow: { display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' },
  toolInput: { background: '#0f172a', border: '1px solid #334155', borderRadius: 6, padding: '7px 10px', color: '#f1f5f9', fontSize: 13, flex: 1, minWidth: 160 },
  runBtn: { background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 18px', cursor: 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' },
  termOutput: { background: '#0f172a', color: '#4ade80', fontFamily: 'monospace', fontSize: 12, padding: 12, borderRadius: 6, maxHeight: 300, overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', marginTop: 8 },
  termLoading: { color: '#fbbf24', fontSize: 13, padding: '8px 0' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 8 },
  th: { color: '#64748b', fontWeight: 600, padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #334155' },
  td: { color: '#cbd5e1', padding: '8px 12px', borderBottom: '1px solid #1e293b' },
  scanSummary: { color: '#94a3b8', fontSize: 13, marginBottom: 8 },
  highlight: { color: '#93c5fd', fontFamily: 'monospace' },
  portBadge: { background: '#1e3a5f', color: '#93c5fd', padding: '2px 8px', borderRadius: 4, fontFamily: 'monospace', fontSize: 12 },
  openBadge: { background: '#14532d', color: '#4ade80', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700 },
  ipBadge: { background: '#1e3a5f', color: '#93c5fd', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontFamily: 'monospace' },
  macBadge: { background: '#2d1b69', color: '#c4b5fd', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontFamily: 'monospace' },
  btnRed: { background: '#dc2626', color: '#fff', border: 'none', borderRadius: 5, padding: '4px 10px', cursor: 'pointer', fontSize: 12 },
  btnOrange: { background: '#d97706', color: '#fff', border: 'none', borderRadius: 5, padding: '4px 10px', cursor: 'pointer', fontSize: 12 },
  btnGreen: { background: '#16a34a', color: '#fff', border: 'none', borderRadius: 5, padding: '4px 10px', cursor: 'pointer', fontSize: 12 },
  statusBadge: { background: '#166534', color: '#86efac', padding: '2px 8px', borderRadius: 4, fontSize: 11 },
  dimText: { color: '#64748b', fontSize: 12 },
  scrollBox: { maxHeight: 200, overflowY: 'auto' },
  blockedRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid #334155' },
};
