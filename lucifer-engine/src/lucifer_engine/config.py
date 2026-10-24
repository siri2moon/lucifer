"""Environment variables and the company org chart file."""

from __future__ import annotations

import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, Field, field_validator

from .protocol import Agent, Appearance, CompanyInfo, Department, Effort, Translations

DEFAULT_MODEL = "claude-opus-5-5"


class _Defaults(BaseModel):
    model: str = DEFAULT_MODEL
    effort: Effort = "medium"


class _Employee(BaseModel):
    id: str
    name: str
    title: str
    department: str
    reportsTo: str | None = None
    persona: str
    model: str | None = None
    effort: Effort | None = None
    color: str = "#8b5cf6"
    emoji: str = "🙂"
    i18n: Translations = Field(default_factory=dict)

    @field_validator("id")
    @classmethod
    def _slug(cls, v: str) -> str:
        if not re.fullmatch(r"[a-z0-9-]+", v):
            raise ValueError("ids may only contain lowercase letters, digits and hyphens")
        return v


class _CompanyFile(BaseModel):
    name: str
    mission: str
    defaults: _Defaults = Field(default_factory=_Defaults)
    departments: list[Department] = Field(min_length=1)
    employees: list[_Employee] = Field(min_length=1)
    i18n: Translations = Field(default_factory=dict)


@dataclass(frozen=True)
class LoadedCompany:
    company: CompanyInfo
    agents: list[Agent]


def load_company(path: Path) -> LoadedCompany:
    parsed = _CompanyFile.model_validate(yaml.safe_load(path.read_text("utf-8")))

    department_ids = {d.id for d in parsed.departments}
    employee_ids = {e.id for e in parsed.employees}
    heads = [e for e in parsed.employees if e.reportsTo is None]
    if len(heads) != 1:
        raise ValueError(f"{path}: expected exactly one head (reportsTo: null), found {len(heads)}")
    for e in parsed.employees:
        if e.department not in department_ids:
            raise ValueError(f'{path}: {e.id} belongs to unknown department "{e.department}"')
        if e.reportsTo is not None and e.reportsTo not in employee_ids:
            raise ValueError(f'{path}: {e.id} reports to unknown employee "{e.reportsTo}"')

    agents = [
        Agent(
            id=e.id,
            name=e.name,
            title=e.title,
            department_id=e.department,
            manager_id=e.reportsTo,
            persona=e.persona.strip(),
            model=e.model or parsed.defaults.model,
            effort=e.effort or parsed.defaults.effort,
            appearance=Appearance(color=e.color, emoji=e.emoji),
            i18n={lang: {k: v.strip() for k, v in fields.items()} for lang, fields in e.i18n.items()},
        )
        for e in parsed.employees
    ]
    company = CompanyInfo(
        name=parsed.name,
        mission=parsed.mission.strip(),
        departments=parsed.departments,
        i18n={lang: {k: v.strip() for k, v in fields.items()} for lang, fields in parsed.i18n.items()},
    )
    return LoadedCompany(company=company, agents=agents)


GATEWAY_HOST = "https://gateway.ai.cloudflare.com/v1"


@dataclass(frozen=True)
class GatewaySettings:
    """Cloudflare AI Gateway through its OpenAI-compatible endpoint (`/compat/chat/completions`)."""

    base_url: str
    """.../v1/{account_id}/{gateway_id}/compat"""
    gateway_id: str | None
    token: str | None
    """Cloudflare API token. Used alone when the provider key is stored on the gateway (BYOK)."""
    provider_key: str | None
    """Provider key (e.g. DeepSeek) when it is not stored on the gateway; the token then goes in cf-aig-authorization."""
    strict_tools: bool
    byok_alias: str | None = None
    """Alias of the provider key stored on the gateway when it is not "default" (header `cf-aig-byok-alias`)."""

    @property
    def configured(self) -> bool:
        return bool(self.token or self.provider_key)

    @classmethod
    def from_env(cls, e: dict[str, str] | os._Environ[str]) -> GatewaySettings | None:
        base_url = e.get("CF_AIG_BASE_URL")
        account_id = e.get("CF_AIG_ACCOUNT_ID")
        gateway_id = e.get("CF_AIG_GATEWAY_ID") or None
        if not base_url and account_id:
            base_url = f"{GATEWAY_HOST}/{account_id}/{gateway_id or 'default'}/compat"
        if not base_url:
            return None
        return cls(
            base_url=base_url.rstrip("/"),
            gateway_id=gateway_id,
            token=e.get("CF_AIG_TOKEN") or None,
            provider_key=e.get("CF_AIG_PROVIDER_KEY") or None,
            strict_tools=e.get("LUCIFER_STRICT_TOOLS", "0") in ("1", "true", "yes"),
            byok_alias=e.get("CF_AIG_BYOK_ALIAS") or None,
        )


