import React, { useState, useEffect, useRef, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

function MetricGauge({ label, value, color }) {
  return (
    <div style={gaugeStyles.wrap}>
      <div style={gaugeStyles.label}>{label}</div>
      <div style={gaugeStyles.bar}>
        <div style={{ ...gaugeStyles.fill, width: `${value || 0}%`, background: color }} />
      </div>
      <div style={gaugeStyles.val}>{value != null ? `${value.toFixed(1)}%` : 'N/A'}</div>
    </div>
  );
}

function ServerMetrics({ server }) {
  const [metrics, setMetrics] = useState([]);
  const wsRef = useRef(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const host = window.location.hostname || 'localhost';
    const ws = new WebSocket(`ws://${host}:8080/ws/server/${server.id}?token=${token}`);
    wsRef.current = ws;
    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      setMetrics(prev => [...prev.slice(-29), { ...data, time: new Date().toLocaleTimeString() }]);
    };
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [server.id]);

  const latest = metrics[metrics.length - 1] || {};
  return (
    <div>
      <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
        <MetricGauge label="CPU" value={latest.cpu} color="#3b82f6" />
        <MetricGauge label="RAM" value={latest.ram} color="#8b5cf6" />
        <MetricGauge label="Disk" value={latest.disk} color="#f59e0b" />
      </div>
      <ResponsiveContainer width="100%" height={120}>
        <LineChart data={metrics}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 10 }} />
          <YAxis domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 10 }} />
          <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', color: '#f1f5f9', fontSize: 12 }} />
          <Line type="monotone" dataKey="cpu" stroke="#3b82f6" dot={false} strokeWidth={2} />
          <Line type="monotone" dataKey="ram" stroke="#8b5cf6" dot={false} strokeWidth={2} />
          <Line type="monotone" dataKey="disk" stroke="#f59e0b" dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function Terminal({ server }) {
  const [history, setHistory] = useState([]);
  const [cmd, setCmd] = useState('');
  const historyMapRef = useRef({});
  const wsRef = useRef(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    setHistory(historyMapRef.current[server.id] || []);
  }, [server.id]);

  const appendHistory = useCallback((line) => {
    setHistory(prev => {
      const next = [...prev, line];
      historyMapRef.current[server.id] = next;
      return next;
    });
  }, [server.id]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const host = window.location.hostname || 'localhost';
    const ws = new WebSocket(`ws://${host}:8080/ws/terminal/${server.id}?token=${token}`);
    wsRef.current = ws;
    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      appendHistory(data.output);
    };
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [server.id, appendHistory]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [history]);

  const send = (e) => {
    e.preventDefault();
    const value = cmd.trim();
    if (!value || !wsRef.current) return;
    if (value.toLowerCase() === 'clear') {
      setHistory([]);
      historyMapRef.current[server.id] = [];
      setCmd('');
      return;
    }
    appendHistory(`$ ${cmd}\n`);
    wsRef.current.send(JSON.stringify({ command: cmd }));
    setCmd('');
  };

  return (
    <div style={termStyles.wrap}>
      <div style={termStyles.output}>
        {history.map((line, i) => <pre key={i} style={termStyles.line}>{line}</pre>)}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={send} style={termStyles.inputRow}>
        <span style={termStyles.prompt}>$</span>
        <input style={termStyles.input} value={cmd} onChange={e => setCmd(e.target.value)}
          placeholder="Enter command..." autoFocus />
        <button style={termStyles.btn} type="submit">Run</button>
      </form>
    </div>
  );
}

