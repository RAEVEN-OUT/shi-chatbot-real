import logging
import httpx
import redis.exceptions
from qdrant_client.http.exceptions import UnexpectedResponse
from sqlalchemy.exc import OperationalError as SQLAlchemyOperationalError
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
    RetryCallState
)

logger = logging.getLogger("retry")

def custom_before_sleep_log(service_name: str, log_logger: logging.Logger):
    def log_it(retry_state: RetryCallState):
        if retry_state.outcome.failed:
            ex = retry_state.outcome.exception()
            sleep_time = retry_state.next_action.sleep if retry_state.next_action else 0
            log_logger.warning(
                f"{service_name.upper()}_RETRY "
                f"attempt={retry_state.attempt_number} "
                f"sleep={sleep_time} "
                f"exception={type(ex).__name__}"
            )
    return log_it

def get_retry_config(service_name: str, exception_types):
    return dict(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=0.5, min=0.5, max=2.0),
        retry=retry_if_exception_type(exception_types),
        before_sleep=custom_before_sleep_log(service_name, logger),
        reraise=True
    )

# 1. Ollama Retry
ollama_retry = retry(**get_retry_config(
    "OLLAMA",
    (
        httpx.TimeoutException,
        httpx.ConnectError,
        httpx.ReadError,
        httpx.RemoteProtocolError
    )
))

# 2. Qdrant Retry
qdrant_retry = retry(**get_retry_config(
    "QDRANT",
    (
        httpx.TimeoutException,
        httpx.ConnectError,
        httpx.ReadError,
        httpx.RemoteProtocolError,
        UnexpectedResponse
    )
))

# 3. Redis Read Retry
redis_read_retry = retry(**get_retry_config(
    "REDIS",
    (
        redis.exceptions.ConnectionError,
        redis.exceptions.TimeoutError
    )
))

# 3.5 Redis Write Retry
redis_write_retry = retry(**get_retry_config(
    "REDIS_WRITE",
    (
        redis.exceptions.ConnectionError,
        redis.exceptions.TimeoutError
    )
))

# 4. DB Read Retry
db_read_retry = retry(**get_retry_config(
    "DB",
    (SQLAlchemyOperationalError,)
))


from sqlalchemy.ext.asyncio import AsyncSession
@db_read_retry
async def db_read_execute(db: AsyncSession, stmt):
    return await db.execute(stmt)

@db_read_retry
async def db_read_scalar(db: AsyncSession, stmt):
    return await db.scalar(stmt)
