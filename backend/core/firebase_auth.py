import firebase_admin
from firebase_admin import credentials, auth
from fastapi import HTTPException, Security, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from core.config import settings
from database.database import get_db
from database.models import User

security = HTTPBearer()

try:
    cred = credentials.Certificate(settings.FIREBASE_CREDENTIALS_PATH)
    firebase_admin.initialize_app(cred)
except Exception as e:
    print(f"Warning: Firebase Admin initialization failed: {e}. Ensure {settings.FIREBASE_CREDENTIALS_PATH} exists.")

def verify_firebase_token(credentials: HTTPAuthorizationCredentials = Security(security)):
    """Verifies Firebase JWT token and returns decoded token."""
    token = credentials.credentials
    try:
        decoded_token = auth.verify_id_token(token)
        return decoded_token
    except Exception as e:
        print('FIREBASE AUTH ERROR:', e)
        raise HTTPException(
            status_code=401,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

async def get_current_user(
    token_data: dict = Depends(verify_firebase_token),
    db: AsyncSession = Depends(get_db)
):
    """Fetches full user from Postgres based on Firebase UID."""
    uid = token_data.get("uid")
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid token data")
        
    stmt = select(User).where(User.firebase_uid == uid)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    
    if not user:
        # If user not found in Postgres, they might be logging in for the first time
        # Let the auth_routes /login endpoint handle creating the user.
        # But for other endpoints, they must exist.
        # So we return basic info and let them be 'subscriber' by default.
        return {
            "uid": uid,
            "email": token_data.get("email"),
            "name": token_data.get("name", ""),
            "role": "subscriber",
            "is_active": True,
            "postgres_user": None
        }
        
    if not user.is_active:
        raise HTTPException(status_code=403, detail="User account is deactivated")
        
    return {
        "uid": uid,
        "email": user.email,
        "name": user.name,
        "role": user.role,
        "is_active": user.is_active,
        "postgres_user": user
    }

async def require_subscriber(user: dict = Depends(get_current_user)):
    """Ensure user is a subscriber or admin"""
    role = user.get("role")
    if role not in ["subscriber", "admin"] and role is not None:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    return user

async def require_admin(user: dict = Depends(get_current_user)):
    """Ensure user is an admin"""
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin permissions required")
    return user
