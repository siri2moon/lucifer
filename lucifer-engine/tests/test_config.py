import pytest

from lucifer_engine.config import Settings


def test_gateway_from_account_and_gateway_id():
    s = Settings.from_env(
        {"CF_AIG_ACCOUNT_ID": "acc", "CF_AIG_GATEWAY_ID": "lucifer", "CF_AIG_TOKEN": "t", "LUCIFER_MODEL": "deepseek/deepseek-chat"}
    )
    assert s.llm == "gateway"
    assert s.gateway is not None
    assert s.gateway.base_url == "https://gateway.ai.cloudflare.com/v1/acc/lucifer/compat"
    assert s.resolved_brain({}) == "crew"
    assert s.llm_label() == "Cloudflare AI Gateway · deepseek/deepseek-chat"
    assert s.gateway.byok_alias is None


def test_gateway_reads_byok_alias():
    s = Settings.from_env({"CF_AIG_ACCOUNT_ID": "acc", "CF_AIG_TOKEN": "t", "CF_AIG_BYOK_ALIAS": "thaomai", "LUCIFER_MODEL": "deepseek/deepseek-chat"})
    assert s.gateway is not None and s.gateway.byok_alias == "thaomai"


def test_gateway_without_model_or_token():
    with pytest.raises(ValueError, match="LUCIFER_MODEL"):
        Settings.from_env({"CF_AIG_ACCOUNT_ID": "acc", "CF_AIG_TOKEN": "t"})
    s = Settings.from_env({"CF_AIG_ACCOUNT_ID": "acc", "LUCIFER_MODEL": "dynamic/lucifer"})
    assert s.resolved_brain({}) == "sim"  # no token or key yet: the gateway can't be called


def test_defaults_to_anthropic():
    s = Settings.from_env({})
    assert s.llm == "anthropic"
    assert s.resolved_brain({}) == "sim"
    assert s.resolved_brain({"ANTHROPIC_API_KEY": "k"}) == "crew"
