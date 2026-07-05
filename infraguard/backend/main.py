import asyncio
import json
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from jose import JWTError, jwt
from sqlalchemy import select

from models.database import init_db, AsyncSessionLocal
from models.tables import Server
from routes.auth import router as auth_router
from routes.network import router as network_router
from routes.servers import router as servers_router
from routes.health import router as health_router
from services.network_service import get_active_connections, get_bandwidth_per_process
from services.ssh_service import get_server_metrics, exec_command
from auth import SECRET_KEY, ALGORITHM


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="InfraGuard API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(network_router)
app.include_router(servers_router)
app.include_router(health_router)


def _verify_ws_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None


@app.websocket("/ws/network")
async def ws_network(websocket: WebSocket, token: str = Query(...)):
    if not _verify_ws_token(token):
        await websocket.close(code=4001)
        return
    await websocket.accept()
    try:
        while True:
            data = {
                "connections": get_active_connections(),
                "bandwidth": get_bandwidth_per_process()
            }
            await websocket.send_text(json.dumps(data))
            await asyncio.sleep(5)
    except WebSocketDisconnect:
        pass


@app.websocket("/ws/server/{server_id}")
async def ws_server_metrics(websocket: WebSocket, server_id: int, token: str = Query(...)):
    if not _verify_ws_token(token):
        await websocket.close(code=4001)
        return
    await websocket.accept()
    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(Server).where(Server.id == server_id))
            server = result.scalar_one_or_none()
        if not server:
            await websocket.close(code=4004)
            return
        while True:
            metrics = get_server_metrics(server_id, server.ip, server.port, server.username, server.password_hash)
            await websocket.send_text(json.dumps(metrics))
            await asyncio.sleep(5)
    except WebSocketDisconnect:
        pass


@app.websocket("/ws/terminal/{server_id}")
async def ws_terminal(websocket: WebSocket, server_id: int, token: str = Query(...)):
    payload = _verify_ws_token(token)
    if not payload or payload.get("role") != "admin":
        await websocket.close(code=4001)
        return
    await websocket.accept()
    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(Server).where(Server.id == server_id))
            server = result.scalar_one_or_none()
        if not server:
            await websocket.close(code=4004)
            return
        startup_script = (
            "if command -v systemctl >/dev/null 2>&1; then "
            "systemctl enable --now sshd 2>&1 || systemctl enable --now ssh 2>&1 || true; "
            "elif command -v service >/dev/null 2>&1; then "
            "service ssh restart 2>&1 || service sshd restart 2>&1 || true; "
            "elif [ -x /etc/init.d/ssh ]; then "
            "/etc/init.d/ssh restart 2>&1 || /etc/init.d/sshd restart 2>&1 || true; "
            "fi"
        )
        startup_output = exec_command(server_id, server.ip, server.port, server.username, server.password_hash, startup_script)
        await websocket.send_text(json.dumps({"output": f"Connected to {server.name} ({server.ip})\r\n{startup_output}\r\n$ "}))
        while True:
            msg = await websocket.receive_text()
            data = json.loads(msg)
            command = data.get("command", "").strip()
            if not command:
                continue
            output = exec_command(server_id, server.ip, server.port, server.username, server.password_hash, command)
            await websocket.send_text(json.dumps({"output": output + "\r\n$ "}))
            async with AsyncSessionLocal() as db:
                from models.tables import AuditLog
                from sqlalchemy import select as sel
                from models.tables import User
                user_result = await db.execute(sel(User).where(User.username == payload.get("sub")))
                user = user_result.scalar_one_or_none()
                if user:
                    db.add(AuditLog(user_id=user.id, action="terminal_command",
                                    target=f"server:{server_id} cmd:{command[:50]}"))
                    await db.commit()
    except WebSocketDisconnect:
        pass


@app.get("/")
async def root():
    return {"message": "InfraGuard API", "docs": "/docs"}
