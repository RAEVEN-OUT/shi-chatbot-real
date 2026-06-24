import logging
from datetime import datetime
import uuid
from typing import Dict, Any, Optional
import firebase_admin
from firebase_admin import firestore

logger = logging.getLogger("chatbot.services.audit")

def log_action(
    user_uid: str,
    action: str,
    resource_type: str,
    resource_id: str,
    admin_message: str,
    developer_payload: Optional[Dict[str, Any]] = None
):
    """
    Logs an action to the audit_logs collection in Firestore.
    """
    try:
        log_id = str(uuid.uuid4())
        timestamp_str = datetime.utcnow().isoformat()
        db = firestore.client()
        db.collection("audit_logs").document(log_id).set({
            "id": log_id,
            "subscriber_uid": user_uid,
            "timestamp": timestamp_str,
            "action": action.upper(),
            "resource_type": resource_type,
            "resource_id": resource_id,
            "admin_message": admin_message,
            "developer_payload": developer_payload or {},
        })

        logger.info(f"Audit Log Created (Firestore) [{action} {resource_type}]: {admin_message}")
    except Exception as e:
        logger.error(f"Failed to create audit log: {e}")
        # We generally do not want audit logging failures to crash the main request.
