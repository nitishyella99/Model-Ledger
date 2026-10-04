import { NextResponse } from "next/server";
import { z } from "zod";
import { ownedOperation } from "@/lib/deployment/service";
import { artifactKey } from "@/lib/deployment/r2-upload-policy";
import { multipartUpload } from "@/lib/deployment/r2";

const schema = z.object({ action: z.enum(["begin", "resume", "part", "finish"]), path: z.string().max(500), token: z.string().max(250000).optional(), part: z.number().int().positive().max(10000).optional() });
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const op = await ownedOperation((await context.params).id);
    const input = schema.parse(await request.json());
    const file = op.settings.files.find(file => file.path === input.path);
    if (!file) throw new Error("File is not part of this model folder.");
    return NextResponse.json(await multipartUpload(op, artifactKey(op.owner_user_id, op.id, file.path), file.size, input), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Upload could not complete." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
