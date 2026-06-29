from pydantic import BaseModel
from typing import Any, Dict

class KnowledgeSource(BaseModel):
    id: str
    source_type: str
    score: float
    content: str
    metadata: Dict[str, Any] = {}
