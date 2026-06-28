from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
import os
import shutil
import uuid
from typing import Dict

from core.firebase_auth import require_subscriber

router = APIRouter(tags=["upload"])

# Directory to store uploaded logos
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "public", "logos")

# Ensure the upload directory exists
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("/upload-logo")
async def upload_logo(
    file: UploadFile = File(...),
    user: dict = Depends(require_subscriber)
) -> Dict[str, str]:
    """
    Uploads a logo image to the backend's public directory.
    Returns the URL to access the uploaded logo.
    """
    # Validate file extension
    allowed_extensions = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
    ext = os.path.splitext(file.filename)[1].lower()
    
    if ext not in allowed_extensions:
        raise HTTPException(status_code=400, detail="Invalid file type. Only JPG, PNG, GIF, and WEBP are allowed.")
    
    # Generate unique filename
    filename = f"logo_{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(UPLOAD_DIR, filename)
    
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not save file: {e}")
        
    # Return the absolute or relative URL
    # Assuming the frontend accesses it via backend URL or it's mounted on /public
    file_url = f"/public/logos/{filename}"
    
    return {
        "status": "success",
        "url": file_url,
        "message": "Logo uploaded successfully"
    }
