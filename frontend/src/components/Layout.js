import React from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Layout({ children }) {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const getPageTitle = () => {
    switch (location.pathname) {
      case '/network':
        return 'Network Monitor';
      case '/servers':
        return 'Server Management';
      case '/health':
        return 'System Health';
      default:
        return 'Dashboard';
    }
  };

  const userInitials = user?.username ? user.username.charAt(0).toUpperCase() : '?';

  return (
    <div style={styles.root}>
      {/* Fixed Sidebar */}
      <aside style={styles.sidebar}>
        <div style={styles.sidebarTop}>
          {/* Brand/Logo Section */}
          <div style={styles.brand}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#58a6ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            <span style={styles.brandText}>InfraGuard</span>
          </div>

          {/* Navigation Links */}
          <div style={styles.navLinks}>
            <NavLink
              to="/network"
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="16" y="16" width="6" height="6" rx="1"/>
                <rect x="2" y="16" width="6" height="6" rx="1"/>
                <rect x="9" y="2" width="6" height="6" rx="1"/>
                <path d="M12 8v8M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"/>
              </svg>
              <span>Network</span>
            </NavLink>
            <NavLink
              to="/servers"
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="20" height="8" rx="2" ry="2"/>
                <rect x="2" y="14" width="20" height="8" rx="2" ry="2"/>
                <line x1="6" y1="6" x2="6.01" y2="6"/>
                <line x1="6" y1="18" x2="6.01" y2="18"/>
                <line x1="20" y1="6" x2="20.01" y2="6"/>
                <line x1="20" y1="18" x2="20.01" y2="18"/>
              </svg>
              <span>Servers</span>
            </NavLink>
            <NavLink
              to="/health"
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
              </svg>
              <span>Health</span>
            </NavLink>
          </div>
        </div>

        {/* Bottom Section */}
        <div style={styles.sidebarBottom}>
          <div style={styles.userCard}>
            <div style={styles.avatar}>{userInitials}</div>
            <div style={styles.userInfo}>
              <span style={styles.username}>{user?.username || 'User'}</span>
              <span style={styles.badge(isAdmin)}>{user?.role || 'viewer'}</span>
            </div>
          </div>
          <button className="logout-btn" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div style={styles.contentArea}>
        {/* Top Navbar */}
        <header style={styles.navbar}>
          <h1 style={styles.pageTitle}>{getPageTitle()}</h1>
          <div style={styles.navRight}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a0a0a8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ cursor: 'pointer' }}>
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
            <span style={styles.badge(isAdmin)}>{user?.role || 'viewer'}</span>
            <div style={styles.avatar}>{userInitials}</div>
          </div>
        </header>

        {/* Dynamic Content */}
        <main style={styles.main}>{children}</main>
      </div>
    </div>
  );
}

const styles = {
  root: {
    display: 'flex',
    minHeight: '100vh',
    background: '#1e2023',
    color: '#ffffff'
  },
  sidebar: {
    width: '250px',
    background: 'linear-gradient(180deg, #1e1f22, #17181b)',
    borderRight: '1px solid #47484c',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    flexShrink: 0,
    height: '100vh',
    position: 'sticky',
    top: 0
  },
  sidebarTop: {
    display: 'flex',
    flexDirection: 'column'
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '20px',
    borderBottom: '1px solid #47484c'
  },
  brandText: {
    fontWeight: 700,
    fontSize: 18,
    color: '#ffffff'
  },
  navLinks: {
    display: 'flex',
    flexDirection: 'column',
    paddingTop: 16
  },
  sidebarBottom: {
    padding: '20px',
    borderTop: '1px solid #47484c',
    display: 'flex',
    flexDirection: 'column',
    gap: 16
  },
  userCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 12
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: '50%',
    background: '#58a6ff',
    color: '#ffffff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 600,
    fontSize: 14
  },
  userInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2
  },
  username: {
    fontSize: 14,
    fontWeight: 700,
    color: '#ffffff'
  },
  badge: (isAdmin) => ({
    background: isAdmin ? '#58a6ff' : '#47484c',
    color: isAdmin ? '#ffffff' : '#a0a0a8',
    fontSize: 10,
    fontWeight: 700,
    padding: '2px 8px',
    borderRadius: 10,
    alignSelf: 'flex-start',
    textTransform: 'uppercase'
  }),
  contentArea: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    minHeight: '100vh'
  },
  navbar: {
    height: 56,
    background: '#1e2023',
    borderBottom: '1px solid #47484c',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 24px',
    flexShrink: 0
  },
  pageTitle: {
    fontSize: 20,
    fontWeight: 600,
    color: '#ffffff'
  },
  navRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 16
  },
  main: {
    padding: 24,
    flex: 1,
    overflowY: 'auto'
  }
};
