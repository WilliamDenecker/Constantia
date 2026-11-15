import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";
import { authClient, configured } from "../../../lib/db";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const flowId = request.nextUrl.searchParams.get("sb_flow_id");

  if (configured() && code) {
    const auth = await authClient();
    const { data, error } = await auth.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
    if (!error) redirect("redirectType" in data && data.redirectType === "recovery" ? "/wachtwoord" : "/");
  }

  redirect("/?melding=" + encodeURIComponent(
    "De inloglink kon niet worden bevestigd. Vraag een nieuwe link aan en open die in dezelfde browser.",
  ));
}
