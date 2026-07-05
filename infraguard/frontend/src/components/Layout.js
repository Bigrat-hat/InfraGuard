import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Layout({ children }) {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <div style={styles.root}>
      <nav style={styles.nav}>
        <div style={styles.brand}>
          <span>🛡️</span>
          <span style={styles.brandText}>InfraGuard</span>
        </div>
        <div style={styles.links}>
          {[
            { to: '/network', label: '🌐 Network' },
            { to: '/servers', label: '🖥️ Servers' },
            { to: '/health', label: '💚 Health' },
          ].map(({ to, label }) => (
            <NavLink key={to} to={to} style={({ isActive }) => ({ ...styles.link, ...(isActive ? styles.activeLink : {}) })}>
              {label}
            </NavLink>
          ))}
        </div>
        <div style={styles.userArea}>
          <span style={styles.badge(isAdmin)}>{user?.role?.toUpperCase()}</span>
          <span style={styles.username}>{user?.username}</span>
          <button style={styles.logoutBtn} onClick={handleLogout}>Logout</button>
        </div>
      </nav>
      <main style={styles.main}>{children}</main>
    </div>
  );
}

const styles = {
  root: { minHeight: '100vh', background: '#0f172a', color: '#f1f5f9' },
  nav: { display: 'flex', alignItems: 'center', background: '#1e293b', padding: '0 24px', height: 60, borderBottom: '1px solid #334155', gap: 24 },
  brand: { display: 'flex', alignItems: 'center', gap: 8, marginRight: 16 },
  brandText: { fontWeight: 700, fontSize: 18, color: '#f1f5f9' },
  links: { display: 'flex', gap: 4, flex: 1 },
  link: { color: '#94a3b8', textDecoration: 'none', padding: '6px 14px', borderRadius: 6, fontSize: 14, fontWeight: 500 },
  activeLink: { background: '#1d4ed8', color: '#fff' },
  userArea: { display: 'flex', alignItems: 'center', gap: 12 },
  badge: (isAdmin) => ({
    background: isAdmin ? '#7c3aed' : '#0369a1', color: '#fff',
    fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4
  }),
  username: { color: '#94a3b8', fontSize: 14 },
  logoutBtn: { background: '#334155', color: '#f1f5f9', border: 'none', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 13 },
  main: { padding: 24 }
};
