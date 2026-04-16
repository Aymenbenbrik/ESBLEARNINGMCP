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
import statistics
from abc import ABC, abstractmethod
from collections import Counter
from typing import Any, Dict, List, Optional

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


# ── Self-consistency helpers ──────────────────────────────────────────────────

def _merge_consistent(results: List[Dict]) -> Dict:
    """Merge N JSON dicts from self-consistency runs.

    Strategy per leaf value type:
    - int / float  → median (robust to outliers)
    - str          → majority vote (most common value)
    - list         → from the majority-vote result
    - dict         → recursively merged
    """
    if not results:
        return {}
    merged: Dict = {}
    keys = set()
    for r in results:
        keys.update(r.keys())

    for key in keys:
        values = [r[key] for r in results if key in r]
        if not values:
            continue

        sample = values[0]
        if isinstance(sample, (int, float)):
            merged[key] = statistics.median(values)
        elif isinstance(sample, str):
            counter = Counter(values)
            merged[key] = counter.most_common(1)[0][0]
        elif isinstance(sample, dict):
            merged[key] = _merge_consistent(values)
        else:
            # For lists or unknown types, use the majority-vote result
            counter = Counter(json.dumps(v, sort_keys=True, default=str) for v in values)
            best_json = counter.most_common(1)[0][0]
            merged[key] = json.loads(best_json)

    return merged


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

    # ── Self-consistency ───────────────────────────────────────────────────

    def call_llm_json_consistent(
        self,
        system_prompt: str,
        user_prompt: str,
        n: int = 3,
        temperature: float = 0.7,
        **kwargs,
    ) -> Dict:
        """Self-consistency decoding: run N independent LLM calls and merge.

        For numeric leaf values the median is returned.
        For string leaf values majority-vote wins.
        Falls back to a single call if all N attempts fail.

        Using ``temperature >= 0.6`` ensures diverse reasoning paths.
        Cache is intentionally bypassed per attempt via a unique suffix.
        """
        results: List[Dict] = []
        for i in range(n):
            # Unique suffix bypasses the TTLCache so each call is independent
            varied_prompt = f"{user_prompt}\n<!-- attempt {i + 1} -->"
            try:
                result = self.call_llm_json(
                    system_prompt, varied_prompt, temperature=temperature, **kwargs
                )
                results.append(result)
            except Exception as exc:
                logger.warning(
                    "Self-consistency attempt %d/%d failed for skill %s: %s",
                    i + 1, n, getattr(self, 'skill_id', '?'), exc,
                )

        if not results:
            raise RuntimeError(
                f"All {n} self-consistency attempts failed for skill {getattr(self, 'skill_id', '?')}"
            )
        if len(results) == 1:
            return results[0]

        return _merge_consistent(results)

    # ── Prompt versioning ──────────────────────────────────────────────────

    def call_llm_versioned(
        self,
        user_prompt: str,
        variant: str = 'default',
        fallback_system: str = '',
        **kwargs,
    ) -> Dict:
        """Call the LLM using a DB-versioned system prompt (PromptVersion).

        Falls back to *fallback_system* (the hardcoded prompt) when no active
        version is found in the database — ensuring zero downtime during
        initial deployment before any versions have been seeded.
        """
        system_prompt = fallback_system
        try:
            from app.models.skills import PromptVersion
            pv = PromptVersion.get_active(self.skill_id, variant)
            if pv:
                system_prompt = pv.system_prompt
                if pv.user_prompt_template:
                    user_prompt = pv.user_prompt_template.format(content=user_prompt)
                logger.debug(
                    "PromptVersion loaded for skill=%s variant=%s", self.skill_id, variant
                )
        except Exception as exc:
            logger.debug("PromptVersion lookup skipped: %s", exc)

        return self.call_llm_json(system_prompt, user_prompt, **kwargs)

    # ── Structured output (native Gemini schema) ───────────────────────────

    def call_llm_structured(
        self,
        schema: type,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.2,
        robust: bool = False,
    ) -> Any:
        """Call the LLM with a Pydantic schema for native structured output.

        Uses Gemini's ``with_structured_output()`` which enforces JSON schema
        at the API level — eliminating manual JSON parsing and markdown-block
        extraction entirely.  Falls back to ``call_llm_json()`` if the schema
        binding fails (e.g. model doesn't support structured output).

        Example usage::

            from pydantic import BaseModel, Field

            class BloomResult(BaseModel):
                level: str = Field(description="Bloom level name")
                confidence: float = Field(ge=0.0, le=1.0)
                justification: str

            result = self.call_llm_structured(BloomResult, system, user, temperature=0.1)
            # result is a BloomResult instance, not a raw dict
        """
        try:
            llm = self.get_llm(temperature=temperature, robust=robust)
            structured_llm = llm.with_structured_output(schema)
            return structured_llm.invoke([
                SystemMessage(content=system_prompt),
                HumanMessage(content=user_prompt),
            ])
        except Exception as exc:
            logger.warning(
                "Structured output failed for skill %s (falling back to JSON): %s",
                getattr(self, 'skill_id', '?'), exc,
            )
            raw = self.call_llm(system_prompt, user_prompt, temperature=temperature, robust=robust)
            if '```json' in raw:
                raw = raw.split('```json')[1].split('```')[0].strip()
            elif '```' in raw:
                raw = raw.split('```')[1].split('```')[0].strip()
            return json.loads(raw)


# ── AA list compression utility ───────────────────────────────────────────────

_MAX_AA_TOKENS = 400   # Rough token budget for AA context in a prompt


def compress_aa_list(aa_descriptions: list, max_chars: int = _MAX_AA_TOKENS * 4) -> str:
    """Compress a list of AA dicts/strings to fit within a token budget.

    Each AA is expected to be a dict ``{"code": ..., "description": ...}`` or
    a pre-formatted string.  When the combined text exceeds *max_chars*, the
    descriptions are truncated at word boundaries and a summary note is added.

    This prevents prompt bloat when a course has 20+ AAs with long descriptions.
    """
    if not aa_descriptions:
        return ''

    lines: list[str] = []
    for aa in aa_descriptions:
        if isinstance(aa, dict):
            code = aa.get('code', '')
            desc = aa.get('description', '')
            lines.append(f"- {code}: {desc}")
        else:
            lines.append(str(aa))

    full_text = '\n'.join(lines)
    if len(full_text) <= max_chars:
        return full_text

    # Truncate: keep as many full lines as fit
    budget = max_chars - 60   # Reserve space for the truncation note
    kept: list[str] = []
    used = 0
    for line in lines:
        if used + len(line) + 1 > budget:
            break
        kept.append(line)
        used += len(line) + 1

    omitted = len(lines) - len(kept)
    kept.append(
        f"... [{omitted} AA(s) omitted — utilise les AA listés ci-dessus pour l'alignement]"
    )
    return '\n'.join(kept)
