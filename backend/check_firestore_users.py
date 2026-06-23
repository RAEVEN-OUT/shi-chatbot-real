import firebase_admin
from firebase_admin import credentials, firestore, auth

if not firebase_admin._apps:
    cred = credentials.Certificate("firebase-key.json")
    firebase_admin.initialize_app(cred)

db = firestore.client()

print("Listing auth users:")
try:
    for u in auth.list_users().iterate_all():
        print(f"Auth User: Email={u.email}, UID={u.uid}")
except Exception as e:
    print("Error listing auth users:", e)

print("\nListing firestore users:")
try:
    docs = db.collection("users").stream()
    for doc in docs:
        print(f"Firestore User Document ID={doc.id}: {doc.to_dict()}")
except Exception as e:
    print("Error listing Firestore users:", e)
