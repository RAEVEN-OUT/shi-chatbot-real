import asyncio
import httpx
import json

URL = "http://localhost:8000/api/chat/ask"
WIDGET_KEY = "f2c9a822-73d8-4aec-ab93-25cb99046f42"
DOMAIN_ID = "39202541-126f-42b3-b0eb-967dfe381a86"
headers = {"Content-Type": "application/json", "X-Widget-Key": WIDGET_KEY}

async def test_scenario(name, question):
    print(f"\n--- Scenario: {name} ---")
    print(f"Q: {question}")
    async with httpx.AsyncClient() as client:
        payload = {"message": question, "session_id": f"test_{name.replace(' ', '_')}", "domain_id": DOMAIN_ID}
        response = await client.post(URL, json=payload, headers=headers, timeout=60.0)
        try:
            res = response.json()
            print(f"Status: {response.status_code}")
            print(f"Answer: {res.get('answer')}")
        except Exception as e:
            print(f"Error parsing response: {response.text}")

async def main():
    await test_scenario("Single FAQ", "What features does bot.com offer?")
    await test_scenario("Semantic FAQ", "Can you tell me the features of bot.com?")
    await test_scenario("Compound FAQ", "How can I contact customer support and what payment methods do you accept?")
    await test_scenario("Compound Document", "What is terms.txt and what laws govern the GoRide terms?")

if __name__ == "__main__":
    asyncio.run(main())
