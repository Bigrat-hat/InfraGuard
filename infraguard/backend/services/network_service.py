import psutil
import subprocess
import socket
import time
import re
import ipaddress
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed

_connection_history: dict[str, list[float]] = defaultdict(list)
SUSPICIOUS_THRESHOLD = 20
SUSPICIOUS_WINDOW = 60  # seconds


def get_active_connections() -> list[dict]:
    connections = []
    try:
        for conn in psutil.net_connections(kind="inet"):
            if conn.status == "ESTABLISHED" and conn.raddr:
                process_name = ""
                try:
                    if conn.pid:
                        process_name = psutil.Process(conn.pid).name()
                except Exception:
                    pass
                remote_ip = conn.raddr.ip
                _track_connection(remote_ip)
                connections.append({
                    "local_ip": conn.laddr.ip,
                    "local_port": conn.laddr.port,
                    "remote_ip": remote_ip,
                    "remote_port": conn.raddr.port,
                    "status": conn.status,
                    "pid": conn.pid,
                    "process": process_name,
                    "suspicious": _is_suspicious(remote_ip)
                })
    except Exception:
        pass
    return connections


def _track_connection(ip: str):
    now = time.time()
    _connection_history[ip].append(now)
    _connection_history[ip] = [t for t in _connection_history[ip] if now - t < SUSPICIOUS_WINDOW]


def _is_local_or_private_ip(ip: str) -> bool:
    if not ip:
        return False
    ip = ip.strip()
    if ip.lower() == "localhost":
        return True
    
    # IPv4 checks
    if re.match(r"^127\.", ip) or re.match(r"^192\.168\.", ip) or re.match(r"^10\.", ip):
        return True
    m = re.match(r"^172\.(\d+)\.", ip)
    if m:
        second_octet = int(m.group(1))
        if 16 <= second_octet <= 31:
            return True
            
    # IPv6 checks
    if ip == "::1" or ip == "0:0:0:0:0:0:0:1":
        return True
        
    try:
        ip_obj = ipaddress.ip_address(ip)
        if ip_obj.version == 6:
            # check unique local fc00::/7
            network = ipaddress.ip_network("fc00::/7")
            if ip_obj in network:
                return True
            if ip_obj.is_loopback:
                return True
    except Exception:
        pass
        
    return False


def _is_suspicious(ip: str) -> bool:
    if _is_local_or_private_ip(ip):
        return False
    return len(_connection_history.get(ip, [])) >= SUSPICIOUS_THRESHOLD


def get_bandwidth_per_process() -> list[dict]:
    try:
        procs = []
        for proc in psutil.process_iter(["pid", "name", "connections"]):
            try:
                conns = proc.info.get("connections") or []
                if conns:
                    procs.append({"process": proc.info["name"], "pid": proc.info["pid"], "connections": len(conns)})
            except Exception:
                pass
        return procs[:20]
    except Exception:
        return []


_last_io = None
_last_io_time = None

def get_system_bandwidth() -> dict:
    global _last_io, _last_io_time
    try:
        io = psutil.net_io_counters()
        now = time.time()
        
        if _last_io is None or _last_io_time is None:
            _last_io = io
            _last_io_time = now
            return {"upload": 0.0, "download": 0.0}
            
        elapsed = now - _last_io_time
        if elapsed <= 0:
            return {"upload": 0.0, "download": 0.0}
            
        # Calculate bytes per second
        upload_bps = (io.bytes_sent - _last_io.bytes_sent) / elapsed
        download_bps = (io.bytes_recv - _last_io.bytes_recv) / elapsed
        
        _last_io = io
        _last_io_time = now
        
        # Convert to KB/s for human readable charts
        return {
            "upload": round(upload_bps / 1024.0, 2),
            "download": round(download_bps / 1024.0, 2)
        }
    except Exception:
        return {"upload": 0.0, "download": 0.0}


def block_ip(ip: str) -> tuple[bool, str]:
    try:
        result = subprocess.run(
            ["iptables", "-A", "INPUT", "-s", ip, "-j", "DROP"],
            capture_output=True, text=True, timeout=10
        )
        return result.returncode == 0, result.stderr
    except Exception as e:
        return False, str(e)


