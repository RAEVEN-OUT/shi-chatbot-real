from qdrant_client import AsyncQdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct, Filter, FieldCondition, MatchValue, MatchAny, HnswConfigDiff, PayloadSchemaType, SearchParams
from core.config import settings
import uuid

class QdrantService:
    def __init__(self):
        self.client = AsyncQdrantClient(host=settings.QDRANT_HOST, port=settings.QDRANT_PORT)
        self.collection_name = "knowledge_chunks"
        # nomic-embed-text dimension is 768. Update if using a different model.
        self.vector_size = 768 

    async def ensure_collection(self):
        """Ensure the single knowledge_chunks collection exists."""
        collections = await self.client.get_collections()
        exists = any(c.name == self.collection_name for c in collections.collections)
        if not exists:
            await self.client.create_collection(
                collection_name=self.collection_name,
                vectors_config=VectorParams(size=self.vector_size, distance=Distance.COSINE),
                hnsw_config=HnswConfigDiff(m=16, ef_construct=200)
            )
            
            # Create payload indexes for fast filtering
            payload_indexes = ["tenant_id", "category_id", "domain_id", "question_id"]
            for field in payload_indexes:
                await self.client.create_payload_index(
                    collection_name=self.collection_name,
                    field_name=field,
                    field_schema=PayloadSchemaType.KEYWORD
                )

    async def add_chunk(self, tenant_id: str, domain_id: str, text: str, vector: list[float], metadata: dict = None):
        """Add a knowledge chunk with strict tenant and domain metadata."""
        if metadata is None:
            metadata = {}
        
        payload = {
            "tenant_id": tenant_id,
            "domain_id": domain_id,
            "text": text,
            **metadata
        }
        
        point_id = str(uuid.uuid4())
        await self.client.upsert(
            collection_name=self.collection_name,
            points=[
                PointStruct(id=point_id, vector=vector, payload=payload)
            ]
        )
        return point_id

    async def search_chunks(self, tenant_id: str, query_vector: list[float], category_ids: list[str] = None, domain_id: str = None, limit: int = 5):
        """Search chunks with tenant isolation."""
        must_filters = [
            FieldCondition(key="tenant_id", match=MatchValue(value=tenant_id))
        ]
        
        if category_ids:
            must_filters.append(FieldCondition(key="category_id", match=MatchAny(any=category_ids)))
        elif domain_id:
            must_filters.append(FieldCondition(key="domain_id", match=MatchValue(value=domain_id)))
            
        search_filter = Filter(must=must_filters)
        
        results = await self.client.search(
            collection_name=self.collection_name,
            query_vector=query_vector,
            query_filter=search_filter,
            limit=limit,
            search_params=SearchParams(hnsw_ef=128)
        )
        return [{"payload": hit.payload, "score": hit.score} for hit in results]

qdrant_service = QdrantService()
