import logging
import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from core.firebase_auth import get_current_user
from firebase_admin import firestore

logger = logging.getLogger("chatbot.routers.audit")
router = APIRouter(prefix="/api", tags=["Audit Logs"])

@router.get("/audit-logs")
async def list_audit_logs(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=200),
    resource_type: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    """
    Retrieves paginated and filtered audit logs.
    """
    try:
        db = firestore.client()

        # Cleanup logs older than 7 days
        seven_days_ago = (datetime.datetime.utcnow() - datetime.timedelta(days=7)).isoformat()
        old_docs = db.collection("audit_logs").where("timestamp", "<", seven_days_ago).stream()
        for doc in old_docs:
            doc.reference.delete()

        query = db.collection("audit_logs")

        if user.get("role") != "admin":
            query = query.where("subscriber_uid", "==", user["uid"])

        raw_docs = list(query.stream())
        logs = []
        for doc in raw_docs:
            data = doc.to_dict()
            data.setdefault("id", doc.id)
            data.setdefault("developer_payload", {})
            logs.append(data)

        # Filter by resource type in memory
        if resource_type and resource_type != "All":
            logs = [l for l in logs if l.get("resource_type") == resource_type]

        # Filter by start date in memory
        if start_date:
            logs = [l for l in logs if l.get("timestamp", "") >= start_date]

        # Filter by end date in memory
        if end_date:
            end_val = end_date + "T23:59:59.999999" if "T" not in end_date else end_date
            logs = [l for l in logs if l.get("timestamp", "") <= end_val]

        # Sort in memory by timestamp descending
        logs.sort(key=lambda x: x.get("timestamp", ""), reverse=True)

        total = len(logs)
        offset = (page - 1) * limit
        paginated_logs = logs[offset:offset + limit]

        return {
            "data": paginated_logs,
            "total": total,
            "page": page,
            "limit": limit
        }
    except Exception as e:
        logger.error(f"Error listing audit logs: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch audit logs")
