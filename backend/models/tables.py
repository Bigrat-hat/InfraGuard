from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text
from sqlalchemy.sql import func
from models.database import Base


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, default="viewer")  # admin | viewer


class Server(Base):
    __tablename__ = "servers"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    ip = Column(String, nullable=False)
    port = Column(Integer, default=22)
    username = Column(String, nullable=False)
    password_hash = Column(String, nullable=False)  # stores plaintext for SSH; rename kept for schema compat
    status = Column(String, default="unknown")  # online | offline | unknown


class NetworkLog(Base):
    __tablename__ = "network_logs"
    id = Column(Integer, primary_key=True, index=True)
    ip = Column(String)
    process = Column(String)
    action = Column(String)
    timestamp = Column(DateTime, server_default=func.now())
    performed_by = Column(String)


class BlockedIP(Base):
    __tablename__ = "blocked_ips"
    id = Column(Integer, primary_key=True, index=True)
    ip = Column(String, unique=True, nullable=False)
    reason = Column(String)
    blocked_at = Column(DateTime, server_default=func.now())
    blocked_by = Column(String)


class SystemHealth(Base):
    __tablename__ = "system_health"
    id = Column(Integer, primary_key=True, index=True)
    server_id = Column(Integer, ForeignKey("servers.id"))
    cpu = Column(Float)
    ram = Column(Float)
    disk = Column(Float)
    smart_status = Column(String)
    timestamp = Column(DateTime, server_default=func.now())


class Alert(Base):
    __tablename__ = "alerts"
    id = Column(Integer, primary_key=True, index=True)
    server_id = Column(Integer, ForeignKey("servers.id"), nullable=True)
    type = Column(String)
    message = Column(Text)
    severity = Column(String)  # info | warning | critical
    timestamp = Column(DateTime, server_default=func.now())


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    action = Column(String)
    target = Column(String)
    timestamp = Column(DateTime, server_default=func.now())
