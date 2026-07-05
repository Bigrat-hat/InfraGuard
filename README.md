# 🛡️ InfraGuard

**Unified Infrastructure Control Platform for IT Admins and DevOps Teams**

---

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Recharts, WebSockets, React Router v6 |
| Backend | FastAPI, Python 3.11+ |
| Database | SQLite via SQLAlchemy async (aiosqlite) |
| Auth | JWT (python-jose) + bcrypt (passlib) |
| SSH/SFTP | Paramiko |
| System | psutil, subprocess, smartctl, iptables |
| PDF | ReportLab |

---

## Features

### 🔐 Authentication
- JWT login with 8-hour token expiry
- Two roles: **Admin** (full control) and **Viewer** (read-only)
- All routes protected — unauthorized users redirected to login
- Passwords stored as bcrypt hashes

### 🌐 Network Tab
- Live table of active connections (IP, port, process, status) via WebSocket every 5 seconds
- Real-time bandwidth usage graph per process (Recharts)
- Suspicious IP detection — flags IPs with 20+ connections in 60 seconds
- **Block IP** — runs `iptables -A INPUT -s <ip> -j DROP` (admin only)
- **Unblock IP** — removes iptables rule (admin only)
- **Kill Connection** — terminates the process by PID (admin only)
- Network action log history

### 🖥️ Servers Tab
- List of SSH-connected servers with online/offline status
- Per-server live CPU, RAM, disk usage graphs via WebSocket
- Interactive SSH terminal in browser — commands sent via WebSocket, executed via Paramiko
- SFTP file browser — list, navigate, upload, download files
- SSH credentials never exposed to frontend

### 💚 System Health Tab
- All servers in one view with green/yellow/red status indicators
- S.M.A.R.T disk analysis — runs `smartctl` via SSH, parses output, shows health % and estimated days remaining
- Predictive alert — auto-generates warning if disk failure estimated within 30 days
- One-click PDF report — formatted with ReportLab, includes all server stats
- Historical health trend graphs — CPU/RAM/disk over past 7 days
- Alerts panel with severity levels
- Full audit log viewer

---

## Database Schema

| Table | Purpose |
|-------|---------|
| `users` | id, username, password_hash, role |
| `servers` | id, name, ip, port, username, password_hash, status |
| `network_logs` | id, ip, process, action, timestamp, performed_by |
| `blocked_ips` | id, ip, reason, blocked_at, blocked_by |
| `system_health` | id, server_id, cpu, ram, disk, smart_status, timestamp |
| `alerts` | id, server_id, type, message, severity, timestamp |
| `audit_logs` | id, user_id, action, target, timestamp |

---

## Setup

### Prerequisites
- Python 3.11+
- Node.js 18+
- Linux host (for iptables and smartctl)
- `sudo` or root access for iptables/smartctl operations

### Backend

```bash
cd infraguard/backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Or use the start script:
```bash
chmod +x start_backend.sh
./start_backend.sh
```

### Frontend

```bash
cd infraguard/frontend
npm install
npm start
```

Or use the start script:
```bash
chmod +x start_frontend.sh
./start_frontend.sh
```

### Quick Start (two terminals)
```bash
# Terminal 1
./start_backend.sh

# Terminal 2
./start_frontend.sh
```

---

## Default Credentials

| Username | Password | Role |
|----------|----------|------|
| admin | admin123 | Admin |
| viewer | viewer123 | Viewer |

> ⚠️ Change these immediately in production via the `/api/auth/users` endpoint.

---

## API Documentation

FastAPI auto-generates Swagger UI at:
```
http://localhost:8000/docs
```

ReDoc available at:
```
http://localhost:8000/redoc
```

---

## Email Alerts (Optional)

Set environment variables to enable SMTP alerts for critical events:

```bash
export SMTP_HOST=smtp.gmail.com
export SMTP_PORT=587
export SMTP_USER=your@email.com
export SMTP_PASS=your_app_password
export ALERT_EMAIL=alerts@yourcompany.com
```

---

## ⚠️ Important Notes

### iptables (IP Blocking)
- Requires **root/sudo** privileges
- Run the backend as root or with `sudo` for IP blocking to work:
  ```bash
  sudo uvicorn main:app --host 0.0.0.0 --port 8000
  ```
- On systems with `ufw` or `firewalld`, iptables rules may be overridden

### smartctl (Disk Health)
- Requires `smartmontools` installed on **remote servers**:
  ```bash
  sudo apt install smartmontools   # Debian/Ubuntu
  sudo yum install smartmontools   # RHEL/CentOS
  ```
- The SSH user must have sudo access to run `smartctl`
- Device path defaults to `/dev/sda` — adjust per server

### SSH Passwords
- Server passwords are stored in the database for SSH connectivity
- In production, use SSH key-based auth and store private key paths instead
- The database file (`infraguard.db`) should be protected with filesystem permissions

### Production Hardening
- Change `SECRET_KEY` in `auth.py` to a strong random value
- Use HTTPS (reverse proxy with nginx + certbot)
- Restrict CORS origins in `main.py`
- Use environment variables for all secrets

---

## Folder Structure

```
infraguard/
├── backend/
│   ├── main.py                  # FastAPI app + WebSocket endpoints
│   ├── auth.py                  # JWT + bcrypt auth
│   ├── routes/
│   │   ├── auth.py              # Login, user management
│   │   ├── network.py           # Connections, block/unblock IP, kill
│   │   ├── servers.py           # Server CRUD, SSH exec, SFTP
│   │   └── health.py            # Health metrics, SMART, PDF, alerts
│   ├── models/
│   │   ├── database.py          # SQLAlchemy async engine + init
│   │   └── tables.py            # ORM models
│   ├── services/
│   │   ├── ssh_service.py       # Paramiko SSH/SFTP pool
│   │   ├── network_service.py   # psutil + iptables + subprocess
│   │   ├── report_service.py    # ReportLab PDF generation
│   │   └── audit.py             # Audit logging + email alerts
│   ├── requirements.txt
│   └── infraguard.db            # SQLite database (auto-created)
├── frontend/
│   ├── public/
│   │   └── index.html
│   ├── src/
│   │   ├── App.js               # Router + protected routes
│   │   ├── index.js
│   │   ├── context/
│   │   │   └── AuthContext.js   # JWT state + axios defaults
│   │   ├── components/
│   │   │   └── Layout.js        # Navbar + layout wrapper
│   │   └── pages/
│   │       ├── Login.js         # Login form
│   │       ├── Network.js       # Network monitoring tab
│   │       ├── Servers.js       # Server management tab
│   │       └── Health.js        # System health tab
│   └── package.json
├── start_backend.sh
├── start_frontend.sh
└── README.md
```
