import requests

url = "http://localhost:8000/chat/ask"
payload = {
    "domain_id": "4a08ea55-a352-4b08-afd6-3a9c021ca1bc",
    "message": "can you tell me a little bit about what your company does? I want a long answer."
}

try:
    response = requests.post(url, json=payload)
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.text}")
except Exception as e:
    print(f"Error: {e}")
