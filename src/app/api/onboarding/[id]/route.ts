import { NextResponse } from "next/server";
import { cancelOperation, completeModelUpload, deleteUploadedModel, deploymentAdmin, getUploadContext, ownedOperation, queueOperation, publicOperation } from "@/lib/deployment/service";
import { getDeploymentGuidance } from "@/lib/deployment/guidance";
type Context = { params: Promise<{ id: string }> };
export async function DELETE(_request: Request, context: Context) {
  try {
    await deleteUploadedModel((await context.params).id);
    return NextResponse.json({ deleted: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Model could not be deleted." }, { status: 400 });
  }
}
export async function GET(_request: Request, context: Context) {
  try {
    const operation = await ownedOperation((await context.params).id);
    return NextResponse.json({ operation: publicOperation(operation), guidance: getDeploymentGuidance(operation) }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "Setup not found." }, { status: 404 }); }
}
export async function POST(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const { action } = await request.json();
    const operation = await ownedOperation(id);
    if (action === "upload") return NextResponse.json(await getUploadContext(id));
    if (action === "start") await queueOperation(id);
    else if (action === "complete-upload") await completeModelUpload(id);
    else if (action === "cancel") await cancelOperation(id);
    else if (action === "review") {
      if (operation.stage !== "ready") throw new Error("The report is not ready yet.");
      await deploymentAdmin().from("model_onboarding").update({ reviewed_at: new Date().toISOString() }).eq("id", id).eq("owner_user_id", operation.owner_user_id);
    } else throw new Error("Unknown setup action.");
    const next = await ownedOperation(id);
    return NextResponse.json({ operation: publicOperation(next), guidance: getDeploymentGuidance(next) });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Action could not complete." }, { status: 400 }); }
}
