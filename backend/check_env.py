import os
import firebase_admin
from firebase_admin import credentials

print("GOOGLE_APPLICATION_CREDENTIALS:", os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"))
print("FIREBASE_CREDENTIALS_PATH:", os.environ.get("FIREBASE_CREDENTIALS_PATH"))

try:
    cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS") or os.environ.get("FIREBASE_CREDENTIALS_PATH") or "firebase-key.json"
    print("Checking if path exists:", cred_path, os.path.exists(cred_path))
    if os.path.exists(cred_path):
        cred = credentials.Certificate(cred_path)
        app = firebase_admin.initialize_app(cred)
        print("Successfully initialized Firebase app:", app.name)
    else:
        print("Firebase key file does not exist.")
except Exception as e:
    print("Failed to initialize Firebase Admin:", e)
