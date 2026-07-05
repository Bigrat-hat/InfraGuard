from sqlalchemy.ext.asyncio import AsyncSession
from models.tables import AuditLog, Alert


async def log_action(db: AsyncSession, user_id: int, action: str, target: str):
    entry = AuditLog(user_id=user_id, action=action, target=target)
    db.add(entry)
    await db.commit()


async def create_alert(db: AsyncSession, server_id: int, alert_type: str, message: str, severity: str):
    alert = Alert(server_id=server_id, type=alert_type, message=message, severity=severity)
    db.add(alert)
    await db.commit()
    if severity == "critical":
        await send_email_alert(message)


async def send_email_alert(message: str):
    import smtplib
    import os
    smtp_host = os.getenv("SMTP_HOST", "")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER", "")
    smtp_pass = os.getenv("SMTP_PASS", "")
    alert_email = os.getenv("ALERT_EMAIL", "")
    if not all([smtp_host, smtp_user, smtp_pass, alert_email]):
        return
    try:
        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.starttls()
            server.login(smtp_user, smtp_pass)
            msg = f"Subject: InfraGuard Critical Alert\n\n{message}"
            server.sendmail(smtp_user, alert_email, msg)
    except Exception:
        pass
