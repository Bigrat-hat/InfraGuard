import paramiko
import threading
from typing import Optional

_ssh_pool: dict[int, paramiko.SSHClient] = {}
_pool_lock = threading.Lock()


def _get_client(server_id: int, ip: str, port: int, username: str, password: str) -> paramiko.SSHClient:
    with _pool_lock:
        client = _ssh_pool.get(server_id)
        if client:
            transport = client.get_transport()
            if transport and transport.is_active():
                return client
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        client.connect(ip, port=port, username=username, password=password, timeout=10)
        _ssh_pool[server_id] = client
        return client


def check_server_status(ip: str, port: int, username: str, password: str) -> bool:
    try:
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        client.connect(ip, port=port, username=username, password=password, timeout=5)
        client.close()
        return True
    except Exception:
        return False


def exec_command(server_id: int, ip: str, port: int, username: str, password: str, command: str) -> str:
    try:
        client = _get_client(server_id, ip, port, username, password)
        _, stdout, stderr = client.exec_command(command, timeout=30)
        out = stdout.read().decode()
        err = stderr.read().decode()
        return out + (f"\n[stderr]: {err}" if err.strip() else "")
    except Exception as e:
        return f"Error: {e}"


def get_server_metrics(server_id: int, ip: str, port: int, username: str, password: str) -> dict:
    try:
        client = _get_client(server_id, ip, port, username, password)
        cmd = (
            "python3 -c \""
            "import psutil, json;"
            "print(json.dumps({"
            "'cpu': psutil.cpu_percent(interval=1),"
            "'ram': psutil.virtual_memory().percent,"
            "'disk': psutil.disk_usage('/').percent"
            "}))\""
        )
        _, stdout, _ = client.exec_command(cmd, timeout=15)
        import json
        return json.loads(stdout.read().decode())
    except Exception:
        return {"cpu": 0, "ram": 0, "disk": 0}


def run_smartctl(server_id: int, ip: str, port: int, username: str, password: str, device: str = "/dev/sda") -> str:
    return exec_command(server_id, ip, port, username, password, f"sudo smartctl -a {device}")


def sftp_list(server_id: int, ip: str, port: int, username: str, password: str, path: str = "/") -> list:
    try:
        client = _get_client(server_id, ip, port, username, password)
        sftp = client.open_sftp()
        items = []
        for attr in sftp.listdir_attr(path):
            import stat
            items.append({
                "name": attr.filename,
                "size": attr.st_size,
                "is_dir": stat.S_ISDIR(attr.st_mode),
                "modified": attr.st_mtime
            })
        sftp.close()
        return items
    except Exception as e:
        return []


def sftp_download(server_id: int, ip: str, port: int, username: str, password: str, remote_path: str) -> bytes:
    client = _get_client(server_id, ip, port, username, password)
    sftp = client.open_sftp()
    import io
    buf = io.BytesIO()
    sftp.getfo(remote_path, buf)
    sftp.close()
    return buf.getvalue()


def sftp_upload(server_id: int, ip: str, port: int, username: str, password: str, remote_path: str, data: bytes):
    client = _get_client(server_id, ip, port, username, password)
    sftp = client.open_sftp()
    import io
    sftp.putfo(io.BytesIO(data), remote_path)
    sftp.close()
