from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from core.firebase_auth import verify_firebase_token
from database.database import get_db
from database.models import User, Organization

router = APIRouter(prefix="/api/auth", tags=["auth"])

@router.post("/login")
async def login(
    token_data: dict = Depends(verify_firebase_token),
    db: AsyncSession = Depends(get_db)
):
    firebase_uid = token_data.get("uid")
    email = token_data.get("email")
    name = token_data.get("name", "")

    if not firebase_uid:
        raise HTTPException(status_code=400, detail="Invalid token data")

    # Check if user exists
    stmt = select(User).where(User.firebase_uid == firebase_uid)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user:
        # Create new user
        # Let's check if the email is our admin (e.g., developer@cwd.co.in)
        role = "admin" if email in ["developer@cwd.co.in", "admin@example.com"] else "subscriber"
        user = User(
            firebase_uid=firebase_uid,
            email=email,
            name=name,
            role=role
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
    elif not user.role:
        user.role = "admin" if email in ["developer@cwd.co.in", "admin@example.com"] else "subscriber"
        db.add(user)
        await db.commit()
        await db.refresh(user)

    # Ensure user has an organization (for subscribers and admins alike to own domains)
    if not user.organization_id:
        org_name = f"{user.name or user.email}'s Workspace"
        # Create a new organization
        org = Organization(name=org_name, owner_id=user.id)
        db.add(org)
        await db.commit()
        await db.refresh(org)
        
        # Link user to organization
        user.organization_id = org.id
        db.add(user)
        await db.commit()
        await db.refresh(user)

    return {
        "status": "success",
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "firebase_uid": user.firebase_uid,
            "role": user.role,
            "is_active": user.is_active,
            "organization_id": user.organization_id
        }
    }
