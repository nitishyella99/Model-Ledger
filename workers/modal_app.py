"""Private Modal control service, resumable jobs, and isolated vLLM runtimes."""
import os
import json
import time
import uuid
import base64
from pathlib import Path

import modal

app = modal.App("modelledger")
HOSTED_GPU_ENABLED = os.environ.get("MODELLEDGER_DEPLOY_GPU", "true").lower() != "false"
secrets = [modal.Secret.from_name("modelledger-worker")]
volume = modal.Volume.from_name("modelledger-models", create_if_missing=True)
cpu = (modal.Image.from_registry("node:22-bookworm-slim", add_python="3.11")
       .apt_install("ca-certificates")
       .pip_install("fastapi[standard]==0.115.12", "supabase==2.15.3", "huggingface_hub==0.30.2", "cryptography==44.0.2", "boto3==1.35.99")
       .add_local_file("workers/dist/evaluate.cjs", "/worker/evaluate.cjs"))
gpu = (modal.Image.debian_slim(python_version="3.11")
       .pip_install("vllm==0.8.5", "supabase==2.15.3", "huggingface_hub==0.30.2", "cryptography==44.0.2"))


def database():
    from supabase import create_client
    return create_client(os.environ["NEXT_PUBLIC_SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])


def owned_job(payload):
    from datetime import datetime, timezone
    db = database()
    job = db.table("model_onboarding").select("*").eq("id", payload["job_id"]).eq("owner_user_id", payload["owner_user_id"]).single().execute().data
    project = db.table("models").select("id").eq("id", job["model_id"]).eq("owner_user_id", job["owner_user_id"]).execute().data
    if not project or job["cancel_requested"] or job["lease_token"] != payload["lease_token"]:
        raise ValueError("Job authorization expired or evaluation cancelled.")
    if not job["lease_expires_at"] or datetime.fromisoformat(job["lease_expires_at"].replace("Z", "+00:00")) < datetime.now(timezone.utc):
        raise ValueError("Worker lease expired.")
    target = db.table("model_onboarding").select("*").eq("id", payload["operation_id"]).eq("model_id", job["model_id"]).eq("owner_user_id", job["owner_user_id"]).single().execute().data
    if target["settings"].get("deleting"):
        raise ValueError("This model is being deleted.")
    if target["settings"]["source"] == "api":
        raise ValueError("Existing API models do not use GPU workers.")
    if job["reserved_seconds"] <= 0:
        raise ValueError("This job has no GPU allowance.")
    return job, target


def repository_token(operation_id):
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    rows = database().table("model_private_credentials").select("ciphertext").eq("operation_id", operation_id).execute().data
    if not rows:
        return None
    version, nonce, tag, encrypted = rows[0]["ciphertext"].split(":")
    if version != "v1":
        raise ValueError("Unknown credential encryption version.")
    key = base64.b64decode(os.environ["MODEL_CREDENTIAL_KEY_V1"])
    return AESGCM(key).decrypt(base64.b64decode(nonce), base64.b64decode(encrypted) + base64.b64decode(tag), None).decode()


def model_cache_directory(owner, operation_id, root="/models"):
    import re
    if not re.fullmatch(r"[A-Za-z0-9_-]+", owner):
        raise ValueError("Invalid model owner.")
    canonical_id = str(uuid.UUID(operation_id))
    base = Path(root).resolve()
    directory = (base / owner / canonical_id).resolve()
    if directory != base / owner / canonical_id or not directory.is_relative_to(base):
        raise ValueError("Invalid model cache directory.")
    return directory


@app.function(image=cpu, secrets=secrets, volumes={"/models": volume}, timeout=120)
def delete_model_cache(payload):
    import shutil
    from datetime import datetime, timezone
    db = database()
    op = db.table("model_onboarding").select("*").eq("id", payload["operation_id"]).eq("owner_user_id", payload["owner_user_id"]).single().execute().data
    project = db.table("models").select("id").eq("id", op["model_id"]).eq("owner_user_id", op["owner_user_id"]).execute().data
    if not project or not op["settings"].get("deleting") or op["stage"] != "cancelled" or not op["cancel_requested"]:
        raise ValueError("Model is not marked for deletion.")
    if op["reserved_seconds"] or (op["lease_expires_at"] and datetime.fromisoformat(op["lease_expires_at"].replace("Z", "+00:00")) > datetime.now(timezone.utc)):
        raise ValueError("The worker is still using this model.")
    dependents = db.table("model_onboarding").select("stage,lease_expires_at,reserved_seconds").eq("model_id", op["model_id"]).eq("owner_user_id", op["owner_user_id"]).eq("baseline_version_id", op["model_version_id"]).neq("id", op["id"]).execute().data
    for job in dependents:
        if job["stage"] in ("queued", "validating", "preparing", "evaluating") or job["reserved_seconds"] or (job["lease_expires_at"] and datetime.fromisoformat(job["lease_expires_at"].replace("Z", "+00:00")) > datetime.now(timezone.utc)):
            raise ValueError("Another evaluation is using this model.")
    volume.reload()
    directory = model_cache_directory(op["owner_user_id"], op["id"])
    if directory.exists():
        try:
            shutil.rmtree(directory)
        except FileNotFoundError:
            pass
    volume.commit()
    return {"deleted": True}


def validate_files(folder):
    import struct
    import math
    config = json.loads((folder / "config.json").read_text())
    if config.get("model_type") not in ("llama", "mistral", "qwen2") or config.get("auto_map") or config.get("quantization_config"):
        raise ValueError("Use a standard Llama, Mistral, or Qwen2 Safetensors model without custom code or quantization.")
    architectures = config.get("architectures", [])
    if architectures and any(name not in ("LlamaForCausalLM", "MistralForCausalLM", "Qwen2ForCausalLM") for name in architectures):
        raise ValueError("Use a supported causal text-generation architecture.")
    if not any((folder / name).exists() for name in ("tokenizer.json", "tokenizer.model")):
        raise ValueError("Tokenizer files are missing.")
    weights = list(folder.glob("*.safetensors"))
    if not weights:
        raise ValueError("Safetensors weights are missing.")
    # Validate every container before allocating a GPU, including truncated shards.
    tensor_names = {}
    dtype_sizes = {"F64": 8, "F32": 4, "F16": 2, "BF16": 2, "I64": 8, "I32": 4, "I16": 2, "I8": 1, "U64": 8, "U32": 4, "U16": 2, "U8": 1, "BOOL": 1, "F8_E4M3": 1, "F8_E5M2": 1}
    for weight in weights:
        with weight.open("rb") as stream:
            prefix = stream.read(8)
            if len(prefix) != 8:
                raise ValueError(f"Incomplete Safetensors file: {weight.name}")
            header_size = struct.unpack("<Q", prefix)[0]
            if header_size < 2 or header_size > 100_000_000 or header_size + 8 > weight.stat().st_size:
                raise ValueError(f"Invalid Safetensors header: {weight.name}")
            header = json.loads(stream.read(header_size))
            payload_size = weight.stat().st_size - header_size - 8
            offsets = []
            for name, tensor in header.items():
                if name == "__metadata__":
                    continue
                start, end = tensor["data_offsets"]
                if not isinstance(start, int) or not isinstance(end, int) or start < 0 or end < start or end > payload_size:
                    raise ValueError(f"Incomplete tensor data: {weight.name}")
                shape = tensor.get("shape")
                if not isinstance(shape, list) or any(not isinstance(n, int) or n < 0 for n in shape) or tensor.get("dtype") not in dtype_sizes:
                    raise ValueError(f"Invalid tensor metadata: {weight.name}")
                if math.prod(shape) * dtype_sizes[tensor["dtype"]] != end - start:
                    raise ValueError(f"Incomplete tensor weights: {weight.name}")
                offsets.append((start, end))
            cursor = 0
            for start, end in sorted(offsets):
                if start != cursor:
                    raise ValueError(f"Invalid tensor offsets: {weight.name}")
                cursor = end
            if not offsets or cursor != payload_size:
                raise ValueError(f"Incomplete weight data: {weight.name}")
            tensor_names[weight.name] = set(header) - {"__metadata__"}
    index = folder / "model.safetensors.index.json"
    if index.exists():
        weight_map = json.loads(index.read_text())["weight_map"]
        if not weight_map:
            raise ValueError("Weight shard index is empty.")
        for tensor, name in weight_map.items():
            if Path(name).name != name or not (folder / name).is_file():
                raise ValueError("A required weight shard is missing.")
            if tensor not in tensor_names.get(name, set()):
                raise ValueError("A required tensor is missing from its weight shard.")
    total = sum(file.stat().st_size for file in weights)
    if total > 55_000_000_000:
        raise ValueError("This package exceeds the single A100 serving profile. Connect an existing model API instead.")
    return config


@app.function(image=cpu, secrets=secrets, volumes={"/models": volume}, memory=4096, timeout=1800)
def prepare(payload):
    job, op = owned_job(payload)
    settings = op["settings"]
    if settings["source"] == "huggingface":
        from huggingface_hub import HfApi, snapshot_download
        token = repository_token(op["id"])
        info = HfApi().model_info(settings["repository"], revision=op["artifact_revision"] or settings["revision"] or "main", token=token, files_metadata=True)
        revision = info.sha
        import re
        if not re.fullmatch(r"[0-9a-f]{40}", revision):
            raise ValueError("Repository revision could not be pinned.")
        allowance = database().table("deployment_allowances").select("*").eq("owner_user_id", op["owner_user_id"]).single().execute().data
        sizes = [file.size for file in info.siblings if file.rfilename.endswith((".json", ".safetensors", ".model", ".txt", ".tiktoken"))]
        if any(size is None for size in sizes) or sum(sizes) > min(55_000_000_000, allowance["max_storage_bytes"]):
            raise ValueError("Repository exceeds your model storage allowance.")
        database().rpc("reserve_model_import", {"p_id": op["id"], "p_owner": op["owner_user_id"], "p_bytes": sum(sizes), "p_revision": revision}).execute()
        folder = Path("/models") / op["owner_user_id"] / op["id"] / revision
        folder.mkdir(parents=True, exist_ok=True)
        snapshot_download(settings["repository"], revision=revision, token=token, local_dir=str(folder), allow_patterns=["*.json", "*.safetensors", "*.model", "*.txt", "*.tiktoken"])
    else:
        import hashlib
        revision = hashlib.sha256(json.dumps(sorted(settings["files"], key=lambda file: file["path"]), sort_keys=True).encode()).hexdigest()
        folder = Path("/models") / op["owner_user_id"] / op["id"] / revision
        folder.mkdir(parents=True, exist_ok=True)
        import urllib.request
        db = database()
        for entry in settings["files"]:
            parts = Path(entry["path"]).parts
            if not parts or any(part in ("..", ".") for part in parts) or Path(entry["path"]).is_absolute():
                raise ValueError("Invalid model file path.")
            destination = folder / entry["path"]
            if destination.exists() and destination.stat().st_size == entry["size"]:
                continue
            destination.parent.mkdir(parents=True, exist_ok=True)
            key = f'{op["owner_user_id"]}/{op["id"]}/{entry["path"]}'
            if settings.get("artifactStorage") == "r2":
                import boto3
                storage = boto3.client("s3", endpoint_url=f'https://{os.environ["R2_ACCOUNT_ID"]}.r2.cloudflarestorage.com', region_name="auto", aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"], aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"])
                storage.download_file(os.environ["R2_BUCKET_NAME"], key, str(destination))
            else:
                # Existing uploads retain their original backend until explicitly replaced.
                signed = db.storage.from_("model-artifacts").create_signed_url(key, 3600)
                urllib.request.urlretrieve(signed["signedURL"], str(destination))
            if destination.stat().st_size != entry["size"]:
                raise ValueError(f'Incomplete model file: {entry["path"]}')
    validate_files(folder)
    owned_job(payload)
    volume.commit()
    return {"revision": revision}


def runtime_class(cls):
    # API-only rollout registers no GPU function and cannot allocate a GPU.
    if not HOSTED_GPU_ENABLED:
        return cls
    return app.cls(image=gpu, gpu="A100-80GB", secrets=secrets, volumes={"/models": volume}, timeout=1800, scaledown_window=60, max_containers=1)(cls)


@runtime_class
class ModelRuntime:
    owner: str = modal.parameter()
    operation_id: str = modal.parameter()
    revision: str = modal.parameter()

    @modal.enter()
    def load(self):
        from vllm import LLM
        import re
        if not re.fullmatch(r"(?:[0-9a-f]{40}|[0-9a-f]{64})", self.revision):
            raise ValueError("Invalid deployment revision.")
        volume.reload()
        folder = Path("/models") / self.owner / self.operation_id / self.revision
        validate_files(folder)
        self.model = LLM(model=str(folder), tokenizer=str(folder), trust_remote_code=False, max_model_len=4096, gpu_memory_utilization=0.85, dtype="auto", enforce_eager=True)

    @modal.method()
    def infer(self, messages, max_tokens):
        from vllm import SamplingParams
        params = SamplingParams(max_tokens=max(1, min(int(max_tokens), 512)), temperature=0)
        if self.model.get_tokenizer().chat_template:
            result = self.model.chat(messages, params)[0]
        else:
            prompt = "\n".join(message["content"] for message in messages)
            result = self.model.generate([prompt], params)[0]
        input_tokens = len(result.prompt_token_ids)
        output_tokens = len(result.outputs[0].token_ids)
        return {"choices": [{"message": {"role": "assistant", "content": result.outputs[0].text}}], "usage": {"prompt_tokens": input_tokens, "completion_tokens": output_tokens, "total_tokens": input_tokens + output_tokens}}


@app.function(image=cpu, secrets=secrets, timeout=3600)
def process_job(operation_id, owner_user_id):
    import subprocess
    subprocess.run(["node", "/worker/evaluate.cjs", operation_id, owner_user_id], check=True)


@app.function(image=cpu, secrets=secrets, schedule=modal.Period(minutes=1), timeout=120)
def reconcile():
    from datetime import datetime, timezone
    db = database()
    query = db.table("model_onboarding").select("id,owner_user_id,lease_expires_at").in_("stage", ["queued", "validating", "preparing", "evaluating"]).eq("cancel_requested", False)
    if not HOSTED_GPU_ENABLED:
        query = query.eq("settings->>source", "api")
    jobs = query.limit(100).execute().data
    for job in jobs:
        expires = job["lease_expires_at"]
        if not expires or datetime.fromisoformat(expires.replace("Z", "+00:00")) < datetime.now(timezone.utc):
            process_job.spawn(job["id"], job["owner_user_id"])


def wait_for_call(call, payload):
    started = time.monotonic()
    initial, _ = owned_job(payload)
    duration = max(1, initial["reserved_seconds"] - initial["used_seconds"])
    try:
        while True:
            job, _ = owned_job(payload)
            if time.monotonic() - started > duration:
                raise ValueError("Deployment allowance reached.")
            try:
                return call.get(timeout=2)
            except TimeoutError:
                continue
    except BaseException:
        call.cancel(terminate_containers=True)
        raise


@app.function(image=cpu, secrets=secrets, timeout=3600)
@modal.asgi_app(requires_proxy_auth=True)
def control():
    from fastapi import FastAPI, HTTPException
    api = FastAPI()

    @api.get("/health")
    def health():
        # This route shares Modal proxy authentication with the other routes.
        # Inspect the schema without returning any project data or credentials.
        try:
            database().table("model_onboarding").select("id").limit(0).execute()
            return {"status": "ready"}
        except Exception:
            raise HTTPException(503, "Worker database configuration is unavailable.")

    @api.post("/submit")
    def submit(payload: dict):
        uuid.UUID(payload["operation_id"])
        db = database()
        op = db.table("model_onboarding").select("id,model_id,stage,settings").eq("id", payload["operation_id"]).eq("owner_user_id", payload["owner_user_id"]).single().execute().data
        if not HOSTED_GPU_ENABLED and op["settings"].get("source") != "api":
            raise HTTPException(503, "GPU hosting is disabled. Save a draft or connect an existing model API.")
        if op["stage"] != "queued":
            raise HTTPException(409, "Job is not queued.")
        project = db.table("models").select("id").eq("id", op["model_id"]).eq("owner_user_id", payload["owner_user_id"]).execute().data
        if not project:
            raise HTTPException(404, "Project not found.")
        call = process_job.spawn(op["id"], payload["owner_user_id"])
        return {"worker_id": call.object_id}

    @api.post("/prepare")
    def prepare_endpoint(payload: dict):
        if not HOSTED_GPU_ENABLED:
            raise HTTPException(503, "GPU hosting is disabled. Connect an existing model API.")
        try:
            owned_job(payload)
            return wait_for_call(prepare.spawn(payload), payload)
        except Exception:
            raise HTTPException(422, "Model package could not be prepared. Check configuration, tokenizer, and all weight shards.")

    @api.post("/delete-model")
    def delete_model_endpoint(payload: dict):
        try:
            uuid.UUID(payload["operation_id"])
            return delete_model_cache.remote(payload)
        except Exception:
            raise HTTPException(409, "Model cache cleanup could not finish. Wait for active workers to stop and retry deletion.")

    @api.post("/inference")
    def inference(payload: dict):
        if not HOSTED_GPU_ENABLED:
            raise HTTPException(503, "GPU hosting is disabled. Connect an existing model API.")
        try:
            _, target = owned_job(payload)
            call = ModelRuntime(owner=target["owner_user_id"], operation_id=target["id"], revision=target["artifact_revision"]).infer.spawn(payload["messages"], payload.get("max_tokens",512))
            return wait_for_call(call, payload)
        except Exception:
            raise HTTPException(422, "Model startup or inference failed. Check compatibility and deployment allowance.")
    return api
