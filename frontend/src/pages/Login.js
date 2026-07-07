import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [userFocused, setUserFocused] = useState(false);
  const [passFocused, setPassFocused] = useState(false);
  const [btnHovered, setBtnHovered] = useState(false);
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
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#58a6ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 12 }}>
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          <h1 style={styles.title}>InfraGuard</h1>
          <p style={styles.subtitle}>Unified Infrastructure Control Platform</p>
        </div>
        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            style={styles.input(userFocused)}
            type="text"
            placeholder="Username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            onFocus={() => setUserFocused(true)}
            onBlur={() => setUserFocused(false)}
            required
          />
          <input
            style={styles.input(passFocused)}
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onFocus={() => setPassFocused(true)}
            onBlur={() => setPassFocused(false)}
            required
          />
          {error && <p style={styles.error}>{error}</p>}
          <button
            style={{
              ...styles.button,
              ...(btnHovered ? styles.buttonHovered : {})
            }}
            type="submit"
            disabled={loading}
            onMouseEnter={() => setBtnHovered(true)}
            onMouseLeave={() => setBtnHovered(false)}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        <p style={styles.hint}>Default: admin / admin123 · viewer / viewer123</p>
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#1e2023',
    fontFamily: 'Inter, sans-serif'
  },
  card: {
    background: '#2a2b2f',
    border: '1px solid #47484c',
    borderRadius: 12,
    padding: '48px 40px',
    width: 380,
    boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4)'
  },
  logo: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    marginBottom: 32
  },
  title: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: 700,
    margin: '8px 0 4px',
    letterSpacing: '-0.5px'
  },
  subtitle: {
    color: '#a0a0a8',
    fontSize: 13
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16
  },
  input: (focused) => ({
    background: '#1e2023',
    border: `1px solid ${focused ? '#58a6ff' : '#47484c'}`,
    borderRadius: 8,
    padding: '12px 16px',
    color: '#ffffff',
    fontSize: 14,
    outline: 'none',
    transition: 'border-color 200ms ease'
  }),
  error: {
    color: '#f85149',
    fontSize: 13,
    margin: 0,
    textAlign: 'center'
  },
  button: {
    background: '#58a6ff',
    color: '#ffffff',
    border: 'none',
    borderRadius: 20,
    padding: '13px',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background 200ms ease, transform 150ms ease',
    marginTop: 8
  },
  buttonHovered: {
    background: '#408ee0'
  },
  hint: {
    color: '#a0a0a8',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 20
  }
};
