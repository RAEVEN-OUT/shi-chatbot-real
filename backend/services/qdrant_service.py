from qdrant_client import AsyncQdrantClient
from qdrant_client.models import (
    Distance, VectorParams, PointStruct, Filter,
    FieldCondition, MatchValue, MatchAny,
    HnswConfigDiff, PayloadSchemaType, SearchParams,
    FilterSelector
)
from core.config import settings
from schemas.retrieval import KnowledgeSource
import hashlib
import logging
import asyncio
import uuid
from core.retry import qdrant_retry

logger = logging.getLogger("qdrant_service")

class QdrantService:
    def __init__(self):
        self.client = AsyncQdrantClient(
            host=settings.QDRANT_HOST,
            port=settings.QDRANT_PORT,
            timeout=10.0
        )
        self.collection_name = "knowledge_chunks"
        self.vector_size = 768  # nomic-embed-text

    async def check_health(self) -> bool:
        """Check if Qdrant is available."""
        try:
            # Qdrant client has a collections list check which is a good proxy for health
            await self.client.get_collections()
            return True
        except Exception as e:
            logger.error(f"Qdrant health check failed: {e}")
            return False

    async def ensure_collection(self):
        """Ensure the knowledge_chunks collection exists with all payload indexes."""
        @qdrant_retry
        async def _get_collections():
            return await self.client.get_collections()

        collections = await _get_collections()
        exists = any(c.name == self.collection_name for c in collections.collections)
        if not exists:
            @qdrant_retry
            async def _create_collection():
                return await self.client.create_collection(
                    collection_name=self.collection_name,
                    vectors_config=VectorParams(size=self.vector_size, distance=Distance.COSINE),
                    hnsw_config=HnswConfigDiff(m=16, ef_construct=200)
                )
            await _create_collection()

            for field in ["tenant_id", "category_id", "domain_id", "question_id", "source_type", "document_source_id"]:
                @qdrant_retry
                async def _create_index(f):
                    return await self.client.create_payload_index(
                        collection_name=self.collection_name,
                        field_name=f,
                        field_schema=PayloadSchemaType.KEYWORD
                    )
                await _create_index(field)
                
            @qdrant_retry
            async def _create_bool_index():
                return await self.client.create_payload_index(
                    collection_name=self.collection_name,
                    field_name="is_active",
                    field_schema=PayloadSchemaType.BOOL
                )
            await _create_bool_index()

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
            "is_active": metadata.get("is_active", True),
            **metadata
        }
        point_id = str(uuid.uuid4())
        
        @qdrant_retry
        async def _call_upsert():
            return await self.client.upsert(
                collection_name=self.collection_name,
                points=[PointStruct(id=point_id, vector=vector, payload=payload)]
            )
            
        await _call_upsert()
        return point_id

    async def upsert_batch(self, points: list[PointStruct]):
        """Batch insert multiple PointStructs into Qdrant."""
        if not points:
            return
            
        @qdrant_retry
        async def _call_upsert_batch():
            return await self.client.upsert(
                collection_name=self.collection_name,
                points=points
            )
            
        await _call_upsert_batch()

    async def delete_chunks_by_question_id(self, question_id: str):
        """
        FIX #2 — Delete all Qdrant points for a given question_id.
        Previously, update/delete left stale vectors; search would return
        old answers or ghost matches degrading score accuracy.
        """
        @qdrant_retry
        async def _call_delete():
            return await self.client.delete(
                collection_name=self.collection_name,
                points_selector=FilterSelector(
                    filter=Filter(
                        must=[FieldCondition(key="question_id", match=MatchValue(value=question_id))]
                    )
                )
            )
        await _call_delete()

    async def delete_chunks_by_category_id(self, category_id: str):
        """Delete all Qdrant points for a given category_id."""
        @qdrant_retry
        async def _call_delete():
            return await self.client.delete(
                collection_name=self.collection_name,
                points_selector=FilterSelector(
                    filter=Filter(
                        must=[FieldCondition(key="category_id", match=MatchValue(value=category_id))]
                    )
                )
            )
        await _call_delete()

    async def set_chunks_active_by_category_id(self, category_id: str, is_active: bool):
        """Set is_active for all Qdrant points for a given category_id."""
        @qdrant_retry
        async def _call_set():
            return await self.client.set_payload(
                collection_name=self.collection_name,
                payload={"is_active": is_active},
                points=FilterSelector(
                    filter=Filter(
                        must=[FieldCondition(key="category_id", match=MatchValue(value=category_id))]
                    )
                )
            )
        await _call_set()

    async def delete_chunks_by_document_id(self, document_source_id: str):
        """Delete all Qdrant points belonging to a RAG document."""
        @qdrant_retry
        async def _call_delete():
            return await self.client.delete(
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
        await _call_delete()

    async def set_chunks_active_by_document_id(self, document_source_id: str, is_active: bool):
        """Set is_active for all Qdrant points for a given document_source_id."""
        @qdrant_retry
        async def _call_set():
            return await self.client.set_payload(
                collection_name=self.collection_name,
                payload={"is_active": is_active},
                points=FilterSelector(
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
        await _call_set()

    async def delete_chunks_by_domain_id(self, domain_id: str):
        """Delete all Qdrant points belonging to a specific domain."""
        @qdrant_retry
        async def _call_delete():
            return await self.client.delete(
                collection_name=self.collection_name,
                points_selector=FilterSelector(
                    filter=Filter(
                        must=[
                            FieldCondition(
                                key="domain_id",
                                match=MatchValue(value=domain_id)
                            )
                        ]
                    )
                )
            )
        await _call_delete()

    async def search_chunks(
        self,
        tenant_id: str,
        query_vector: list[float],
        category_ids: list[str] = None,
        domain_id: str = None,
        limit: int = 5,
        skip_faq: bool = False,
        skip_docs: bool = False
    ) -> list[KnowledgeSource]:
        """
        Search with tenant isolation + category scoping.

        FAQ chunks: scoped by category_ids → domain_id → tenant fallback.
        Document chunks: always included when domain_id is set (parallel search),
        so uploaded documents are always reachable regardless of category config.
        Results from both pools are merged and re-ranked by score.
        """
        # ── FAQ chunk search ─────────────────────────────────────────────────
        async def _search_faq():
            if skip_faq:
                return []
                
            faq_must = [
                FieldCondition(key="tenant_id", match=MatchValue(value=tenant_id)),
                FieldCondition(key="is_active", match=MatchValue(value=True))
            ]

            if category_ids:
                faq_must.append(
                    FieldCondition(key="category_id", match=MatchAny(any=list(category_ids)))
                )
            elif domain_id and domain_id.strip():
                faq_must.append(
                    FieldCondition(key="domain_id", match=MatchValue(value=domain_id))
                )
            
            faq_filter = Filter(
                must=faq_must,
                must_not=[FieldCondition(key="source_type", match=MatchValue(value="document"))]
            )
            
            @qdrant_retry
            async def _call_faq():
                return await self.client.search(
                    collection_name=self.collection_name,
                    query_vector=query_vector,
                    query_filter=faq_filter,
                    limit=limit,
                    search_params=SearchParams(hnsw_ef=128)
                )

            try:
                results = await _call_faq()
            except Exception as e:
                logger.error(f"Qdrant FAQ search failed: {e}")
                return []

            sources = []
            for hit in results:
                p = hit.payload
                faq_id = p.get("question_id")
                if faq_id:
                    src_id = f"faq_{faq_id}"
                else:
                    text_content = f"{p.get('question', '')}\n\n{p.get('answer', '')}"
                    src_id = hashlib.sha256(text_content.encode('utf-8')).hexdigest()
                    
                sources.append(KnowledgeSource(
                    id=src_id,
                    source_type="FAQ",
                    score=hit.score,
                    content=f"{p.get('question', '')}\n\n{p.get('answer', '')}",
                    metadata=p
                ))
            return sources

        # ── Document chunk search (runs in parallel when domain_id available) ─
        async def _search_documents():
            if skip_docs or not (domain_id and domain_id.strip()):
                return []
            doc_filter = Filter(
                must=[
                    FieldCondition(key="tenant_id", match=MatchValue(value=tenant_id)),
                    FieldCondition(key="domain_id", match=MatchValue(value=domain_id)),
                    FieldCondition(key="source_type", match=MatchValue(value="document")),
                    FieldCondition(key="is_active", match=MatchValue(value=True)),
                ]
            )
            
            @qdrant_retry
            async def _call_doc():
                return await self.client.search(
                    collection_name=self.collection_name,
                    query_vector=query_vector,
                    query_filter=doc_filter,
                    limit=limit,
                    search_params=SearchParams(hnsw_ef=128)
                )
            
            try:
                results = await _call_doc()
            except Exception as e:
                logger.error(f"Qdrant doc search failed: {e}")
                return []
                    
            sources = []
            for hit in results:
                p = hit.payload
                doc_id = p.get("document_source_id")
                chunk_idx = p.get("chunk_index")
                
                text_content = p.get("text", "")
                if doc_id and chunk_idx is not None:
                    src_id = f"doc_{doc_id}_{chunk_idx}"
                else:
                    src_id = hashlib.sha256(text_content.encode('utf-8')).hexdigest()
                    
                sources.append(KnowledgeSource(
                    id=src_id,
                    source_type="Document",
                    score=hit.score,
                    content=text_content,
                    metadata=p
                ))
            return sources

        faq_results, doc_results = await asyncio.gather(
            _search_faq(), _search_documents()
        )

        # Merge: de-duplicate on exact ID, keep highest score
        seen: set[str] = set()
        merged: list[KnowledgeSource] = []
        for source in sorted(faq_results + doc_results, key=lambda x: x.score, reverse=True):
            if source.id not in seen:
                seen.add(source.id)
                merged.append(source)
            if len(merged) >= limit:
                break

        return merged

    async def expand_document_chunks(
        self,
        tenant_id: str,
        sources: list[KnowledgeSource]
    ) -> dict[tuple[str, int], str]:
        """
        Fetches adjacent chunks (idx - 1, idx + 1) for a list of document sources.
        Returns a dict mapping (document_source_id, chunk_index) -> text.
        """
        doc_expansions = {}
        for src in sources:
            if src.source_type == "Document":
                doc_id = src.metadata.get("document_source_id")
                idx = src.metadata.get("chunk_index")
                if doc_id and idx is not None:
                    doc_expansions.setdefault(doc_id, set()).update([idx - 1, idx + 1])
                    
        if not doc_expansions:
            return {}
            
        should_conditions = []
        for doc_id, indices in doc_expansions.items():
            valid_indices = [i for i in indices if i >= 0]
            if valid_indices:
                should_conditions.append(
                    Filter(
                        must=[
                            FieldCondition(key="document_source_id", match=MatchValue(value=doc_id)),
                            FieldCondition(key="chunk_index", match=MatchAny(any=valid_indices))
                        ]
                    )
                )
                
        if not should_conditions:
            return {}
            
        final_filter = Filter(
            must=[
                FieldCondition(key="tenant_id", match=MatchValue(value=tenant_id)),
                FieldCondition(key="is_active", match=MatchValue(value=True))
            ],
            should=should_conditions
        )
        
        total_requested = sum(len(indices) for indices in doc_expansions.values())
        
        @qdrant_retry
        async def _call_scroll():
            return await self.client.scroll(
                collection_name=self.collection_name,
                scroll_filter=final_filter,
                limit=total_requested,
                with_payload=True,
                with_vectors=False
            )
        
        try:
            results, _ = await _call_scroll()
        except Exception:
            return {}
            
        expansion_map = {}
        for hit in results:
            p = hit.payload
            doc_id = p.get("document_source_id")
            chunk_idx = p.get("chunk_index")
            text = p.get("text")
            if doc_id and chunk_idx is not None and text:
                expansion_map[(doc_id, chunk_idx)] = text
                
        return expansion_map


qdrant_service = QdrantService()
