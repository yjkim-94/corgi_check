from sqlalchemy import Column, Integer, Text, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base


class Member(Base):
    __tablename__ = "members"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(Text, nullable=False)
    birth_date = Column(Text)
    is_active = Column(Boolean, default=True)
    left_date = Column(Text)
    left_reason = Column(Text)
    created_at = Column(Text)

    statuses = relationship("WeeklyStatus", back_populates="member")


class WeeklyStatus(Base):
    __tablename__ = "weekly_status"

    id = Column(Integer, primary_key=True, index=True)
    member_id = Column(Integer, ForeignKey("members.id"), nullable=False)
    week_label = Column(Text, nullable=False)
    status = Column(Text, default="injeung")
    exclude_reason = Column(Text)
    exclude_reason_detail = Column(Text)
    created_at = Column(Text)

    member = relationship("Member", back_populates="statuses")


class WeeklySummary(Base):
    __tablename__ = "weekly_summary"

    id = Column(Integer, primary_key=True, index=True)
    week_label = Column(Text, unique=True, nullable=False)
    summary_text = Column(Text)
    created_at = Column(Text)


class AppConfig(Base):
    __tablename__ = "app_config"

    key = Column(Text, primary_key=True)
    value = Column(Text)
