from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from models.database import get_db
from models.tables import Server, User
from auth import get_current_user, require_admin
from services.ssh_service import check_server_status, exec_command, sftp_list, sftp_download, sftp_upload
from services.audit import log_action

router = APIRouter(prefix="/api/servers", tags=["servers"])


class ServerCreate(BaseModel):
    name: str
    ip: str
    port: int = 22
    username: str
    password: str


class CommandRequest(BaseModel):
    command: str


@router.get("")
async def list_servers(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Server))
    servers = result.scalars().all()
    return [{"id": s.id, "name": s.name, "ip": s.ip, "port": s.port,
             "username": s.username, "status": s.status} for s in servers]


@router.post("", dependencies=[Depends(require_admin)])
async def add_server(data: ServerCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_admin)):
    # password_hash column stores plaintext SSH password (never returned to frontend)
    server = Server(
        name=data.name, ip=data.ip, port=data.port,
        username=data.username, password_hash=data.password
    )
    db.add(server)
    await db.commit()
    await db.refresh(server)
    await log_action(db, current_user.id, "add_server", data.ip)
    return {"id": server.id, "message": "Server added"}


@router.delete("/{server_id}", dependencies=[Depends(require_admin)])
async def delete_server(server_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_admin)):
    result = await db.execute(select(Server).where(Server.id == server_id))
    server = result.scalar_one_or_none()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    await db.delete(server)
    await db.commit()
    await log_action(db, current_user.id, "delete_server", str(server_id))
    return {"message": "Server deleted"}


@router.get("/{server_id}/status")
async def server_status(server_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Server).where(Server.id == server_id))
    server = result.scalar_one_or_none()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    online = check_server_status(server.ip, server.port, server.username, server.password_hash)
    server.status = "online" if online else "offline"
    await db.commit()
    return {"status": server.status}


@router.post("/{server_id}/exec")
async def run_command(server_id: int, req: CommandRequest, db: AsyncSession = Depends(get_db),
                      current_user: User = Depends(require_admin)):
    result = await db.execute(select(Server).where(Server.id == server_id))
    server = result.scalar_one_or_none()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    output = exec_command(server_id, server.ip, server.port, server.username, server.password_hash, req.command)
    await log_action(db, current_user.id, "exec_command", f"server:{server_id} cmd:{req.command[:50]}")
    return {"output": output}


@router.get("/{server_id}/sftp")
async def sftp_browse(server_id: int, path: str = "/", db: AsyncSession = Depends(get_db),
                      current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Server).where(Server.id == server_id))
    server = result.scalar_one_or_none()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    items = sftp_list(server_id, server.ip, server.port, server.username, server.password_hash, path)
    return {"path": path, "items": items}


@router.get("/{server_id}/sftp/download")
async def sftp_download_file(server_id: int, path: str, db: AsyncSession = Depends(get_db),
                              current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Server).where(Server.id == server_id))
    server = result.scalar_one_or_none()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    data = sftp_download(server_id, server.ip, server.port, server.username, server.password_hash, path)
    filename = path.split("/")[-1]
    return Response(content=data, media_type="application/octet-stream",
                    headers={"Content-Disposition": f"attachment; filename={filename}"})


@router.post("/{server_id}/sftp/upload", dependencies=[Depends(require_admin)])
async def sftp_upload_file(server_id: int, remote_path: str, file: UploadFile = File(...),
                            db: AsyncSession = Depends(get_db), current_user: User = Depends(require_admin)):
    result = await db.execute(select(Server).where(Server.id == server_id))
    server = result.scalar_one_or_none()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    data = await file.read()
    sftp_upload(server_id, server.ip, server.port, server.username, server.password_hash,
                f"{remote_path}/{file.filename}", data)
    await log_action(db, current_user.id, "sftp_upload", f"server:{server_id} file:{file.filename}")
    return {"message": "File uploaded"}
