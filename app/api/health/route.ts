import { createHash, timingSafeEqual } from "node:crypto";
import { configured, database } from "../../../lib/db";

export const dynamic = "force-dynamic";
const digest = (value: string) => createHash("sha256").update(value).digest();

export async function GET(request: Request) {
  const token = process.env.HEALTH_TOKEN;
  const authorization = request.headers.get("authorization") ?? "";
  const headers = { "Cache-Control": "no-store" };
  if (!token || !timingSafeEqual(digest(authorization), digest("Bearer " + token))) {
    return Response.json({ status: "unauthorized" }, { status: 401, headers });
  }
  const result = configured() ? await database().from("players").select("id").limit(1) : null;
  const ok = Boolean(result && !result.error);
  return Response.json({ status: ok ? "ok" : "unavailable" }, { status: ok ? 200 : 503, headers });
}
