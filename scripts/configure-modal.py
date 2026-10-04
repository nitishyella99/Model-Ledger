"""Synchronize only worker credentials to Modal without displaying secrets."""
import argparse
import re
from pathlib import Path
from urllib.parse import urlparse

import modal
from modal.workspace import Workspace

parser = argparse.ArgumentParser()
parser.add_argument("--control-url", help="Private deployed control service URL")
args = parser.parse_args()
path = Path(".env.local")
contents = path.read_text()
values = {}
for line in contents.splitlines():
    if line.strip() and not line.lstrip().startswith("#") and "=" in line:
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")

for key in ("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "MODEL_CREDENTIAL_KEY_V1"):
    if not values.get(key):
        raise SystemExit(f"Configure {key} before synchronizing the worker.")

def save(key, value):
    global contents
    # Values are single-line keys/URLs. Never print them or create a second copy.
    if "\n" in value or "\r" in value:
        raise ValueError("Configuration values must be single-line")
    pattern = rf"^{re.escape(key)}=.*$"
    contents = re.sub(pattern, lambda _: f"{key}={value}", contents, flags=re.M) if re.search(pattern, contents, re.M) else contents.rstrip() + f"\n{key}={value}\n"
    path.write_text(contents)
    values[key] = value

if args.control_url:
    parsed = urlparse(args.control_url)
    if parsed.scheme != "https" or not parsed.hostname or not parsed.hostname.endswith(".modal.run") or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise SystemExit("Use a standard private Modal HTTPS control URL.")
    save("MODAL_CONTROL_URL", args.control_url.rstrip("/"))

if bool(values.get("MODAL_PROXY_TOKEN_ID")) != bool(values.get("MODAL_PROXY_TOKEN_SECRET")):
    raise SystemExit("Both proxy token fields must be configured together.")
if not values.get("MODAL_PROXY_TOKEN_ID"):
    token = Workspace.from_context().proxy_tokens.create(name="modelledger-control")
    save("MODAL_PROXY_TOKEN_ID", token.token_id)
    save("MODAL_PROXY_TOKEN_SECRET", token.token_secret)
    print("Created a private worker proxy token and saved it locally.")

allowed = (
    "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "MODEL_CREDENTIAL_KEY_V1",
    "MODAL_PROXY_TOKEN_ID", "MODAL_PROXY_TOKEN_SECRET", "MODAL_CONTROL_URL",
    "MODELLEDGER_DEPLOY_GPU",
    "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME",
    "LLM_MODEL", "LLM_BASE_URL", "LLM_API_KEY", "NVIDIA_API_KEY", "OPENAI_API_KEY",
    "HINDSIGHT_API_KEY", "HINDSIGHT_BASE_URL",
)
payload = {key: values[key] for key in allowed if values.get(key)}
modal.Secret.objects.create("modelledger-worker", payload, allow_existing=True)
modal.Secret.from_name("modelledger-worker").update(payload)
print("Synchronized worker-only configuration to the modelledger-worker secret.")
