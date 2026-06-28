import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    PROJECT_NAME: str = "SHI Chatbot Real"
    VERSION: str = "1.0.0"
    
    # PostgreSQL
    POSTGRES_USER: str = os.getenv("POSTGRES_USER")
    POSTGRES_PASSWORD: str = os.getenv("POSTGRES_PASSWORD")
    POSTGRES_SERVER: str = os.getenv("POSTGRES_SERVER")
    POSTGRES_PORT: str = os.getenv("POSTGRES_PORT")
    POSTGRES_DB: str = os.getenv("POSTGRES_DB")
    
    @property
    def DATABASE_URL(self) -> str:
        # asyncpg URL
        return f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
    
    @property
    def SYNC_DATABASE_URL(self) -> str:
        # psycopg2 URL for Alembic sync operations if needed
        return f"postgresql://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"

    # Qdrant
    QDRANT_HOST: str = os.getenv("QDRANT_HOST")
    QDRANT_PORT: int = int(os.getenv("QDRANT_PORT", "6333"))
    
    # Redis
    REDIS_URL: str = os.getenv("REDIS_URL")
    
    # Ollama
    OLLAMA_BASE_URL: str = os.getenv("OLLAMA_BASE_URL")
    OLLAMA_LLM_MODEL: str = os.getenv("OLLAMA_LLM_MODEL")
    OLLAMA_EMBEDDING_MODEL: str = os.getenv("OLLAMA_EMBEDDING_MODEL")

    # Firebase
    FIREBASE_CREDENTIALS_PATH: str = os.getenv("FIREBASE_CREDENTIALS_PATH")
    
    # CORS
    ALLOWED_ORIGINS = [
        "http://localhost:3000",
        "http://127.0.0.1:3000"
    ]

settings = Settings()
