import type { ArtifactFile, ModelSettings } from "./types";

export function manifestSignature(files: ArtifactFile[]) {
  return JSON.stringify([...files].sort((a,b)=>a.path.localeCompare(b.path)).map(file=>[file.path,file.size,file.modified ?? null]));
}
export function settingsSignature(settings: ModelSettings) {
  return JSON.stringify([settings.source,settings.repository,settings.revision,settings.endpoint,settings.model,settings.systemPrompt,settings.reuseTests,manifestSignature(settings.files)]);
}

export function validateArtifactPath(path: string) {
  return path.length <= 500 && !path.startsWith("/") && !path.includes("\\") && path.split("/").every(part => !!part && part !== "." && part !== "..") && !/[\x00-\x1f]/.test(path);
}
export function validateManifest(files: ArtifactFile[]): string | null {
  if (!files.length) return "Select your complete model folder.";
  if (files.length > 1000) return "This package has too many files. Select only your model files.";
  if (files.some(file => !validateArtifactPath(file.path) || !Number.isSafeInteger(file.size) || file.size <= 0)) return "The model contains an invalid path or empty file.";
  if (new Set(files.map(file => file.path)).size !== files.length) return "The package contains duplicate file paths.";
  if (!files.some(file => file.path === "config.json")) return "Add config.json to the model folder.";
  if (!files.some(file => ["tokenizer.json", "tokenizer.model"].includes(file.path))) return "Add tokenizer.json or tokenizer.model to the model folder.";
  if (!files.some(file => file.path.endsWith(".safetensors"))) return "Add the complete Safetensors model weights.";
  if (files.some(file => /\.(py|pkl|pickle|bin|pt|pth|zip|exe|sh)$/i.test(file.path))) return "Use a Safetensors model folder without executable code, pickle weights, or archives.";
  return null;
}
export function validateModelConfig(config: Record<string, unknown>): string | null {
  if (!["llama", "mistral", "qwen2"].includes(String(config.model_type))) return "This runtime supports Llama, Mistral, and Qwen2 text-generation models.";
  if (config.auto_map || config.quantization_config) return "Custom model code and quantized packages are not supported by this serving profile.";
  if(Array.isArray(config.architectures) && config.architectures.some(name=>!["LlamaForCausalLM","MistralForCausalLM","Qwen2ForCausalLM"].includes(String(name))))return "Use a supported causal text-generation architecture.";
  return null;
}
