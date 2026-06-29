"""Add document_sources table for RAG ingestion

Revision ID: a1b2c3d4e5f6
Revises: 338d0d5fce81
Create Date: 2026-06-29 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '338d0d5fce81'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'document_sources',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('organization_id', sa.String(), nullable=False),
        sa.Column('domain_id', sa.String(), nullable=True),
        sa.Column('source_title', sa.String(), nullable=False),
        sa.Column('filename', sa.String(), nullable=False),
        sa.Column('file_type', sa.String(), nullable=False),
        sa.Column('file_size', sa.Integer(), nullable=True),
        sa.Column('status', sa.String(), nullable=True, server_default='processing'),
        sa.Column('chunk_count', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('error_message', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id']),
        sa.ForeignKeyConstraint(['domain_id'], ['domains.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_document_sources_org_status', 'document_sources', ['organization_id', 'status'])
    op.create_index('ix_document_sources_domain', 'document_sources', ['domain_id'])


def downgrade() -> None:
    op.drop_index('ix_document_sources_domain', table_name='document_sources')
    op.drop_index('ix_document_sources_org_status', table_name='document_sources')
    op.drop_table('document_sources')
