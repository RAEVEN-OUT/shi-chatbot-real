import re

SHORTHAND_MAP = {
    r"\bu\b": "you",
    r"\bur\b": "your",
    r"\babt\b": "about",
    r"\bwht\b": "what",
    r"\bpls\b": "please",
    r"\bplz\b": "please",
    r"\bthx\b": "thanks",
    r"\bthk\b": "thank"
}

def normalize_query(query: str) -> str:
    # 1. Lowercase
    q = query.lower()
    
    # 2. Replace shorthands using word boundaries
    for pattern, replacement in SHORTHAND_MAP.items():
        q = re.sub(pattern, replacement, q)
        
    # 3. Remove duplicate punctuation
    q = re.sub(r'([.!?])\1+', r'\1', q)
    
    # 4. Remove extra spaces
    q = re.sub(r'\s+', ' ', q).strip()
    
    return q
