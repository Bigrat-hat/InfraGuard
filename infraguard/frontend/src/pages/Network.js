import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

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
  const [hostFocused, setHostFocused] = useState(false);
  const [extraFocused, setExtraFocused] = useState(false);

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
    <div className="info-card" style={S.toolCard}>
      <div style={S.toolTitle}>{title}</div>
      <div style={S.toolRow}>
        <input
          style={S.toolInput(hostFocused)}
          placeholder={placeholder}
          value={host}
          onChange={e => setHost(e.target.value)}
          onFocus={() => setHostFocused(true)}
          onBlur={() => setHostFocused(false)}
          onKeyDown={e => e.key === 'Enter' && run()}
        />
        {extraInput && (
          <input
            style={S.toolInputExtra(extraFocused)}
            placeholder={extraInput.placeholder}
            value={extra}
            onChange={e => setExtra(e.target.value)}
            onFocus={() => setExtraFocused(true)}
            onBlur={() => setExtraFocused(false)}
          />
        )}
        <button className="btn-accent" onClick={run} disabled={loading} style={{ height: 36, padding: '0 20px', borderRadius: 20 }}>
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
  const [ipFocused, setIpFocused] = useState(false);
  const [portsFocused, setPortsFocused] = useState(false);

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
    <div className="info-card" style={S.toolCard}>
      <div style={S.toolTitle}>🔍 Port Scanner</div>
      <div style={S.toolRow}>
        <input
          style={S.toolInput(ipFocused)}
          placeholder="IP address (e.g. 192.168.1.1)"
          value={ip}
          onChange={e => setIp(e.target.value)}
          onFocus={() => setIpFocused(true)}
          onBlur={() => setIpFocused(false)}
          onKeyDown={e => e.key === 'Enter' && scan()}
        />
        <input
          style={S.toolInputExtra(portsFocused)}
          placeholder="Ports: 22,80,443 (blank = common)"
          value={portsInput}
          onChange={e => setPortsInput(e.target.value)}
          onFocus={() => setPortsFocused(true)}
          onBlur={() => setPortsFocused(false)}
        />
        <button className="btn-accent" onClick={scan} disabled={loading} style={{ height: 36, padding: '0 20px', borderRadius: 20 }}>
          {loading ? '...' : 'Scan'}
        </button>
      </div>
      {loading && <div style={S.termLoading}>⏳ Scanning ports...</div>}
      {results && !results.error && (
        <div style={{ marginTop: 16 }}>
          <div style={S.scanSummary}>
            Target: <span style={S.highlight}>{results.ip}</span> —
            <span style={{ color: '#3fb950', marginLeft: 8, fontWeight: 600 }}>{results.total_open} open port{results.total_open !== 1 ? 's' : ''}</span>
          </div>
          {results.open_ports.length === 0
            ? <div style={S.dimText}>No open ports found</div>
            : <table style={S.table}>
                <thead>
                  <tr style={S.thRow}>
                    <th style={S.th}>Port</th>
                    <th style={S.th}>Service</th>
                    <th style={S.th}>State</th>
                  </tr>
                </thead>
                <tbody>
                  {results.open_ports.map(p => (
                    <tr key={p.port} style={S.tr}>
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

// ── Speed Test ───────────────────────────────────────────────────────────────
function SpeedTest() {
  const [data, setData] = useState({ ping: null, download: null, upload: null });
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState('idle'); // 'idle', 'ping', 'download', 'upload', 'done', 'error'
  const [progress, setProgress] = useState(0);

  const stageRef = useRef(stage);
  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);

  const runTest = async () => {
    setLoading(true);
    setStage('ping');
    setProgress(0);
    setData({ ping: null, download: null, upload: null });

    let interval = setInterval(() => {
      setProgress(prev => {
        const currentStage = stageRef.current;
        const bounce = Math.random() * 30 - 15;
        if (currentStage === 'download') {
          return Math.min(Math.max(300 + bounce, 10), 500);
        } else if (currentStage === 'upload') {
          return Math.min(Math.max(5 + bounce * 0.1, 1), 10);
        }
        return 0;
      });
    }, 150);

    try {
      // 1. Show Ping for 1.5s
      await new Promise(r => setTimeout(r, 1500));
      
      // 2. Show Download Simulation for 2.5s
      setStage('download');
      await new Promise(r => setTimeout(r, 2500));
      
      // 3. Show Upload Simulation for 2s
      setStage('upload');
      await new Promise(r => setTimeout(r, 2000));

      const res = await axios.post('/api/network/tools/speedtest');
      clearInterval(interval);
      setData(res.data);
      setStage('done');
    } catch (e) {
      clearInterval(interval);
      setData({ error: e.response?.data?.detail || e.message });
      setStage('error');
    } finally {
      setLoading(false);
    }
  };

  const displayDownload = loading
    ? (stage === 'download' ? progress.toFixed(2) : '0.00')
    : (typeof data.download === 'number' ? data.download.toFixed(2) : '0.00');

  const downloadSpeedForGauge = loading
    ? (stage === 'download' ? progress : 0)
    : (typeof data.download === 'number' ? data.download : 0);

  const maxScale = 500;
  const percentage = Math.min((downloadSpeedForGauge / maxScale) * 100, 100);
  const rotationAngle = -90 + (percentage * 1.8); // map 0-100% to -90deg to +90deg

  return (
    <div className="info-card" style={S.card}>
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3 style={S.cardTitle}>⚡ Internet Speed Test</h3>
        <button
          className="btn-accent"
          onClick={runTest}
          disabled={loading}
          style={{ height: 38, padding: '0 24px', borderRadius: 20, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
        >
          {loading ? (
            <>
              <span style={{
                width: 14,
                height: 14,
                border: '2px solid #ffffff',
                borderRightColor: 'transparent',
                borderRadius: '50%',
                display: 'inline-block',
                animation: 'spin 1s linear infinite'
              }}></span>
              {stage === 'ping' ? 'Measuring Ping...' : stage === 'download' ? 'Testing Download...' : 'Testing Upload...'}
            </>
          ) : 'Run Speed Test'}
        </button>
      </div>

      <div style={S.speedTestLayout}>
        <div style={S.gaugeContainer}>
          <div style={S.gaugeOuter}>
            <div style={S.gaugeArc}></div>
            <div style={S.gaugeNeedle(rotationAngle)}></div>
            <div style={S.gaugeCenter}>
              <div style={S.gaugeValue}>{displayDownload}</div>
              <div style={S.gaugeUnit}>Mb/s</div>
              <div style={S.gaugeLabel}>DOWNLOAD</div>
            </div>
          </div>
        </div>

        <div style={S.speedTestGrid}>
          <div style={S.speedTestStatCard}>
            <div style={S.speedTestStatIcon}>📡</div>
            <div style={S.speedTestStatLabel}>PING</div>
            <div style={S.speedTestStatVal}>
              {typeof data.ping === 'number' ? `${data.ping} ms` : '—'}
            </div>
          </div>

          <div style={S.speedTestStatCard}>
            <div style={S.speedTestStatIcon}>📥</div>
            <div style={S.speedTestStatLabel}>DOWNLOAD</div>
            <div style={S.speedTestStatVal}>
              {typeof data.download === 'number' ? `${data.download} Mb/s` : '—'}
            </div>
          </div>

          <div style={S.speedTestStatCard}>
            <div style={S.speedTestStatIcon}>📤</div>
            <div style={S.speedTestStatLabel}>UPLOAD</div>
            <div style={S.speedTestStatVal}>
              {typeof data.upload === 'number' ? `${data.upload} Mb/s` : '—'}
            </div>
          </div>
        </div>
      </div>

      {data.error && (
        <div style={{ ...S.termOutput, color: '#f85149', borderColor: '#f85149' }}>
          Error running speedtest: {data.error}
        </div>
      )}
    </div>
  );
}

// ── ARP Table ─────────────────────────────────────────────────────────────────
function ArpTable() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);

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
            <div key={i} className="info-card" style={S.ifaceCard}>
              <div style={S.ifaceName}>{iface.interface}</div>
              <div style={S.ifaceIP}>{iface.ip}</div>
              <div style={S.ifaceMeta}>
                <span style={{ color: iface.is_up ? '#3fb950' : '#f85149', fontWeight: 600 }}>
                  {iface.is_up ? '● UP' : '● DOWN'}
                </span>
                {iface.speed > 0 && <span style={S.dimText}> · {iface.speed} Mbps</span>}
                {iface.netmask && <span style={S.dimText}> · {iface.netmask}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="info-card" style={S.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <h3 style={S.cardTitle}>Local Network Devices — ARP Cache ({filtered.length})</h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              style={S.searchField(searchFocused)}
              placeholder="Search IP / MAC / hostname"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
            />
            <button className="btn-accent" onClick={load} disabled={loading} style={{ height: 36, padding: '0 16px', borderRadius: 20 }}>
              {loading ? '...' : '🔄 Refresh'}
            </button>
          </div>
        </div>

        {loading && <div style={S.termLoading}>⏳ Reading ARP cache...</div>}

        {!loading && filtered.length === 0 && (
          <div style={S.emptyState}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📡</div>
            <div style={{ color: '#a0a0a8' }}>No devices found in ARP cache.</div>
            <div style={{ color: '#a0a0a8', fontSize: 12, marginTop: 4 }}>Try pinging devices on your network first to populate the ARP table.</div>
          </div>
        )}

        {filtered.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={S.table}>
              <thead>
                <tr style={S.thRow}>
                  <th style={S.th}>#</th>
                  <th style={S.th}>IP Address</th>
                  <th style={S.th}>MAC Address</th>
                  <th style={S.th}>Hostname</th>
                  <th style={S.th}>Type</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d, i) => (
                  <tr key={i} style={S.tr}>
                    <td style={{ ...S.td, color: '#a0a0a8', width: 40 }}>{i + 1}</td>
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
          </div>
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
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [filterType, setFilterType] = useState('all');
  
  // Modal states
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [ipToBlock, setIpToBlock] = useState('');
  const [blockModalReason, setBlockModalReason] = useState('');
  const [bandwidthHistory, setBandwidthHistory] = useState([]);

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
      
      const stats = data.bandwidth_stats || { upload: 0.0, download: 0.0 };
      const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      
      setBandwidthHistory(prev => {
        const next = [...prev, {
          time: timestamp,
          upload: stats.upload,
          download: stats.download
        }];
        if (next.length > 30) {
          return next.slice(next.length - 30);
        }
        return next;
      });
    };
    return () => ws.close();
  }, [fetchBlocked]);

  const blockIP = async (ip, reason) => {
    try {
      await axios.post('/api/network/block', { ip, reason: reason || 'Manual block' });
      setStatus(`✅ Blocked ${ip}`);
      fetchBlocked();
    } catch (e) {
      setStatus(`❌ ${e.response?.data?.detail || 'Error'}`);
    }
  };

  const unblockIP = async (ip) => {
    try {
      await axios.post('/api/network/unblock', { ip });
      setStatus(`✅ Unblocked ${ip}`);
      fetchBlocked();
    } catch (e) {
      setStatus(`❌ ${e.response?.data?.detail || 'Error'}`);
    }
  };

  const killConn = async (pid, ip) => {
    if (!window.confirm(`Kill process ${pid}?`)) return;
    try {
      await axios.post('/api/network/kill', { pid, ip });
      setStatus(`✅ Killed PID ${pid}`);
    } catch (e) {
      setStatus(`❌ ${e.response?.data?.detail || 'Error'}`);
    }
  };

  const openBlockModal = (ip) => {
    setIpToBlock(ip);
    setBlockModalReason('');
    setShowBlockModal(true);
  };

  const confirmBlock = () => {
    blockIP(ipToBlock, blockModalReason);
    setShowBlockModal(false);
  };

  // Exclude localhost and private IPs from suspicious count:
  // - 127.x.x.x
  // - 192.168.x.x
  // - 10.x.x.x
  // - 172.16.x.x to 172.31.x.x
  // - ::1 (IPv6 localhost)
  // - fc00::/7 (IPv6 private)
  const isSuspiciousExcludedIP = (ip) => {
    if (!ip) return true;
    const cleanIp = ip.trim().toLowerCase();
    
    if (cleanIp === 'localhost') return true;
    if (cleanIp.startsWith('127.')) return true;
    if (cleanIp.startsWith('192.168.')) return true;
    if (cleanIp.startsWith('10.')) return true;
    
    const ipv4Match = cleanIp.match(/^172\.(\d+)\./);
    if (ipv4Match) {
      const secondOctet = parseInt(ipv4Match[1], 10);
      if (secondOctet >= 16 && secondOctet <= 31) {
        return true;
      }
    }
    
    if (cleanIp === '::1' || cleanIp === '0:0:0:0:0:0:0:1') return true;
    
    if (cleanIp.startsWith('fc') || cleanIp.startsWith('fd')) {
      if (cleanIp.length >= 3 && (cleanIp[2] === ':' || '0123456789abcdef'.includes(cleanIp[2]))) {
        return true;
      }
    }
    
    return false;
  };

  // Remove warning icon from loopback/private IPs:
  // - 127.0.0.1
  // - ::1
  // - 192.168.x.x range
  const shouldShowWarningIcon = (ip, suspicious) => {
    if (!suspicious) return false;
    if (!ip) return false;
    const cleanIp = ip.trim().toLowerCase();
    
    if (cleanIp === '127.0.0.1') return false;
    if (cleanIp === '::1' || cleanIp === '0:0:0:0:0:0:0:1') return false;
    if (cleanIp.startsWith('192.168.')) return false;
    if (cleanIp === 'localhost') return false;
    
    return true;
  };

  // Stat metrics calculations
  const totalConns = connections.length;
  const blockedCount = blockedIPs.length;
  const suspiciousCount = connections.filter(c => c.suspicious && !isSuspiciousExcludedIP(c.remote_ip)).length;
  const activeProcesses = new Set(connections.map(c => c.pid).filter(Boolean)).size;

  const isLocalIP = (ip) => {
    if (!ip) return false;
    return (
      ip === '127.0.0.1' ||
      ip === '::1' ||
      ip === 'localhost' ||
      ip.startsWith('192.168.') ||
      ip.startsWith('10.') ||
      ip.startsWith('172.16.') ||
      ip.startsWith('fe80::')
    );
  };

  const filteredConnections = connections.filter(c => {
    // Search filter
    const matchesSearch =
      c.remote_ip?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.process?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.pid?.toString().includes(searchQuery) ||
      c.remote_port?.toString().includes(searchQuery);

    if (!matchesSearch) return false;

    // Type filter
    switch (filterType) {
      case 'active':
        return c.status === 'ESTABLISHED' || c.status === 'LISTEN';
      case 'suspicious':
        return !!c.suspicious && !isSuspiciousExcludedIP(c.remote_ip);
      case 'local':
        return isLocalIP(c.remote_ip);
      case 'external':
        return !isLocalIP(c.remote_ip);
      case 'all':
      default:
        return true;
    }
  });

  const renderStatusBadge = (statusVal) => {
    const s = (statusVal || '').toUpperCase();
    let bg = '#3a1a1a';
    let text = '#f85149';
    let dotColor = '#f85149';
    let pulse = false;

    if (s === 'ESTABLISHED') {
      bg = '#1a3a1a';
      text = '#3fb950';
      dotColor = '#3fb950';
      pulse = true;
    } else if (s === 'LISTEN') {
      bg = '#1a2a3a';
      text = '#58a6ff';
      dotColor = '#58a6ff';
    }

    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        background: bg,
        color: text,
        padding: '4px 10px',
        borderRadius: 12,
        fontSize: 12,
        fontWeight: 500
      }}>
        <span className={pulse ? 'status-pulse-green' : ''} style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          backgroundColor: dotColor,
          display: 'inline-block'
        }} />
        {statusVal}
      </span>
    );
  };

  const TABS = [
    { id: 'monitor', label: '📊 Monitor' },
    { id: 'portscan', label: '🔍 Port Scanner' },
    { id: 'arp', label: '📋 ARP Table' },
    { id: 'speedtest', label: '⚡ Speed Test' },
    { id: 'tools', label: '🛠️ Tools' },
  ];

  return (
    <div>
      <div style={S.topBar}>
        <div style={S.tabs}>
          {TABS.map(t => (
            <button key={t.id} style={{ ...S.tab, ...(activeTab === t.id ? S.tabActive : {}) }}
              onClick={() => setActiveTab(t.id)}>{t.label}</button>
          ))}
        </div>
      </div>

      {status && (
        <div style={S.statusBar} onClick={() => setStatus('')}>
          <span>{status}</span>
          <span style={{ cursor: 'pointer', opacity: 0.8 }}>✕</span>
        </div>
      )}

      {/* ── STATS CARDS ROW (Always Visible at Top of Page) ── */}
      <div style={S.statsRow}>
        <div className="info-card" style={S.statCard}>
          <div style={S.statHeader}>
            <span style={{ fontSize: 18 }}>🔗</span>
            <span style={S.statLabel}>Total Connections</span>
          </div>
          <div style={S.statNumber}>{totalConns}</div>
          <div style={S.statTrend(true)}>↑ 4% from last hour</div>
        </div>

        <div className="info-card" style={S.statCard}>
          <div style={S.statHeader}>
            <span style={{ fontSize: 18 }}>🚫</span>
            <span style={S.statLabel}>Blocked IPs</span>
          </div>
          <div style={S.statNumber}>{blockedCount}</div>
          <div style={S.statTrend(false)}>↓ 2% from yesterday</div>
        </div>

        <div className="info-card" style={S.statCard}>
          <div style={S.statHeader}>
            <span style={{ fontSize: 18 }}>⚠️</span>
            <span style={S.statLabel}>Suspicious IPs</span>
          </div>
          <div style={S.statNumber}>{suspiciousCount}</div>
          <div style={S.statTrend(false)}>↑ 0%</div>
        </div>

        <div className="info-card" style={S.statCard}>
          <div style={S.statHeader}>
            <span style={{ fontSize: 18 }}>⚡</span>
            <span style={S.statLabel}>Active Processes</span>
          </div>
          <div style={S.statNumber}>{activeProcesses}</div>
          <div style={S.statTrend(true)}>↑ 2% from last hour</div>
        </div>
      </div>

      {/* ── MONITOR TAB ── */}
      {activeTab === 'monitor' && (
        <>
          {/* Blocked IPs Card - Hidden if count is 0 */}
          {blockedCount > 0 && (
            <div className="info-card" style={S.blockedCard}>
              <h3 style={S.cardTitle}>Blocked IPs ({blockedCount})</h3>
              <div style={S.scrollBox}>
                {blockedIPs.map(b => (
                  <div key={b.id} style={S.blockedRow}>
                    <span style={S.ipBadge}>{b.ip}</span>
                    <span style={S.dimText}>{b.reason}</span>
                    {isAdmin && (
                      <button className="btn-outlined-danger" onClick={() => unblockIP(b.ip)}>
                        Unblock
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Active Connections Card */}
          <div className="info-card" style={S.card}>
            <div style={S.tableHeaderArea}>
              <h3 style={S.cardTitle}>Active Connections ({filteredConnections.length})</h3>
              
              {/* Search + Filter Row */}
              <div style={S.controlsRow}>
                <div style={S.searchWrapper(searchFocused)}>
                  {/* Search Icon */}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a0a0a8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
                    <circle cx="11" cy="11" r="8"/>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                  <input
                    style={S.searchFieldInline}
                    placeholder="Search connection..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setSearchFocused(false)}
                  />
                </div>

                <select
                  style={S.filterSelect}
                  value={filterType}
                  onChange={e => setFilterType(e.target.value)}
                >
                  <option value="all">All Connections</option>
                  <option value="active">Active Only</option>
                  <option value="suspicious">Suspicious Only</option>
                  <option value="local">Local Only</option>
                  <option value="external">External Only</option>
                </select>
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={S.table}>
                <thead>
                  <tr style={S.thRow}>
                    {['Remote IP', 'Port', 'Process', 'PID', 'Status', 'Actions'].map(h => (
                      <th key={h} style={S.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredConnections.map((c, i) => (
                    <tr key={i} style={{ ...S.tr, background: shouldShowWarningIcon(c.remote_ip, c.suspicious) ? 'rgba(248,81,73,0.06)' : 'transparent' }}>
                      <td style={S.td}>
                        {shouldShowWarningIcon(c.remote_ip, c.suspicious) && <span title="Suspicious" style={{ color: '#d29922', marginRight: 4 }}>⚠️</span>}
                        {c.remote_ip}
                      </td>
                      <td style={S.td}>{c.remote_port}</td>
                      <td style={S.td}>{c.process || '—'}</td>
                      <td style={S.td}>{c.pid || '—'}</td>
                      <td style={S.td}>{renderStatusBadge(c.status)}</td>
                      <td style={S.td}>
                        {isAdmin && (
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button className="btn-danger-block" onClick={() => openBlockModal(c.remote_ip)}>
                              Block
                            </button>
                            {c.pid && (
                              <button className="btn-warning-kill" onClick={() => killConn(c.pid, c.remote_ip)}>
                                Kill
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Live Bandwidth Chart */}
          <div className="info-card" style={S.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={S.cardTitle}>Live Bandwidth Usage</h3>
              <div style={{ display: 'flex', gap: 16, fontSize: 12, fontWeight: 500 }}>
                <span style={{ color: '#58a6ff', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#58a6ff', display: 'inline-block' }} />
                  Upload ({bandwidthHistory[bandwidthHistory.length - 1]?.upload || 0} KB/s)
                </span>
                <span style={{ color: '#3fb950', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#3fb950', display: 'inline-block' }} />
                  Download ({bandwidthHistory[bandwidthHistory.length - 1]?.download || 0} KB/s)
                </span>
              </div>
            </div>
            
            <div style={{ width: '100%', height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={bandwidthHistory} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#47484c" vertical={false} />
                  <XAxis dataKey="time" tick={{ fill: '#a0a0a8', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: '#a0a0a8', fontSize: 10 }} tickLine={false} axisLine={false} unit=" KB/s" />
                  <Tooltip
                    contentStyle={{ background: '#2a2b2f', border: '1px solid #47484c', color: '#ffffff', fontSize: 12, borderRadius: 8 }}
                    formatter={(value) => [`${value} KB/s`]}
                  />
                  <Line type="monotone" dataKey="upload" name="Upload" stroke="#58a6ff" dot={false} strokeWidth={2.5} activeDot={{ r: 4 }} />
                  <Line type="monotone" dataKey="download" name="Download" stroke="#3fb950" dot={false} strokeWidth={2.5} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}

      {/* ── PORT SCANNER TAB ── */}
      {activeTab === 'portscan' && <PortScanner />}

      {/* ── ARP TABLE TAB ── */}
      {activeTab === 'arp' && <ArpTable />}

      {/* ── SPEED TEST TAB ── */}
      {activeTab === 'speedtest' && <SpeedTest />}

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

      {/* Centered Blocking Modal */}
      {showBlockModal && (
        <div style={S.modalOverlay}>
          <div style={S.modalCard}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f85149" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
              </svg>
              <h3 style={{ margin: 0, fontSize: 18, color: '#ffffff', fontWeight: 600 }}>Block IP Address</h3>
            </div>
            <p style={{ color: '#a0a0a8', fontSize: 14, lineHeight: '20px', marginBottom: 20 }}>
              Are you sure you want to block IP <strong style={{ color: '#ffffff' }}>{ipToBlock}</strong>? This will create an iptables rule dropping all traffic from this IP.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 24 }}>
              <label style={{ fontSize: 12, color: '#a0a0a8' }}>Block Reason</label>
              <input
                style={S.modalInput}
                placeholder="E.g., DDOS attempt / suspicious connections"
                value={blockModalReason}
                onChange={e => setBlockModalReason(e.target.value)}
                autoFocus
              />
            </div>
            <div style={S.modalActions}>
              <button className="logout-btn" style={{ width: 'auto', padding: '8px 20px', height: 38 }} onClick={() => setShowBlockModal(false)}>
                Cancel
              </button>
              <button className="btn-danger-block" style={{ height: 38, padding: '0 24px', borderRadius: 20 }} onClick={confirmBlock}>
                Confirm Block
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const S = {
  topBar: { display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, flexWrap: 'wrap' },
  tabs: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  tab: { background: '#2a2b2f', color: '#a0a0a8', border: '1px solid #47484c', borderRadius: 20, padding: '8px 18px', cursor: 'pointer', fontSize: 13, fontWeight: 500, transition: 'all 200ms ease' },
  tabActive: { background: '#58a6ff', color: '#ffffff', border: '1px solid #58a6ff' },
  statusBar: { background: '#2a2b2f', border: '1px solid #47484c', borderRadius: 12, padding: '12px 20px', marginBottom: 24, color: '#ffffff', fontSize: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  
  // Stat cards style
  statsRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20, marginBottom: 24 },
  statCard: { display: 'flex', flexDirection: 'column', gap: 8 },
  statHeader: { display: 'flex', alignItems: 'center', gap: 8 },
  statLabel: { color: '#a0a0a8', fontSize: 12, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' },
  statNumber: { color: '#ffffff', fontSize: 28, fontWeight: 700 },
  statTrend: (isPositive) => ({ color: isPositive ? '#3fb950' : '#f85149', fontSize: 12, fontWeight: 500 }),

  // Card layouts
  card: { background: '#2a2b2f', borderRadius: 12, padding: 20, marginBottom: 24, border: '1px solid #47484c' },
  blockedCard: { background: '#2a2b2f', borderRadius: 12, padding: 20, marginBottom: 24, border: '1px solid #47484c', borderLeft: '4px solid #f85149' },
  cardTitle: { color: '#ffffff', fontSize: 16, fontWeight: 600, margin: 0 },
  
  ifaceGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20, marginBottom: 24 },
  ifaceCard: { padding: '20px' },
  ifaceName: { color: '#a0a0a8', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 },
  ifaceIP: { color: '#ffffff', fontFamily: 'monospace', fontSize: 16, fontWeight: 700, marginBottom: 6 },
  ifaceMeta: { fontSize: 12, display: 'flex', gap: 10, alignItems: 'center' },
  
  emptyState: { textAlign: 'center', padding: '48px 0', display: 'flex', flexDirection: 'column', alignItems: 'center' },
  
  typeBadge: (t) => {
    let bg = '#47484c';
    let col = '#a0a0a8';
    if (t === 'dynamic') { bg = '#1a2a3a'; col = '#58a6ff'; }
    else if (t === 'static') { bg = '#1a3a1a'; col = '#3fb950'; }
    return {
      background: bg,
      color: col,
      padding: '4px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600
    };
  },
  
  toolsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 20 },
  toolCard: { padding: '20px' },
  toolTitle: { color: '#ffffff', fontWeight: 600, fontSize: 14, marginBottom: 16 },
  toolRow: { display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' },
  
  toolInput: (focused) => ({
    background: '#1e2023',
    border: `1px solid ${focused ? '#58a6ff' : '#47484c'}`,
    borderRadius: 8,
    padding: '8px 14px',
    color: '#ffffff',
    fontSize: 13,
    flex: 1,
    minWidth: 180,
    outline: 'none',
    transition: 'border-color 200ms ease'
  }),
  toolInputExtra: (focused) => ({
    background: '#1e2023',
    border: `1px solid ${focused ? '#58a6ff' : '#47484c'}`,
    borderRadius: 8,
    padding: '8px 14px',
    color: '#ffffff',
    fontSize: 13,
    width: 160,
    outline: 'none',
    transition: 'border-color 200ms ease'
  }),
  
  termOutput: { background: '#1e2023', color: '#3fb950', fontFamily: 'monospace', fontSize: 12, padding: 16, borderRadius: 8, maxHeight: 300, overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', marginTop: 12, border: '1px solid #47484c' },
  termLoading: { color: '#d29922', fontSize: 13, padding: '10px 0', fontWeight: 500 },
  
  // Table Styling
  tableHeaderArea: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 },
  controlsRow: { display: 'flex', gap: 12, alignItems: 'center' },
  
  searchWrapper: (focused) => ({
    display: 'flex',
    alignItems: 'center',
    background: '#2a2b2f',
    border: `1px solid ${focused ? '#58a6ff' : '#47484c'}`,
    borderRadius: 8,
    padding: '0 12px',
    height: 36,
    transition: 'border-color 200ms ease'
  }),
  searchFieldInline: {
    background: 'transparent',
    border: 'none',
    color: '#ffffff',
    fontSize: 13,
    outline: 'none',
    width: 180
  },
  searchField: (focused) => ({
    background: '#2a2b2f',
    border: `1px solid ${focused ? '#58a6ff' : '#47484c'}`,
    borderRadius: 8,
    padding: '0 12px',
    height: 36,
    color: '#ffffff',
    fontSize: 13,
    outline: 'none',
    width: 200,
    transition: 'border-color 200ms ease'
  }),
  filterSelect: {
    background: '#2a2b2f',
    border: '1px solid #47484c',
    borderRadius: 8,
    color: '#ffffff',
    fontSize: 13,
    padding: '0 12px',
    height: 36,
    outline: 'none',
    cursor: 'pointer'
  },
  
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14, marginTop: 8 },
  thRow: { background: '#1e2023' },
  th: { color: '#a0a0a8', fontWeight: 500, padding: '12px 16px', textAlign: 'left', borderBottom: '1px solid #47484c', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.5px' },
  tr: { borderBottom: '1px solid #47484c', height: 48, transition: 'background 150ms ease' },
  td: { color: '#ffffff', padding: '12px 16px' },
  
  scanSummary: { color: '#a0a0a8', fontSize: 13, marginBottom: 12 },
  highlight: { color: '#58a6ff', fontFamily: 'monospace', fontWeight: 600 },
  portBadge: { background: '#1a2a3a', color: '#58a6ff', padding: '2px 8px', borderRadius: 12, fontFamily: 'monospace', fontSize: 12, fontWeight: 500 },
  openBadge: { background: '#1a3a1a', color: '#3fb950', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700 },
  ipBadge: { background: '#1a2a3a', color: '#58a6ff', padding: '2px 8px', borderRadius: 12, fontSize: 12, fontFamily: 'monospace', fontWeight: 500 },
  macBadge: { background: '#251a3a', color: '#a0a0a8', padding: '2px 8px', borderRadius: 12, fontSize: 12, fontFamily: 'monospace' },
  dimText: { color: '#a0a0a8', fontSize: 13 },
  scrollBox: { maxHeight: 200, overflowY: 'auto' },
  blockedRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderBottom: '1px solid #47484c' },
  
  // Modal styles
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.65)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    backdropFilter: 'blur(2px)'
  },
  modalCard: {
    background: '#2a2b2f',
    border: '1px solid #47484c',
    borderRadius: 12,
    padding: 24,
    width: '100%',
    maxWidth: 420,
    boxShadow: '0 20px 40px rgba(0,0,0,0.5)'
  },
  modalInput: {
    background: '#1e2023',
    border: '1px solid #47484c',
    borderRadius: 8,
    padding: '10px 14px',
    color: '#ffffff',
    fontSize: 13,
    outline: 'none',
    transition: 'border-color 200ms ease'
  },
  modalActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 12
  },
  speedTestLayout: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 32, padding: '20px 0' },
  gaugeContainer: { position: 'relative', width: 280, height: 160, display: 'flex', justifyContent: 'center', overflow: 'hidden' },
  gaugeOuter: { position: 'relative', width: 280, height: 280, borderRadius: '50%', background: '#1e2023', border: '10px solid #2a2b2f', display: 'flex', justifyContent: 'center', alignItems: 'center' },
  gaugeArc: { position: 'absolute', top: -10, left: -10, right: -10, bottom: -10, borderRadius: '50%', border: '10px solid transparent', borderTopColor: '#58a6ff', borderRightColor: '#58a6ff', transform: 'rotate(-45deg)', opacity: 0.15 },
  gaugeNeedle: (deg) => ({
    position: 'absolute',
    width: 4,
    height: 100,
    background: 'linear-gradient(to top, #58a6ff, #3fb950)',
    bottom: '50%',
    left: 'calc(50% - 2px)',
    transformOrigin: 'bottom center',
    transform: `rotate(${deg}deg)`,
    transition: 'transform 1000ms cubic-bezier(0.1, 0.8, 0.25, 1)',
    borderRadius: 2,
    boxShadow: '0 0 10px rgba(88,166,255,0.5)'
  }),
  gaugeCenter: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: '50%',
    background: '#2a2b2f',
    boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    border: '1px solid #47484c'
  },
  gaugeValue: { fontSize: 32, fontWeight: 700, color: '#ffffff', fontFamily: 'monospace' },
  gaugeUnit: { fontSize: 12, color: '#a0a0a8', fontWeight: 600, marginTop: -4 },
  gaugeLabel: { fontSize: 10, color: '#a0a0a8', fontWeight: 700, letterSpacing: '1px', marginTop: 12 },
  speedTestGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, width: '100%', maxWidth: 600 },
  speedTestStatCard: { background: '#1e2023', borderRadius: 12, padding: '16px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, border: '1px solid #47484c', transition: 'border-color 200ms ease' },
  speedTestStatIcon: { fontSize: 24 },
  speedTestStatLabel: { fontSize: 10, color: '#a0a0a8', fontWeight: 700, letterSpacing: '0.5px' },
  speedTestStatVal: { fontSize: 20, color: '#ffffff', fontWeight: 700, fontFamily: 'monospace' }
};
