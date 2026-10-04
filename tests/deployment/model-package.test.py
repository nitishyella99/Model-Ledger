"""Exercise the actual pre-GPU validator without importing Modal or allocating GPUs."""
import ast
import json
import struct
import tempfile
import unittest
from pathlib import Path

source = ast.parse(Path("workers/modal_app.py").read_text())
validator = next(node for node in source.body if isinstance(node, ast.FunctionDef) and node.name == "validate_files")
namespace = {"Path": Path, "json": json}
exec(compile(ast.Module(body=[validator], type_ignores=[]), "workers/modal_app.py", "exec"), namespace)
validate_files = namespace["validate_files"]


class ModelPackageTests(unittest.TestCase):
    def setUp(self):
        root = Path(".evaluation-test-dist").resolve()
        root.mkdir(exist_ok=True)
        self.directory = tempfile.TemporaryDirectory(dir=root)
        self.folder = Path(self.directory.name)
        assert self.folder.resolve().is_relative_to(root)
        (self.folder / "config.json").write_text(json.dumps({"model_type": "llama", "architectures": ["LlamaForCausalLM"]}))
        (self.folder / "tokenizer.json").write_text("{}")
        self.write_weights()

    def tearDown(self):
        self.directory.cleanup()

    def write_weights(self, shape=None, offsets=None, data=b"\x00" * 4):
        header = json.dumps({"weight": {"dtype": "F32", "shape": shape if shape is not None else [1], "data_offsets": offsets if offsets is not None else [0, 4]}}).encode()
        (self.folder / "model.safetensors").write_bytes(struct.pack("<Q", len(header)) + header + data)

    def test_valid_text_model(self):
        self.assertEqual(validate_files(self.folder)["model_type"], "llama")

    def test_truncated_weights(self):
        self.write_weights(data=b"\x00")
        with self.assertRaises(ValueError):
            validate_files(self.folder)

    def test_shape_does_not_match_data(self):
        self.write_weights(shape=[2])
        with self.assertRaises(ValueError):
            validate_files(self.folder)

    def test_noncontiguous_tensor_offsets(self):
        self.write_weights(offsets=[1, 5], data=b"\x00" * 5)
        with self.assertRaises(ValueError):
            validate_files(self.folder)

    def test_missing_weight_shard(self):
        (self.folder / "model.safetensors.index.json").write_text(json.dumps({"weight_map": {"weight": "missing.safetensors"}}))
        with self.assertRaises(ValueError):
            validate_files(self.folder)

    def test_missing_tensor_in_declared_shard(self):
        (self.folder / "model.safetensors.index.json").write_text(json.dumps({"weight_map": {"missing": "model.safetensors"}}))
        with self.assertRaises(ValueError):
            validate_files(self.folder)

    def test_custom_code_is_rejected(self):
        (self.folder / "config.json").write_text(json.dumps({"model_type": "llama", "auto_map": {"AutoModel": "custom.Model"}}))
        with self.assertRaises(ValueError):
            validate_files(self.folder)

    def test_classification_model_is_rejected(self):
        (self.folder / "config.json").write_text(json.dumps({"model_type": "llama", "architectures": ["LlamaForSequenceClassification"]}))
        with self.assertRaises(ValueError):
            validate_files(self.folder)


if __name__ == "__main__":
    unittest.main()
