import { NextResponse } from "next/server";
import { saveOnboarding, publicOperation } from "@/lib/deployment/service";
import { getDeploymentGuidance } from "@/lib/deployment/guidance";
export async function POST(request: Request) {
  try {
    if (Number(request.headers.get("content-length") || 0) > 5_000_000) return NextResponse.json({ error: "Upload model files directly through storage; this request is too large." }, { status: 413 });
    const operation = await saveOnboarding(await request.json());
    return NextResponse.json({ operation: publicOperation(operation), guidance: getDeploymentGuidance(operation) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Setup could not be saved." }, { status: 400 }); }
}