def unblock_ip(ip: str) -> tuple[bool, str]:
    try:
        result = subprocess.run(
            ["iptables", "-D", "INPUT", "-s", ip, "-j", "DROP"],
            capture_output=True, text=True, timeout=10
        )
        return result.returncode == 0, result.stderr
    except Exception as e:
        return False, str(e)


def kill_connection(pid: int) -> tuple[bool, str]:
    try:
        proc = psutil.Process(pid)
        proc.terminate()
        return True, f"Process {pid} terminated"
    except psutil.NoSuchProcess:
        return False, "Process not found"
    except Exception as e:
        return False, str(e)


# ── Networking Tools ──────────────────────────────────────────────────────────

def run_ping(host: str, count: int = 4) -> str:
    import platform
    flag = "-n" if platform.system().lower() == "windows" else "-c"
    try:
        r = subprocess.run(["ping", flag, str(count), host],
                           capture_output=True, text=True, timeout=30)
        return r.stdout or r.stderr
    except Exception as e:
        return str(e)


def run_traceroute(host: str) -> str:
    import platform
    cmd = ["tracert", host] if platform.system().lower() == "windows" else ["traceroute", "-m", "20", host]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        return r.stdout or r.stderr
    except Exception as e:
        return str(e)


def run_nslookup(host: str) -> str:
    try:
        r = subprocess.run(["nslookup", host], capture_output=True, text=True, timeout=15)
        return r.stdout or r.stderr
    except Exception as e:
        return str(e)


def run_arp() -> str:
    try:
        r = subprocess.run(["arp", "-a"], capture_output=True, text=True, timeout=15)
        return r.stdout or r.stderr
    except Exception as e:
        return str(e)


def _whois_query_server(target: str, server: str) -> str:
    with socket.create_connection((server, 43), timeout=20) as conn:
        conn.sendall((target + "\r\n").encode('utf-8'))
        data = []
        while True:
            chunk = conn.recv(4096)
            if not chunk:
                break
            data.append(chunk.decode('utf-8', errors='replace'))
        return ''.join(data)


def _whois_query(host: str) -> str:
    host = host.strip()
    if not host:
        raise ValueError("Empty host")
    output = _whois_query_server(host, 'whois.iana.org')
    referral = None
    m = re.search(r'whois:\s*(\S+)', output, re.IGNORECASE)
    if m:
        referral = m.group(1).strip()
    else:
        m = re.search(r'Whois Server:\s*(\S+)', output, re.IGNORECASE)
        if m:
            referral = m.group(1).strip()
    if referral and referral != 'whois.iana.org':
        try:
            return _whois_query_server(host, referral)
        except Exception:
            pass
    return output


def run_whois(host: str) -> str:
    try:
        r = subprocess.run(["whois", host], capture_output=True, text=True, timeout=20)
        return r.stdout or r.stderr
    except FileNotFoundError:
        try:
            return _whois_query(host)
        except Exception as e:
            plat = socket.gethostname()
            return f"whois not installed. Install with: apt install whois\nFallback failed: {e}"
    except Exception as e:
        return str(e)


def run_netstat() -> str:
    import platform
    cmd = ["netstat", "-ano"] if platform.system().lower() == "windows" else ["netstat", "-tulnp"]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
        return r.stdout or r.stderr
    except Exception as e:
        return str(e)


def run_nmap(host: str, args: str = "-sV --open -T4") -> str:
    try:
        cmd = ["nmap"] + args.split() + [host]
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        return r.stdout or r.stderr
    except FileNotFoundError:
        fallback = scan_ports(host)
        if fallback:
            lines = [f"HOST: {host}", "PORT     STATE    SERVICE"]
            for port in fallback:
                lines.append(f"{port['port']}/tcp   {port['state']}   {port['service']}")
            return "nmap not installed. Falling back to built-in port scan:\n" + "\n".join(lines)
        return "nmap not installed. Install with: apt install nmap"
    except Exception as e:
        return str(e)


