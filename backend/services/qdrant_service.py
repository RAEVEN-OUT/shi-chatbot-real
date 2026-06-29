from qdrant_client import AsyncQdrantClient
from qdrant_client.models import (
    Distance, VectorParams, PointStruct, Filter,
    FieldCondition, MatchValue, MatchAny,
    HnswConfigDiff, PayloadSchemaType, SearchParams,
    FilterSelector
)
from core.config import settings
import asyncio
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
            for field in ["tenant_id", "category_id", "domain_id", "question_id", "source_type", "document_source_id"]:
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

    async def delete_chunks_by_category_id(self, category_id: str):
        """Delete all Qdrant points for a given category_id."""
        await self.client.delete(
            collection_name=self.collection_name,
            points_selector=FilterSelector(
                filter=Filter(
                    must=[FieldCondition(key="category_id", match=MatchValue(value=category_id))]
                )
            )
        )

    async def delete_chunks_by_document_id(self, document_source_id: str):
        """Delete all Qdrant points belonging to a RAG document."""
        await self.client.delete(
            collection_name=self.collection_name,
            points_selector=FilterSelector(
                filter=Filter(
                    must=[
                        FieldCondition(
                            key="document_source_id",
                            match=MatchValue(value=document_source_id)
                        )
                    ]
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
        Search with tenant isolation + category scoping.

        FAQ chunks: scoped by category_ids → domain_id → tenant fallback.
        Document chunks: always included when domain_id is set (parallel search),
        so uploaded documents are always reachable regardless of category config.
        Results from both pools are merged and re-ranked by score.
        """
        # ── FAQ chunk search ─────────────────────────────────────────────────
        faq_must = [FieldCondition(key="tenant_id", match=MatchValue(value=tenant_id))]

        if category_ids:
            faq_must.append(
                FieldCondition(key="category_id", match=MatchAny(any=list(category_ids)))
            )
        elif domain_id and domain_id.strip():
            faq_must.append(
                FieldCondition(key="domain_id", match=MatchValue(value=domain_id))
            )
        # else: tenant-wide fallback

        async def _search_faq():
            results = await self.client.search(
                collection_name=self.collection_name,
                query_vector=query_vector,
                query_filter=Filter(must=faq_must),
                limit=limit,
                search_params=SearchParams(hnsw_ef=128)
            )
            return [{"payload": hit.payload, "score": hit.score} for hit in results]

        # ── Document chunk search (runs in parallel when domain_id available) ─
        async def _search_documents():
            if not (domain_id and domain_id.strip()):
                return []
            doc_filter = Filter(
                must=[
                    FieldCondition(key="tenant_id", match=MatchValue(value=tenant_id)),
                    FieldCondition(key="domain_id", match=MatchValue(value=domain_id)),
                    FieldCondition(key="source_type", match=MatchValue(value="document")),
                ]
            )
            results = await self.client.search(
                collection_name=self.collection_name,
                query_vector=query_vector,
                query_filter=doc_filter,
                limit=limit,
                search_params=SearchParams(hnsw_ef=128)
            )
            return [{"payload": hit.payload, "score": hit.score} for hit in results]

        faq_results, doc_results = await asyncio.gather(
            _search_faq(), _search_documents()
        )

        # Merge: de-duplicate on text prefix, keep highest score
        seen: set[str] = set()
        merged: list[dict] = []
        for hit in sorted(faq_results + doc_results, key=lambda x: x["score"], reverse=True):
            key = (hit["payload"].get("question") or hit["payload"].get("text", ""))[:100].lower()
            if key not in seen:
                seen.add(key)
                merged.append(hit)
            if len(merged) >= limit:
                break

        return merged


qdrant_service = QdrantService()
