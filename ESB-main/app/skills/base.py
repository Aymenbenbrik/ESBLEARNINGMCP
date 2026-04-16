"""
Base class for all ESB-Learning skills.
Provides shared LLM helpers, JSON parsing, and a consistent interface.
Skills can inherit from BaseSkill or be simple functions — both are
supported by SkillManager.
"""
from __future__ import annotations

import hashlib
import json
import logging
from abc import ABC, abstractmethod
from typing import Any, Dict

from cachetools import TTLCache
from flask import current_app
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import SystemMessage, HumanMessage

logger = logging.getLogger(__name__)

# ── LLM response cache ────────────────────────────────────────────────────────
# Process-local TTL cache (512 entries, 24 h TTL).
# Keyed by sha256(system_prompt + "\x00" + user_prompt) so identical LLM calls
# made by different skill executions (e.g. bloom-classifier on the same content)
# are served from cache without hitting the Gemini API.
_llm_response_cache: TTLCache = TTLCache(maxsize=512, ttl=86_400)


def _cache_key(system_prompt: str, user_prompt: str) -> str:
    payload = f"{system_prompt}\x00{user_prompt}".encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


class BaseSkill(ABC):
    """Abstract base for structured skills."""

    skill_id: str = ''
    skill_name: str = ''
    category: str = ''  # analysis, generation, scoring, planning

    @abstractmethod
    def execute(self, context, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """Execute the skill. Must return a dict."""
        ...

    # ── LLM helpers ───────────────────────────────────────────────────────

    def get_llm(self, temperature: float = 0.3, robust: bool = False):
        """Get a Gemini LLM instance from Flask app config."""
        api_key = current_app.config.get('GOOGLE_API_KEY')
        if robust:
            model = current_app.config.get('GEMINI_MODEL_ROBUST', 'gemini-2.5-pro')
            max_tokens = 8192
        else:
            model = current_app.config.get('GEMINI_MODEL', 'gemini-2.5-flash')
            max_tokens = 4096
        return ChatGoogleGenerativeAI(
            model=model,
            google_api_key=api_key,
            temperature=temperature,
            max_tokens=max_tokens,
        )

    def call_llm(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.3,
        robust: bool = False,
    ) -> str:
        """Single LLM call returning raw text. Responses are cached for 24 h."""
        key = _cache_key(system_prompt, user_prompt)
        if key in _llm_response_cache:
            logger.debug("LLM cache hit for skill %s", getattr(self, 'skill_id', '?'))
            return _llm_response_cache[key]

        llm = self.get_llm(temperature=temperature, robust=robust)
        response = llm.invoke([
            SystemMessage(content=system_prompt),
            HumanMessage(content=user_prompt),
        ])
        result = response.content.strip()
        _llm_response_cache[key] = result
        return result

    def call_llm_json(
        self,
        system_prompt: str,
        user_prompt: str,
        **kwargs,
    ) -> Dict:
        """LLM call that parses JSON from the response (handles ```json blocks)."""
        raw = self.call_llm(system_prompt, user_prompt, **kwargs)
        if '```json' in raw:
            raw = raw.split('```json')[1].split('```')[0].strip()
        elif '```' in raw:
            raw = raw.split('```')[1].split('```')[0].strip()
        return json.loads(raw)
