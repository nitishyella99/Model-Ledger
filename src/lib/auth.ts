import "server-only";
import { auth } from "@clerk/nextjs/server";

export async function requireUserId() {
  const { userId } = await auth();
  if (!userId) throw new Error("Sign in to continue.");
  return userId;
}
