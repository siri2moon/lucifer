"""Guess the language of a request so agents can be told explicitly which language to write in.

Relies only on distinctive scripts and a few common English words: reliable for clear cases,
otherwise returns None and the prompt falls back to "the same language as the task".
"""

from __future__ import annotations

import re

# Letters only Vietnamese uses: ă, ơ, ư, đ, vowels with two marks, and the dot-below, hook-above and tilde tones.
_VIETNAMESE = re.compile(r"[ăắằẳẵặơớờởỡợưứừửữựđấầẩẫậếềểễệốồổỗộạảẹẻẽỉịĩọỏụủũỳỵỷỹ]", re.IGNORECASE)
_KANA = re.compile(r"[\u3040-\u30ff]")
_HANGUL = re.compile(r"[\uac00-\ud7af]")
_HAN = re.compile(r"[\u4e00-\u9fff]")
_THAI = re.compile(r"[\u0e00-\u0e7f]")
_WORD = re.compile(r"[a-z]+")
_ENGLISH_WORDS = frozenset(
    "the a an and or for to of with in on about from our my your this that these is are be it we i you "
    "write create make build plan design draft add fix launch research prepare review translate find "
    "analyze improve update set up please need want".split()
)


def detect_language(text: str) -> str | None:
    """The language's English name (ready to put in a prompt), or None when unsure."""
    if _VIETNAMESE.search(text):
        return "Vietnamese"
    if _KANA.search(text):
        return "Japanese"
    if _HANGUL.search(text):
        return "Korean"
    if _HAN.search(text):
        return "Chinese"
    if _THAI.search(text):
        return "Thai"
    # Paths and URLs are usually ASCII English; drop them so they don't skew the guess.
    prose = re.sub(r"\S*[/.:]\S*", " ", text)
    if prose.isascii() and any(word in _ENGLISH_WORDS for word in _WORD.findall(prose.lower())):
        return "English"
    return None
