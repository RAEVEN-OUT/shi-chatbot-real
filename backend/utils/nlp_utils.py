import re

SHORTHAND_MAP = {
    r"\bu\b": "you",
    r"\bur\b": "your",
    r"\babt\b": "about",
    r"\bwht\b": "what",
    r"\bpls\b": "please",
    r"\bplz\b": "please",
    r"\bthx\b": "thanks",
    r"\bthk\b": "thank",
    r"\bcldnt\b": "could not",
    r"\bwldnt\b": "would not",
    r"\bdnt\b": "do not",
    r"\bdont\b": "do not",
    r"\bim\b": "i am",
    r"\bive\b": "i have",
    r"\bhw\b": "how",
    r"\bwhr\b": "where",
    r"\bwhn\b": "when",
    r"\bwhy\b": "why",
    r"\bsmth\b": "something",
    r"\bsth\b": "something",
    r"\bbtw\b": "by the way",
    r"\bfyi\b": "for your information",
    r"\basap\b": "as soon as possible",
}

def normalize_query(query: str) -> str:
    """Normalize casual user input into clean, searchable text."""
    # 1. Lowercase
    q = query.lower().strip()

    # 2. Replace shorthands using word boundaries
    for pattern, replacement in SHORTHAND_MAP.items():
        q = re.sub(pattern, replacement, q)

    # 3. Remove duplicate punctuation
    q = re.sub(r'([.!?])\1+', r'\1', q)

    # 4. Remove trailing question marks / punctuation that add no semantic value
    # (keep one if present)
    q = re.sub(r'[?!.]{2,}$', '?', q)

    # 5. Remove extra spaces
    q = re.sub(r'\s+', ' ', q).strip()

    return q
