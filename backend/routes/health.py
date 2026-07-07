from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timedelta
from models.database import get_db
from models.tables import Server, SystemHealth, Alert, User
from auth import get_current_user
from services.ssh_service import get_server_metrics, run_smartctl
from services.report_service import generate_health_report
from services.audit import create_alert

router = APIRouter(prefix="/api/health", tags=["health"])


def _parse_smart(output: str) -> dict:
    health_pct = 100
    days_remaining = None
    status = "PASSED"
    for line in output.splitlines():
        if "FAILED" in line.upper():
            status = "FAILED"
            health_pct = 0
        if "Reallocated_Sector_Ct" in line:
            parts = line.split()
            if len(parts) >= 10:
                try:
                    val = int(parts[9])
                    health_pct = max(0, 100 - val * 2)
                except ValueError:
                    pass
        if "Power_On_Hours" in line:
            parts = line.split()
            if len(parts) >= 10:
                try:
                    hours = int(parts[9])
                    # Estimate: average HDD life ~50000 hours
                    days_remaining = max(0, int((50000 - hours) / 24))
                except ValueError:
                    pass
    return {"status": status, "health_pct": health_pct, "days_remaining": days_remaining}


@router.get("")
async def all_health(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Server))
    servers = result.scalars().all()
    out = []
    for s in servers:
        latest = await db.execute(
            select(SystemHealth).where(SystemHealth.server_id == s.id)
            .order_by(SystemHealth.timestamp.desc()).limit(1)
        )
        h = latest.scalar_one_or_none()
        status_color = "green"
        if h:
            if h.cpu > 90 or h.ram > 90 or h.disk > 90:
                status_color = "red"
            elif h.cpu > 75 or h.ram > 75 or h.disk > 75:
                status_color = "yellow"
        out.append({
            "id": s.id, "name": s.name, "ip": s.ip, "status": s.status,
            "status_color": status_color,
            "health": {"cpu": h.cpu if h else None, "ram": h.ram if h else None,
                       "disk": h.disk if h else None, "smart_status": h.smart_status if h else None}
        })
    return out


@router.post("/{server_id}/collect")
async def collect_health(server_id: int, db: AsyncSession = Depends(get_db),
                         current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Server).where(Server.id == server_id))
    server = result.scalar_one_or_none()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    metrics = get_server_metrics(server_id, server.ip, server.port, server.username, server.password_hash)
    entry = SystemHealth(server_id=server_id, cpu=metrics["cpu"], ram=metrics["ram"], disk=metrics["disk"])
    db.add(entry)
    await db.commit()
    if metrics["cpu"] > 90 or metrics["ram"] > 90 or metrics["disk"] > 90:
        await create_alert(db, server_id, "resource", f"Critical resource usage on {server.name}", "critical")
    return metrics


@router.get("/{server_id}/smart")
async def smart_analysis(server_id: int, device: str = "/dev/sda", db: AsyncSession = Depends(get_db),
                          current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Server).where(Server.id == server_id))
    server = result.scalar_one_or_none()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    raw = run_smartctl(server_id, server.ip, server.port, server.username, server.password_hash, device)
    parsed = _parse_smart(raw)
    if parsed["days_remaining"] is not None and parsed["days_remaining"] < 30:
        await create_alert(db, server_id, "disk_failure",
                           f"Disk on {server.name} may fail within {parsed['days_remaining']} days", "critical")
    return {**parsed, "raw": raw}


@router.get("/{server_id}/trends")
async def health_trends(server_id: int, db: AsyncSession = Depends(get_db),
                        current_user: User = Depends(get_current_user)):
    since = datetime.utcnow() - timedelta(days=7)
    result = await db.execute(
        select(SystemHealth).where(SystemHealth.server_id == server_id, SystemHealth.timestamp >= since)
        .order_by(SystemHealth.timestamp.asc())
    )
    records = result.scalars().all()
    return [{"timestamp": r.timestamp, "cpu": r.cpu, "ram": r.ram, "disk": r.disk} for r in records]


@router.get("/alerts")
async def list_alerts(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Alert).order_by(Alert.timestamp.desc()).limit(50))
    alerts = result.scalars().all()
    return [{"id": a.id, "server_id": a.server_id, "type": a.type, "message": a.message,
             "severity": a.severity, "timestamp": a.timestamp} for a in alerts]


@router.get("/report/pdf")
async def pdf_report(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Server))
    servers = result.scalars().all()
    servers_data = []
    for s in servers:
        latest = await db.execute(
            select(SystemHealth).where(SystemHealth.server_id == s.id)
            .order_by(SystemHealth.timestamp.desc()).limit(1)
        )
        h = latest.scalar_one_or_none()
        servers_data.append({
            "name": s.name, "ip": s.ip, "status": s.status,
            "health": {"cpu": h.cpu if h else "N/A", "ram": h.ram if h else "N/A",
                       "disk": h.disk if h else "N/A", "smart_status": h.smart_status if h else "N/A"}
        })
    pdf_bytes = generate_health_report(servers_data)
    return Response(content=pdf_bytes, media_type="application/pdf",
                    headers={"Content-Disposition": "attachment; filename=infraguard_report.pdf"})


@router.get("/audit-logs")
async def audit_logs(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    from models.tables import AuditLog
    result = await db.execute(select(AuditLog).order_by(AuditLog.timestamp.desc()).limit(100))
    logs = result.scalars().all()
    return [{"id": l.id, "user_id": l.user_id, "action": l.action,
             "target": l.target, "timestamp": l.timestamp} for l in logs]
