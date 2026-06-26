"""add_sequence_and_status

Revision ID: 338d0d5fce81
Revises: 7f421add2960
Create Date: 2026-06-26 11:03:20.256424

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '338d0d5fce81'
down_revision: Union[str, None] = '7f421add2960'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add next_sequence to chat_sessions
    op.add_column('chat_sessions', sa.Column('next_sequence', sa.Integer(), server_default='0', nullable=False))
    
    # Add sequence and status to chat_messages (nullable initially for sequence)
    op.add_column('chat_messages', sa.Column('sequence', sa.Integer(), nullable=True))
    op.add_column('chat_messages', sa.Column('status', sa.String(length=20), server_default='completed', nullable=True))
    
    # Backfill sequence in chat_messages using ROW_NUMBER
    op.execute("""
        WITH numbered AS (
            SELECT id, ROW_NUMBER() OVER(PARTITION BY session_id ORDER BY created_at) as seq
            FROM chat_messages
        )
        UPDATE chat_messages
        SET sequence = numbered.seq, status = 'completed'
        FROM numbered
        WHERE chat_messages.id = numbered.id
    """)
    
    # Alter sequence to be non-nullable
    op.alter_column('chat_messages', 'sequence', nullable=False)
    
    # Backfill next_sequence in chat_sessions
    op.execute("""
        UPDATE chat_sessions
        SET next_sequence = COALESCE((
            SELECT MAX(sequence)
            FROM chat_messages
            WHERE session_id = chat_sessions.id
        ), 0)
    """)


def downgrade() -> None:
    op.drop_column('chat_messages', 'status')
    op.drop_column('chat_messages', 'sequence')
    op.drop_column('chat_sessions', 'next_sequence')
