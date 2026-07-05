from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet
from datetime import datetime
import io


def generate_health_report(servers_data: list[dict]) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=letter)
    styles = getSampleStyleSheet()
    elements = []

    elements.append(Paragraph("InfraGuard — System Health Report", styles["Title"]))
    elements.append(Paragraph(f"Generated: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')}", styles["Normal"]))
    elements.append(Spacer(1, 20))

    for srv in servers_data:
        elements.append(Paragraph(f"Server: {srv.get('name')} ({srv.get('ip')})", styles["Heading2"]))
        elements.append(Paragraph(f"Status: {srv.get('status', 'unknown').upper()}", styles["Normal"]))
        elements.append(Spacer(1, 8))

        health = srv.get("health", {})
        data = [
            ["Metric", "Value", "Status"],
            ["CPU Usage", f"{health.get('cpu', 'N/A')}%", _status_label(health.get('cpu', 0), 80, 90)],
            ["RAM Usage", f"{health.get('ram', 'N/A')}%", _status_label(health.get('ram', 0), 80, 90)],
            ["Disk Usage", f"{health.get('disk', 'N/A')}%", _status_label(health.get('disk', 0), 80, 90)],
            ["S.M.A.R.T", health.get("smart_status", "N/A"), ""],
        ]
        table = Table(data, colWidths=[150, 150, 150])
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e3a5f")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.whitesmoke, colors.white]),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ]))
        elements.append(table)
        elements.append(Spacer(1, 20))

    doc.build(elements)
    return buf.getvalue()


def _status_label(value: float, warn: float, crit: float) -> str:
    if value >= crit:
        return "CRITICAL"
    if value >= warn:
        return "WARNING"
    return "OK"