@dataclass(frozen=True)
class Settings:
    brain: Literal["auto", "crew", "sim"]
    company_file: Path
    host: str
    port: int
    heartbeat_s: float
    max_concurrent: int
    data_dir: Path
    workspace_dir: Path
    fallbacks: bool
    llm: Literal["anthropic", "gateway"]
    model_override: str | None
    """LUCIFER_MODEL: one model for every employee, overriding the models in the company file."""
    gateway: GatewaySettings | None

    @classmethod
    def from_env(cls, env: dict[str, str] | None = None) -> Settings:
        e = os.environ if env is None else env
        brain = e.get("LUCIFER_BRAIN", "auto")
        if brain not in ("auto", "crew", "sim"):
            raise ValueError(f'LUCIFER_BRAIN must be auto | crew | sim, got "{brain}"')
        heartbeat_ms = int(e.get("LUCIFER_HEARTBEAT_MS", "2000"))
        if heartbeat_ms < 200:
            raise ValueError("LUCIFER_HEARTBEAT_MS must be at least 200")
        gateway = GatewaySettings.from_env(e)
        llm = e.get("LUCIFER_LLM") or ("gateway" if gateway else "anthropic")
        if llm not in ("anthropic", "gateway"):
            raise ValueError(f'LUCIFER_LLM must be anthropic | gateway, got "{llm}"')
        if llm == "gateway" and gateway is None:
            raise ValueError("LUCIFER_LLM=gateway needs CF_AIG_ACCOUNT_ID (+ CF_AIG_GATEWAY_ID) or CF_AIG_BASE_URL")
        model_override = e.get("LUCIFER_MODEL") or None
        if llm == "gateway" and model_override is None:
            raise ValueError('LUCIFER_LLM=gateway needs LUCIFER_MODEL, for example "deepseek/deepseek-chat" or "dynamic/<route>"')
        return cls(
            brain=brain,  # type: ignore[arg-type]
            company_file=Path(e.get("LUCIFER_COMPANY", "companies/lucifer-corp.yaml")).resolve(),
            host=e.get("HOST", "0.0.0.0"),
            port=int(e.get("PORT", "4666")),
            heartbeat_s=heartbeat_ms / 1000,
            max_concurrent=max(1, int(e.get("LUCIFER_MAX_CONCURRENT", "4"))),
            data_dir=Path(e.get("LUCIFER_DATA_DIR", "data")).resolve(),
            workspace_dir=Path(e.get("LUCIFER_WORKSPACE_DIR", "workspace")).resolve(),
            fallbacks=e.get("LUCIFER_FALLBACKS", "1") not in ("0", "false", "no"),
            llm=llm,  # type: ignore[arg-type]
            model_override=model_override,
            gateway=gateway,
        )

    def resolved_brain(self, env: dict[str, str] | None = None) -> Literal["crew", "sim"]:
        if self.brain != "auto":
            return self.brain
        if self.llm == "gateway":
            return "crew" if self.gateway and self.gateway.configured else "sim"
        e = os.environ if env is None else env
        # CrewAI's Anthropic provider only reads ANTHROPIC_API_KEY (not the `ant auth login` profile).
        return "crew" if e.get("ANTHROPIC_API_KEY") else "sim"

    def llm_label(self) -> str:
        if self.llm == "gateway":
            return f"Cloudflare AI Gateway · {self.model_override}"
        return f"Anthropic · {self.model_override or 'Claude'}"
