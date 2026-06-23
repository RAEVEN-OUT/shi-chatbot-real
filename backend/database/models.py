from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, Integer, JSON, Index, text
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
from database.database import Base

def generate_uuid():
    return str(uuid.uuid4())

class User(Base):
    __tablename__ = "users"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    firebase_uid = Column(String, unique=True, index=True)
    email = Column(String, unique=True, index=True)
    name = Column(String)
    role = Column(String, default="subscriber")
    is_active = Column(Boolean, default=True)
    organization_id = Column(String, ForeignKey("organizations.id", use_alter=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    organization = relationship("Organization", foreign_keys=[organization_id])
    owned_organizations = relationship("Organization", foreign_keys="Organization.owner_id", back_populates="owner")

class Organization(Base):
    __tablename__ = "organizations"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String)
    owner_id = Column(String, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    owner = relationship("User", foreign_keys=[owner_id], back_populates="owned_organizations")
    domains = relationship("Domain", back_populates="organization")

class Domain(Base):
    __tablename__ = "domains"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    domain_name = Column(String, unique=True, index=True)
    widget_key = Column(String, unique=True, index=True, nullable=True)
    organization_id = Column(String, ForeignKey("organizations.id"), index=True)
    settings = Column(JSON, default=dict)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    organization = relationship("Organization", back_populates="domains")

class FAQ(Base):
    __tablename__ = "faqs"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    domain_id = Column(String, ForeignKey("domains.id"))
    question = Column(String)
    answer = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    domain = relationship("Domain")

class FAQCategory(Base):
    __tablename__ = "faq_categories"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    faq_title = Column(String, nullable=False)
    status = Column(String, default="active")
    organization_id = Column(String, ForeignKey("organizations.id"), index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    __table_args__ = (
        Index('ix_faq_categories_active_org', 'organization_id', postgresql_where=text("status = 'active'")),
    )
    
    organization = relationship("Organization")
    questions = relationship("FAQQuestion", back_populates="category", cascade="all, delete-orphan")

class FAQQuestion(Base):
    __tablename__ = "faq_questions"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    faq_id = Column(String, ForeignKey("faq_categories.id"), index=True)
    question = Column(String, nullable=False)
    answer = Column(String, nullable=False)
    status = Column(String, default="active")
    aliases = Column(ARRAY(String), default=list, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    __table_args__ = (
        Index('ix_faq_questions_faq_id_status', 'faq_id', 'status'),
        Index('ix_faq_questions_active_faq_id', 'faq_id', text('created_at DESC'), postgresql_where=text("status = 'active'")),
    )
    
    category = relationship("FAQCategory", back_populates="questions")

class DomainCategory(Base):
    __tablename__ = "domain_categories"
    
    domain_id = Column(String, ForeignKey("domains.id"), primary_key=True, index=True)
    category_id = Column(String, ForeignKey("faq_categories.id"), primary_key=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    domain = relationship("Domain")
    category = relationship("FAQCategory")

class ChatSession(Base):
    __tablename__ = "chat_sessions"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    domain_id = Column(String, ForeignKey("domains.id"), index=True)
    customer_name = Column(String, nullable=True)
    customer_email = Column(String, nullable=True)
    status = Column(String, default="open") # open, closed
    resolution_type = Column(String, default="UNRESOLVED") # AI, HUMAN, UNRESOLVED
    ai_enabled = Column(Boolean, default=True)
    admin_joined = Column(Boolean, default=False)
    unread_admin = Column(Integer, default=0)
    unread_customer = Column(Integer, default=0)
    message_count = Column(Integer, default=0)
    summary = Column(String, nullable=True)
    last_message_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    __table_args__ = (
        Index('ix_chat_sessions_domain_id_status', 'domain_id', 'status', text('last_message_at DESC')),
        Index('ix_chat_sessions_open_unread', 'domain_id', 'unread_admin', postgresql_where=text("status = 'open'")),
    )
    
    domain = relationship("Domain")
    messages = relationship("ChatMessage", back_populates="session", cascade="all, delete-orphan")

class ChatMessage(Base):
    __tablename__ = "chat_messages"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    session_id = Column(String, ForeignKey("chat_sessions.id"), index=True)
    sender = Column(String) # user, bot, admin
    message = Column(String)
    type = Column(String, default="text") # text, system
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    __table_args__ = (
        Index('ix_chat_messages_session_id_created_at', 'session_id', 'created_at'),
        Index('ix_chat_messages_session_id_sender', 'session_id', 'sender'),
    )
    
    session = relationship("ChatSession", back_populates="messages")

class Lead(Base):
    __tablename__ = "leads"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    domain_id = Column(String, ForeignKey("domains.id"), index=True)
    session_id = Column(String, nullable=True)
    name = Column(String, nullable=True)
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    message = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    domain = relationship("Domain")

class RetrainingJob(Base):
    __tablename__ = "retraining_jobs"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    domain_id = Column(String, ForeignKey("domains.id"))
    status = Column(String, default="pending") # pending, processing, completed, failed
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    domain = relationship("Domain")

class FailedQuestion(Base):
    __tablename__ = "failed_questions"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    domain_id = Column(String, ForeignKey("domains.id"), index=True)
    question = Column(String)
    ai_response = Column(String, nullable=True)
    failure_reason = Column(String) # NO_MATCH, LOW_CONFIDENCE, LLM_FAILURE, SPAM
    is_spam = Column(Boolean, default=False)
    spam_count = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    __table_args__ = (
        Index('ix_failed_questions_domain_id_is_spam', 'domain_id', 'is_spam', text('created_at DESC')),
        Index('ix_failed_questions_spam', 'domain_id', text('spam_count DESC'), postgresql_where=text("is_spam = true")),
    )
    
    domain = relationship("Domain")
