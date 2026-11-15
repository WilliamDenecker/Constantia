import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const configured = () => Boolean(
  process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY && process.env.SUPABASE_SECRET_KEY,
);

export function database() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function authClient() {
  const jar = await cookies();
  return createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (values) => {
        try {
          for (const {name, value, options} of values) jar.set(name, value, options);
        } catch {
          // Server Components read refreshed cookies from the proxy.
        }
      },
    },
  });
}

export type Account = {
  user_id: string | null;
  email: string;
  player_id: string;
  active: boolean;
  role: "lid" | "superuser";
};
export type Player = { id: string; name: string; active: boolean };
export type Round = {
  round_id: string; played_on: string; opponent: string;
  status: "concept" | "open" | "gesloten"; deadline: string | null;
  has_voted: boolean; can_vote: boolean; turnout: number | null;
  electorate: number | null; candidates: Pick<Player, "id" | "name">[];
};

export async function identity(): Promise<{ account: Account | null; signedIn: boolean; pending?: boolean }> {
  if (!configured()) return { account: null, signedIn: false };
  const { data: { user } } = await (await authClient()).auth.getUser();
  if (!user) return { account: null, signedIn: false };
  if (!user.email_confirmed_at) return { account: null, signedIn: true };

  const db = database();
  const { data, error } = await db.from("accounts").select("*").eq("user_id", user.id).maybeSingle();
  if (error) throw new Error("De ledenlijst is tijdelijk onbereikbaar.");
  return { account: data?.active ? data as Account : null, signedIn: true, pending: !data };
}

export async function requireAccount(admin = false) {
  const { account } = await identity();
  if (!account || (admin && account.role !== "superuser")) redirect("/");
  return { ...account, user_id: account.user_id! };
}

export function checked<T>(response: { data: T; error: unknown }): NonNullable<T> {
  if (response.error || response.data == null) throw new Error("De gegevens zijn tijdelijk onbereikbaar.");
  return response.data;
}
