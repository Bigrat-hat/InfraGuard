from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import declarative_base, sessionmaker

DATABASE_URL = "sqlite+aiosqlite:///./infraguard.db"

engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
Base = declarative_base()


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


async def init_db():
    from models.tables import User, Server, NetworkLog, BlockedIP, SystemHealth, Alert, AuditLog
    from auth import get_password_hash
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    # Create default admin user if not exists
    async with AsyncSessionLocal() as session:
        from sqlalchemy import select
        result = await session.execute(select(User).where(User.username == "admin"))
        if not result.scalar_one_or_none():
            admin = User(username="admin", password_hash=get_password_hash("admin123"), role="admin")
            viewer = User(username="viewer", password_hash=get_password_hash("viewer123"), role="viewer")
            session.add_all([admin, viewer])
            await session.commit()