function SFTPBrowser({ server }) {
  const [path, setPath] = useState('/');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const { isAdmin } = useAuth();

  const browse = useCallback(async (p) => {
    setLoading(true);
    try {
      const res = await axios.get(`/api/servers/${server.id}/sftp`, { params: { path: p } });
      setItems(res.data.items);
      setPath(p);
    } catch { } finally { setLoading(false); }
  }, [server.id]);

  useEffect(() => { browse('/'); }, [browse]);

  const navigate = (item) => {
    if (item.is_dir) browse(`${path === '/' ? '' : path}/${item.name}`);
  };

  const download = async (item) => {
    const filePath = `${path === '/' ? '' : path}/${item.name}`;
    const res = await axios.get(`/api/servers/${server.id}/sftp/download`, {
      params: { path: filePath }, responseType: 'blob'
    });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a'); a.href = url; a.download = item.name; a.click();
  };

  const upload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    await axios.post(`/api/servers/${server.id}/sftp/upload?remote_path=${path}`, form);
    browse(path);
  };

  const goUp = () => {
    const parts = path.split('/').filter(Boolean);
    parts.pop();
    browse('/' + parts.join('/') || '/');
  };

  return (
    <div>
      <div style={sftpStyles.pathBar}>
        <button style={sftpStyles.navBtn} onClick={goUp} disabled={path === '/'}>↑ Up</button>
        <span style={sftpStyles.path}>{path}</span>
        {isAdmin && <label style={sftpStyles.uploadBtn}>📤 Upload<input type="file" hidden onChange={upload} /></label>}
      </div>
      {loading ? <p style={{ color: '#64748b' }}>Loading...</p> : (
        <div style={sftpStyles.list}>
          {items.map((item, i) => (
            <div key={i} style={sftpStyles.item}>
              <span style={{ cursor: item.is_dir ? 'pointer' : 'default' }} onClick={() => navigate(item)}>
                {item.is_dir ? '📁' : '📄'} {item.name}
              </span>
              <span style={sftpStyles.size}>{item.is_dir ? '' : `${(item.size / 1024).toFixed(1)} KB`}</span>
              {!item.is_dir && <button style={sftpStyles.dlBtn} onClick={() => download(item)}>⬇</button>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Servers() {
  const [servers, setServers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [activeTab, setActiveTab] = useState('metrics');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', ip: '', port: 22, username: '', password: '' });
  const [error, setError] = useState(null);
  const { isAdmin } = useAuth();

  const fetchStatus = useCallback(async (serverId) => {
    try {
      const res = await axios.get(`/api/servers/${serverId}/status`);
      setServers(prev => prev.map(s => s.id === serverId ? { ...s, status: res.data.status } : s));
    } catch (err) {
      setServers(prev => prev.map(s => s.id === serverId ? { ...s, status: 'offline' } : s));
    }
  }, []);

  const fetchServers = useCallback(async () => {
    try {
      const res = await axios.get('/api/servers');
      setServers(res.data);
      setError(null);
      await Promise.all(res.data.map(s => fetchStatus(s.id)));
    } catch (err) {
      console.error(err);
      setError('Unable to load servers. Ensure the backend is running on port 8080.');
    }
  }, [fetchStatus]);

  useEffect(() => { fetchServers(); }, [fetchServers]);

  const addServer = async (e) => {
    e.preventDefault();
    try {
      await axios.post('/api/servers', form);
      setShowAdd(false);
      setForm({ name: '', ip: '', port: 22, username: '', password: '' });
      fetchServers();
      setError(null);
    } catch (err) {
      console.error(err);
      setError('Failed to add server.');
    }
  };

  const deleteServer = async (id) => {
    if (!window.confirm('Delete this server?')) return;
    try {
      await axios.delete(`/api/servers/${id}`);
      if (selected?.id === id) setSelected(null);
      fetchServers();
      setError(null);
    } catch (err) {
      console.error(err);
      setError('Failed to delete server.');
    }
  };

  return (
    <div style={{ display: 'flex', gap: 16, height: 'calc(100vh - 108px)' }}>
      <div style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <span style={{ color: '#f1f5f9', fontWeight: 600 }}>Servers ({servers.length})</span>
          {isAdmin && <button style={styles.addBtn} onClick={() => setShowAdd(!showAdd)}>+ Add</button>}
        </div>

        {showAdd && (
          <form onSubmit={addServer} style={styles.addForm}>
            {['name', 'ip', 'username', 'password'].map(f => (
              <input key={f} style={styles.input} placeholder={f.charAt(0).toUpperCase() + f.slice(1)}
                type={f === 'password' ? 'password' : 'text'}
                value={form[f]} onChange={e => setForm({ ...form, [f]: e.target.value })} required />
            ))}
            <input style={styles.input} placeholder="Port" type="number" value={form.port}
              onChange={e => setForm({ ...form, port: parseInt(e.target.value) })} />
            <button style={styles.submitBtn} type="submit">Add Server</button>
          </form>
        )}

        {servers.map(s => (
          <div key={s.id} style={{ ...styles.serverItem, ...(selected?.id === s.id ? styles.serverItemActive : {}) }}
            onClick={() => setSelected(s)}>
            <div style={styles.serverName}>{s.name}</div>
            <div style={styles.serverIP}>{s.ip}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={styles.statusDot(s.status)}>{s.status}</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button style={styles.checkBtn} onClick={e => { e.stopPropagation(); fetchStatus(s.id); }}>Check</button>
                {isAdmin && <button style={styles.delBtn} onClick={e => { e.stopPropagation(); deleteServer(s.id); }}>✕</button>}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={styles.main}>
        {!selected ? (
          <div style={styles.empty}>Select a server to view details</div>
        ) : (
          <>
            <div style={styles.tabBar}>
              {['metrics', 'terminal', 'sftp'].map(t => (
                <button key={t} style={{ ...styles.tab, ...(activeTab === t ? styles.tabActive : {}) }}
                  onClick={() => setActiveTab(t)}>
                  {t === 'metrics' ? '📊 Metrics' : t === 'terminal' ? '💻 Terminal' : '📁 SFTP'}
                </button>
              ))}
              <span style={styles.serverTitle}>{selected.name} — {selected.ip}</span>
            </div>
            <div style={styles.tabContent}>
              {activeTab === 'metrics' && <ServerMetrics server={selected} />}
              {activeTab === 'terminal' && isAdmin && <Terminal server={selected} />}
              {activeTab === 'terminal' && !isAdmin && <p style={{ color: '#64748b' }}>Terminal requires admin access.</p>}
              {activeTab === 'sftp' && <SFTPBrowser server={selected} />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const styles = {
  sidebar: { width: 240, background: '#1e293b', borderRadius: 10, border: '1px solid #334155', overflowY: 'auto', flexShrink: 0 },
  sidebarHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid #334155' },
  addBtn: { background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 5, padding: '4px 10px', cursor: 'pointer', fontSize: 12 },
  addForm: { padding: 12, display: 'flex', flexDirection: 'column', gap: 8, borderBottom: '1px solid #334155' },
  input: { background: '#0f172a', border: '1px solid #334155', borderRadius: 6, padding: '7px 10px', color: '#f1f5f9', fontSize: 13 },
  submitBtn: { background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, padding: '7px', cursor: 'pointer', fontSize: 13 },
  serverItem: { padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid #334155' },
  serverItemActive: { background: '#1d4ed820' },
  serverName: { color: '#f1f5f9', fontWeight: 600, fontSize: 14 },
  serverIP: { color: '#64748b', fontSize: 12, fontFamily: 'monospace', margin: '2px 0 6px' },
  statusDot: (s) => ({ color: s === 'online' ? '#4ade80' : s === 'offline' ? '#f87171' : '#fbbf24', fontSize: 12 }),
  delBtn: { background: 'transparent', color: '#64748b', border: 'none', cursor: 'pointer', fontSize: 14 },
  main: { flex: 1, background: '#1e293b', borderRadius: 10, border: '1px solid #334155', overflow: 'hidden', display: 'flex', flexDirection: 'column' },
  empty: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b' },
  tabBar: { display: 'flex', gap: 4, padding: '12px 16px', borderBottom: '1px solid #334155', alignItems: 'center' },
  tab: { background: 'transparent', color: '#94a3b8', border: 'none', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 13 },
  tabActive: { background: '#1d4ed8', color: '#fff' },
  serverTitle: { marginLeft: 'auto', color: '#64748b', fontSize: 13 },
  tabContent: { padding: 20, flex: 1, overflowY: 'auto' },
  checkBtn: { background: '#2563eb', color: '#fff', border: 'none', borderRadius: 5, padding: '4px 10px', cursor: 'pointer', fontSize: 12 }
};

const gaugeStyles = {
  wrap: { flex: 1 },
  label: { color: '#94a3b8', fontSize: 12, marginBottom: 4 },
  bar: { background: '#0f172a', borderRadius: 4, height: 8, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4, transition: 'width 0.5s ease' },
  val: { color: '#f1f5f9', fontSize: 13, fontWeight: 600, marginTop: 4 }
};

const termStyles = {
  wrap: { background: '#0f172a', borderRadius: 8, border: '1px solid #334155', height: 380, display: 'flex', flexDirection: 'column' },
  output: { flex: 1, overflowY: 'auto', padding: 12 },
  line: { color: '#4ade80', fontFamily: 'monospace', fontSize: 13, margin: 0, whiteSpace: 'pre-wrap' },
  inputRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderTop: '1px solid #334155' },
  prompt: { color: '#4ade80', fontFamily: 'monospace', fontSize: 14 },
  input: { flex: 1, background: 'transparent', border: 'none', color: '#4ade80', fontFamily: 'monospace', fontSize: 13, outline: 'none' },
  btn: { background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 5, padding: '5px 12px', cursor: 'pointer', fontSize: 12 }
};

const sftpStyles = {
  pathBar: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 },
  navBtn: { background: '#334155', color: '#f1f5f9', border: 'none', borderRadius: 5, padding: '5px 10px', cursor: 'pointer', fontSize: 12 },
  path: { color: '#94a3b8', fontFamily: 'monospace', fontSize: 13, flex: 1 },
  uploadBtn: { background: '#1d4ed8', color: '#fff', borderRadius: 5, padding: '5px 10px', cursor: 'pointer', fontSize: 12 },
  list: { display: 'flex', flexDirection: 'column', gap: 2 },
  item: { display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', borderRadius: 5, color: '#cbd5e1', fontSize: 13, background: '#0f172a' },
  size: { color: '#64748b', fontSize: 12, marginLeft: 'auto' },
  dlBtn: { background: '#334155', color: '#f1f5f9', border: 'none', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 12 }
};