def _check_port(ip: str, port: int, timeout: float = 0.5) -> dict:
    try:
        with socket.create_connection((ip, port), timeout=timeout):
            try:
                service = socket.getservbyport(port)
            except Exception:
                service = "unknown"
            return {"port": port, "state": "open", "service": service}
    except Exception:
        return {"port": port, "state": "closed", "service": ""}


COMMON_PORTS = [
    21, 22, 23, 25, 53, 80, 110, 111, 135, 139, 143, 443, 445,
    993, 995, 1723, 3306, 3389, 5900, 8080, 8443, 8888, 27017
]


def scan_ports(ip: str, ports: list[int] | None = None, timeout: float = 0.5) -> list[dict]:
    target_ports = ports or COMMON_PORTS
    results = []
    with ThreadPoolExecutor(max_workers=50) as ex:
        futures = {ex.submit(_check_port, ip, p, timeout): p for p in target_ports}
        for f in as_completed(futures):
            result = f.result()
            if result["state"] == "open":
                results.append(result)
    return sorted(results, key=lambda x: x["port"])


def _ping_host(ip: str) -> bool:
    import platform
    flag = "-n" if platform.system().lower() == "windows" else "-c"
    try:
        r = subprocess.run(["ping", flag, "1", "-w", "500", ip],
                           capture_output=True, timeout=2)
        return r.returncode == 0
    except Exception:
        return False


def discover_hosts(subnet: str) -> list[dict]:
    """Ping sweep a /24 subnet e.g. '192.168.1'"""
    hosts = []
    ips = [f"{subnet}.{i}" for i in range(1, 255)]
    with ThreadPoolExecutor(max_workers=100) as ex:
        futures = {ex.submit(_ping_host, ip): ip for ip in ips}
        for f in as_completed(futures):
            ip = futures[f]
            if f.result():
                try:
                    hostname = socket.gethostbyaddr(ip)[0]
                except Exception:
                    hostname = ""
                hosts.append({"ip": ip, "hostname": hostname, "status": "up"})
    return sorted(hosts, key=lambda x: list(map(int, x["ip"].split("."))))


def parse_arp_table() -> list[dict]:
    """Parse arp -a output, resolve hostnames, detect device type"""
    raw = run_arp()
    devices = []
    seen = set()
    for line in raw.splitlines():
        m = re.search(
            r'(\d+\.\d+\.\d+\.\d+).*?'
            r'([0-9a-fA-F]{2}[:\-][0-9a-fA-F]{2}[:\-][0-9a-fA-F]{2}'
            r'[:\-][0-9a-fA-F]{2}[:\-][0-9a-fA-F]{2}[:\-][0-9a-fA-F]{2})',
            line
        )
        if not m:
            continue
        ip = m.group(1)
        mac = m.group(2).upper()
        # skip broadcast / invalid
        if ip in seen or ip.endswith('.255') or mac in ('FF-FF-FF-FF-FF-FF', 'FF:FF:FF:FF:FF:FF'):
            continue
        seen.add(ip)
        # resolve hostname
        try:
            hostname = socket.gethostbyaddr(ip)[0]
        except Exception:
            hostname = ''
        # detect entry type from raw line
        entry_type = 'dynamic'
        if 'static' in line.lower():
            entry_type = 'static'
        elif 'invalid' in line.lower():
            entry_type = 'invalid'
        devices.append({
            'ip': ip,
            'mac': mac,
            'hostname': hostname,
            'type': entry_type
        })
    # sort by last octet
    devices.sort(key=lambda x: int(x['ip'].split('.')[-1]))
    return devices


def get_local_interfaces() -> list[dict]:
    """Return all local network interfaces with IP and netmask"""
    interfaces = []
    for name, addrs in psutil.net_if_addrs().items():
        for addr in addrs:
            if addr.family == socket.AF_INET and not addr.address.startswith('127.'):
                stats = psutil.net_if_stats().get(name)
                interfaces.append({
                    'interface': name,
                    'ip': addr.address,
                    'netmask': addr.netmask,
                    'is_up': stats.isup if stats else False,
                    'speed': stats.speed if stats else 0
                })
    return interfaces
