from __future__ import annotations

import pytest

from lucifer_engine import prompts
from lucifer_engine.language import detect_language
from lucifer_engine.protocol import CreateTaskInput

from .conftest import make_store


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("Write 3 social posts introducing Lucifer Corp", "English"),
        ("Short, warm posts for X, LinkedIn and Facebook. Save them to content/launch-posts.md.", "English"),
        ("Viết 3 bài đăng giới thiệu Lucifer Corp", "Vietnamese"),
        ("Hãy lên plan để thực hiện công việc trên", "Vietnamese"),
        ("ランディングページを作って", "Japanese"),
        ("랜딩 페이지를 만들어 주세요", "Korean"),
        ("写一篇博客文章", "Chinese"),
        ("Écrire un article de blog", None),
        ("content/launch-posts.md", None),
    ],
)
def test_detect_language(text: str, expected: str | None):
    assert detect_language(text) == expected


def test_task_brief_names_the_language_even_with_files_in_another_language(tmp_path):
    from lucifer_engine.session import TaskSession

    store = make_store()
    workspace = tmp_path / "ws"
    (workspace / "content").mkdir(parents=True)
    (workspace / "content" / "bai-dang-cu.md").write_text("Bài đăng cũ bằng tiếng Việt", "utf-8")
    task = store.create_task(
        title="Write 3 social posts introducing Lucifer Corp",
        description="",
        assignee_id="belial",
        created_by_id=None,
        parent_id=None,
        priority="normal",
        language=detect_language("Write 3 social posts introducing Lucifer Corp"),
    )
    brief = prompts.task_brief(TaskSession(store, workspace, store.require_agent("belial"), task))
    assert "Language: English. Write everything for this task in English" in brief


def test_explicit_language_wins_over_detection(company):
    from lucifer_engine.brains.sim import SimBrain

    store, engine = company(SimBrain(step_s=0.002))
    # A Vietnamese title with an explicit language: the explicit one wins.
    task = engine.assign(CreateTaskInput(title="Viết bài blog", language="English"))
    assert store.require_task(task.id).language == "English"
