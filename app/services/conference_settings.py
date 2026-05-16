"""Conference settings service: single-row DB config replacing env-var deadlines."""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.conference_settings import ConferenceSettings


async def get_conference_settings(db: AsyncSession) -> ConferenceSettings:
    """Return the single ConferenceSettings row, creating it with defaults if absent."""
    result = await db.execute(select(ConferenceSettings).where(ConferenceSettings.id == 1))
    settings = result.scalar_one_or_none()
    if not settings:
        settings = ConferenceSettings(id=1)
        db.add(settings)
        await db.commit()
        await db.refresh(settings)
    return settings


async def update_conference_settings(db: AsyncSession, **kwargs) -> ConferenceSettings:
    """Update any subset of conference settings fields."""
    settings = await get_conference_settings(db)
    for field, value in kwargs.items():
        setattr(settings, field, value)
    await db.commit()
    await db.refresh(settings)
    return settings
