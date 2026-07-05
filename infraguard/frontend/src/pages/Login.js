import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login(username, password);
      navigate('/network');
    } catch (err) {
      console.error('Login failed:', err.response?.data || err.message || err);
      setError(err.response?.data?.detail || 'Invalid username or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.logo}>
          <span style={styles.logoIcon}>🛡️</span>
          <h1 style={styles.title}>InfraGuard</h1>
          <p style={styles.subtitle}>Unified Infrastructure Control Platform</p>
        </div>
        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            style={styles.input}
            type="text"
            placeholder="Username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            required
          />
          <input
            style={styles.input}
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
          {error && <p style={styles.error}>{error}</p>}
          <button style={styles.button} type="submit" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        <p style={styles.hint}>Default: admin / admin123 · viewer / viewer123</p>
      </div>
    </div>
  );
}

const styles = {
  container: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a' },
  card: { background: '#1e293b', borderRadius: 12, padding: '48px 40px', width: 380, boxShadow: '0 25px 50px rgba(0,0,0,0.5)' },
  logo: { textAlign: 'center', marginBottom: 32 },
  logoIcon: { fontSize: 48 },
  title: { color: '#f1f5f9', fontSize: 28, fontWeight: 700, margin: '8px 0 4px' },
  subtitle: { color: '#64748b', fontSize: 13 },
  form: { display: 'flex', flexDirection: 'column', gap: 16 },
  input: { background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: '12px 16px', color: '#f1f5f9', fontSize: 14, outline: 'none' },
  error: { color: '#ef4444', fontSize: 13, margin: 0 },
  button: { background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, padding: '13px', fontSize: 15, fontWeight: 600, cursor: 'pointer' },
  hint: { color: '#475569', fontSize: 12, textAlign: 'center', marginTop: 20 }
};
