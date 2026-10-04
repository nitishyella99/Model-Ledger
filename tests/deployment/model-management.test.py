"""Verify scoped worker-cache deletion without contacting Modal or allocating a GPU."""
import ast
import tempfile
import unittest
import uuid
from pathlib import Path
from types import SimpleNamespace

source = ast.parse(Path("workers/modal_app.py").read_text())
nodes = [node for node in source.body if isinstance(node, ast.FunctionDef) and node.name in ("model_cache_directory", "delete_model_cache")]
for node in nodes:
    node.decorator_list = []
namespace = {"Path": Path, "uuid": uuid}
exec(compile(ast.Module(body=nodes, type_ignores=[]), "workers/modal_app.py", "exec"), namespace)
cache_directory = namespace["model_cache_directory"]


class Query:
    def __init__(self, table, operation, dependents):
        self.table = table
        self.operation = operation
        self.dependents = dependents
        self.is_single = False

    def select(self, *_args): return self
    def eq(self, *_args): return self
    def neq(self, *_args): return self
    def single(self):
        self.is_single = True
        return self

    def execute(self):
        return SimpleNamespace(data=[{"id": "project"}] if self.table == "models" else self.operation if self.is_single else self.dependents)


class ModelManagementTests(unittest.TestCase):
    def setUp(self):
        root = Path(".evaluation-test-dist").resolve()
        root.mkdir(exist_ok=True)
        self.directory = tempfile.TemporaryDirectory(dir=root)
        self.root = Path(self.directory.name).resolve()
        assert self.root.is_relative_to(root)
        self.operation = {"id": str(uuid.uuid4()), "owner_user_id": "user_a", "model_id": "project", "model_version_id": "version", "settings": {"deleting": True}, "stage": "cancelled", "cancel_requested": True, "reserved_seconds": 0, "lease_expires_at": None}
        self.dependents = []
        self.folder = cache_directory("user_a", self.operation["id"], self.root)
        self.folder.mkdir(parents=True)
        (self.folder / "weights.safetensors").write_bytes(b"model")
        self.sibling = cache_directory("user_b", str(uuid.uuid4()), self.root)
        self.sibling.mkdir(parents=True)
        (self.sibling / "weights.safetensors").write_bytes(b"other model")
        namespace["database"] = lambda: SimpleNamespace(table=lambda table: Query(table, self.operation, self.dependents))
        namespace["volume"] = SimpleNamespace(reload=lambda: None, commit=lambda: None)
        namespace["model_cache_directory"] = lambda owner, operation_id: cache_directory(owner, operation_id, self.root)

    def tearDown(self): self.directory.cleanup()

    def remove(self):
        return namespace["delete_model_cache"]({"operation_id": self.operation["id"], "owner_user_id": "user_a"})

    def test_deletion_removes_only_selected_models_cache_and_can_retry(self):
        self.assertEqual(self.remove(), {"deleted": True})
        self.assertFalse(self.folder.exists())
        self.assertEqual((self.sibling / "weights.safetensors").read_bytes(), b"other model")
        self.assertEqual(self.remove(), {"deleted": True})

    def test_unmarked_model_is_not_deleted(self):
        self.operation["settings"]["deleting"] = False
        with self.assertRaises(ValueError): self.remove()
        self.assertTrue(self.folder.exists())

    def test_running_worker_is_not_deleted(self):
        self.operation["reserved_seconds"] = 60
        with self.assertRaises(ValueError): self.remove()
        self.assertTrue(self.folder.exists())

    def test_baseline_in_use_is_not_deleted(self):
        self.dependents.append({"stage": "evaluating", "reserved_seconds": 60, "lease_expires_at": None})
        with self.assertRaises(ValueError): self.remove()
        self.assertTrue(self.folder.exists())

    def test_paths_cannot_escape_the_model_cache(self):
        for owner in ("../user_b", "/absolute", ".", "user_a\\other"):
            with self.assertRaises(ValueError): cache_directory(owner, self.operation["id"], self.root)
        with self.assertRaises(ValueError): cache_directory("user_a", "../another-model", self.root)


if __name__ == "__main__": unittest.main()
