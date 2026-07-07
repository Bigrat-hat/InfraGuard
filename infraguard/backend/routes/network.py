from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from models.database import get_db
from models.tables import BlockedIP, NetworkLog, User
from auth import get_current_user, require_admin
from services.network_service import (
    get_active_connections, block_ip, unblock_ip, kill_connection, get_bandwidth_per_process,
    run_ping, run_traceroute, run_nslookup, run_arp, run_whois, run_netstat, run_nmap,
    scan_ports, discover_hosts, parse_arp_table, get_local_interfaces
)
from services.audit import log_action

router = APIRouter(prefix="/api/network", tags=["network"])


class BlockRequest(BaseModel):
    ip: str
    reason: str = ""


class KillRequest(BaseModel):
    pid: int
    ip: str


class ToolRequest(BaseModel):
    host: str
    args: Optional[str] = None


class PortScanRequest(BaseModel):
    ip: str
    ports: Optional[list[int]] = None


class DiscoverRequest(BaseModel):
    subnet: str  # e.g. "192.168.1"


@router.get("/connections")
async def connections(current_user: User = Depends(get_current_user)):
    return get_active_connections()


@router.get("/bandwidth")
async def bandwidth(current_user: User = Depends(get_current_user)):
    return get_bandwidth_per_process()


@router.get("/blocked")
async def list_blocked(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(BlockedIP))
    return [{"id": b.id, "ip": b.ip, "reason": b.reason, "blocked_at": b.blocked_at, "blocked_by": b.blocked_by}
            for b in result.scalars().all()]


@router.post("/block")
async def block(req: BlockRequest, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_admin)):
    success, err = block_ip(req.ip)
    if not success:
        raise HTTPException(status_code=500, detail=f"iptables error: {err}")
    existing = await db.execute(select(BlockedIP).where(BlockedIP.ip == req.ip))
    if not existing.scalar_one_or_none():
        db.add(BlockedIP(ip=req.ip, reason=req.reason, blocked_by=current_user.username))
    db.add(NetworkLog(ip=req.ip, process="", action="block_ip", performed_by=current_user.username))
    await db.commit()
    await log_action(db, current_user.id, "block_ip", req.ip)
    return {"message": f"IP {req.ip} blocked"}


@router.post("/unblock")
async def unblock(req: BlockRequest, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_admin)):
    success, err = unblock_ip(req.ip)
    if not success:
        raise HTTPException(status_code=500, detail=f"iptables error: {err}")
    result = await db.execute(select(BlockedIP).where(BlockedIP.ip == req.ip))
    entry = result.scalar_one_or_none()
    if entry:
        await db.delete(entry)
    db.add(NetworkLog(ip=req.ip, process="", action="unblock_ip", performed_by=current_user.username))
    await db.commit()
    await log_action(db, current_user.id, "unblock_ip", req.ip)
    return {"message": f"IP {req.ip} unblocked"}


@router.post("/kill")
async def kill(req: KillRequest, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_admin)):
    success, msg = kill_connection(req.pid)
    if not success:
        raise HTTPException(status_code=500, detail=msg)
    db.add(NetworkLog(ip=req.ip, process=str(req.pid), action="kill_connection", performed_by=current_user.username))
    await db.commit()
    await log_action(db, current_user.id, "kill_connection", f"pid:{req.pid}")
    return {"message": msg}


@router.get("/logs")
async def network_logs(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(NetworkLog).order_by(NetworkLog.timestamp.desc()).limit(100))
    logs = result.scalars().all()
    return [{"id": l.id, "ip": l.ip, "process": l.process, "action": l.action,
             "timestamp": l.timestamp, "performed_by": l.performed_by} for l in logs]


# ── Networking Tools ──────────────────────────────────────────────────────────

@router.post("/tools/ping")
async def tool_ping(req: ToolRequest, current_user: User = Depends(get_current_user)):
    count = int(req.args) if req.args and req.args.isdigit() else 4
    return {"output": run_ping(req.host, count)}


@router.post("/tools/traceroute")
async def tool_traceroute(req: ToolRequest, current_user: User = Depends(get_current_user)):
    return {"output": run_traceroute(req.host)}


@router.post("/tools/nslookup")
async def tool_nslookup(req: ToolRequest, current_user: User = Depends(get_current_user)):
    return {"output": run_nslookup(req.host)}


@router.post("/tools/whois")
async def tool_whois(req: ToolRequest, current_user: User = Depends(get_current_user)):
    return {"output": run_whois(req.host)}


@router.get("/tools/netstat")
async def tool_netstat(current_user: User = Depends(get_current_user)):
    return {"output": run_netstat()}


@router.post("/tools/nmap")
async def tool_nmap(req: ToolRequest, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_admin)):
    args = req.args or "-sV --open -T4"
    await log_action(db, current_user.id, "nmap", req.host)
    return {"output": run_nmap(req.host, args)}


@router.get("/tools/arp")
async def tool_arp(current_user: User = Depends(get_current_user)):
    return {"raw": run_arp(), "devices": parse_arp_table(), "interfaces": get_local_interfaces()}


@router.post("/tools/portscan")
async def tool_portscan(req: PortScanRequest, current_user: User = Depends(get_current_user)):
    results = scan_ports(req.ip, req.ports)
    return {"ip": req.ip, "open_ports": results, "total_open": len(results)}


@router.post("/tools/discover")
async def tool_discover(req: DiscoverRequest, current_user: User = Depends(get_current_user)):
    hosts = discover_hosts(req.subnet)
    return {"subnet": req.subnet, "hosts": hosts, "total": len(hosts)}


@router.post("/tools/speedtest")
async def tool_speedtest(current_user: User = Depends(get_current_user)):
    from services.speedtest import run_speedtest
    return await run_speedtest()
