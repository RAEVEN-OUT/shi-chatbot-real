import re

GENERIC_INTENTS = {
    "greeting": [
        "hi", "hello","hola", "hey", "good morning", "good evening", "good afternoon", "howdy", "hiya"
    ],
    "goodbye": [
        "bye", "goodbye", "see you", "cya", "farewell", "talk to you later"
    ],
    "thanks": [
        "thanks", "thank you", "thx", "appreciate it", "thanks a lot"
    ],
    "bot_identity": [
        "who are you","whts ur name","wts ur name","whts ur name?","ur name?", "what are you", "what is your name", "what's your name", "who made you", "are you human", "are you a bot"
    ],
    "capabilities": [
        "what can you do", "how can you help", "what do you do", "what are your features"
    ],
    "human_request": [
        "can i talk to a human", "connect me to support", "live agent", "talk to a person", "human please", "customer service"
    ]
}

def detect_intent(message: str) -> str | None:
    """
    Detect if the user message matches a generic conversational intent.
    Matches are case-insensitive and allow for minor punctuation variations.
    """
    # Remove punctuation for matching
    clean_msg = re.sub(r'[^\w\s]', '', message.lower()).strip()
    
    # Exact phrase matching (after basic cleaning)
    for intent, phrases in GENERIC_INTENTS.items():
        if clean_msg in phrases:
            return intent
            
    # Substring matching for human requests (since they can be phrased highly variably)
    human_keywords = ["human", "live agent", "real person", "support team"]
    if any(keyword in clean_msg for keyword in human_keywords):
        return "human_request"
        
    return None
