from qdrant_client import AsyncQdrantClient
from qdrant_client.models import (
    Distance, VectorParams, PointStruct, Filter,
    FieldCondition, MatchValue, MatchAny,
    HnswConfigDiff, PayloadSchemaType, SearchParams,
    FilterSelector
)
from core.config import settings
import uuid


class QdrantService:
    def __init__(self):
        self.client = AsyncQdrantClient(host=settings.QDRANT_HOST, port=settings.QDRANT_PORT)
        self.collection_name = "knowledge_chunks"
        self.vector_size = 768  # nomic-embed-text

    async def ensure_collection(self):
        """Ensure the knowledge_chunks collection exists with all payload indexes."""
        collections = await self.client.get_collections()
        exists = any(c.name == self.collection_name for c in collections.collections)
        if not exists:
            await self.client.create_collection(
                collection_name=self.collection_name,
                vectors_config=VectorParams(size=self.vector_size, distance=Distance.COSINE),
                hnsw_config=HnswConfigDiff(m=16, ef_construct=200)
            )
            for field in ["tenant_id", "category_id", "domain_id", "question_id"]:
                await self.client.create_payload_index(
                    collection_name=self.collection_name,
                    field_name=field,
                    field_schema=PayloadSchemaType.KEYWORD
                )

    async def add_chunk(
        self,
        tenant_id: str,
        domain_id: str,
        text: str,
        vector: list[float],
        metadata: dict = None
    ) -> str:
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
            points=[PointStruct(id=point_id, vector=vector, payload=payload)]
        )
        return point_id

    async def delete_chunks_by_question_id(self, question_id: str):
        """
        FIX #2 — Delete all Qdrant points for a given question_id.
        Previously, update/delete left stale vectors; search would return
        old answers or ghost matches degrading score accuracy.
        """
        await self.client.delete(
            collection_name=self.collection_name,
            points_selector=FilterSelector(
                filter=Filter(
                    must=[FieldCondition(key="question_id", match=MatchValue(value=question_id))]
                )
            )
        )

    async def search_chunks(
        self,
        tenant_id: str,
        query_vector: list[float],
        category_ids: list[str] = None,
        domain_id: str = None,
        limit: int = 5
    ) -> list[dict]:
        """
        FIX #3 — Search with tenant isolation + category scoping.
        When category_ids is empty AND domain_id is not set, fall through to
        tenant-only search so questions are always findable even without
        domain→category assignments.
        """
        must_filters = [
            FieldCondition(key="tenant_id", match=MatchValue(value=tenant_id))
        ]

        if category_ids:
            # Preferred path: scope to assigned categories
            must_filters.append(
                FieldCondition(key="category_id", match=MatchAny(any=list(category_ids)))
            )
        elif domain_id and domain_id.strip():
            # Fallback: scope to domain
            must_filters.append(
                FieldCondition(key="domain_id", match=MatchValue(value=domain_id))
            )
        # else: tenant-only — searches all of this tenant's knowledge base
        # This ensures questions are returned even when domain_categories is empty

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
