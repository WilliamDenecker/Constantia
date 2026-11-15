"use server";
import { redirect } from "next/navigation";
import { Temporal } from "@js-temporal/polyfill";
import { authClient, configured, database, requireAccount } from "../lib/db";

const value = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
function message(path: string, note: string): never {
  redirect(path + "?melding=" + encodeURIComponent(note));
}

export async function login(form: FormData) {
  if (!configured()) message("/", "De verbinding met Supabase is nog niet ingesteld.");
  const email = value(form, "email").toLowerCase();
  if (email.length <= 254 && /^[^ @]+@[^ @]+\.[^ @]+$/.test(email)) {
    await (await authClient()).auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  }
  message("/", "Als je account is uitgenodigd, ontvang je een e-mail met een inloglink.");
}

export async function signOut() {
  if (configured()) await (await authClient()).auth.signOut({ scope: "local" });
  redirect("/");
}

export async function confirmToken(form: FormData) {
  const token_hash = value(form, "token");
  const type = value(form, "type");
  if (!configured() || !/^[a-zA-Z0-9_-]{20,256}$/.test(token_hash) || (type !== "invite" && type !== "email")) {
    message("/", "Deze inloglink is ongeldig.");
  }
  const auth = await authClient();
  const { data, error } = await auth.auth.verifyOtp({ token_hash, type });
  if (error || !data.user?.email_confirmed_at) message("/", "Deze inloglink is ongeldig of verlopen. Vraag een nieuwe link aan.");
  redirect("/");
}

export async function vote(form: FormData) {
  const { user_id } = await requireAccount();
  const man = value(form, "man");
  const loser = value(form, "loser");
  if (!man || !loser || man === loser) message("/", "Kies twee verschillende spelers.");
  const { error } = await database().rpc("cast_ballot", {
    actor: user_id, target: value(form, "round"), man_choice: man, loser_choice: loser,
  });
  if (error?.code === "23505") message("/", "Je hebt al gestemd voor deze ronde.");
  if (error?.code === "P0001") message("/", error.message);
  message("/", error ? "Je stem kon niet worden opgeslagen. Controleer beide keuzes." : "Je stem is opgeslagen.");
}

export async function createMatch(form: FormData) {
  const { user_id } = await requireAccount(true);
  const { error } = await database().rpc("create_match", {
    actor: user_id, match_date: value(form, "date"), match_opponent: value(form, "opponent"),
  });
  message("/beheer", error ? "Wedstrijd kon niet worden aangemaakt. Controleer datum en tegenstander." : "Wedstrijd aangemaakt als concept.");
}

function parseDeadline(form: FormData): string | null {
  const deadline = value(form, "deadline");
  if (!deadline) return null;
  try {
    return Temporal.PlainDateTime.from(deadline)
      .toZonedDateTime("Europe/Brussels", { disambiguation: "reject" }).toInstant().toString();
  } catch {
    message("/beheer", "Kies een geldig tijdstip in de Belgische tijdzone.");
  }
}

export async function openRound(form: FormData) {
  const { user_id } = await requireAccount(true);
  const closes = parseDeadline(form);
  const { error } = await database().rpc("open_round", {
    actor: user_id, target: value(form, "round"), chosen: form.getAll("candidates"), voters: form.getAll("voters"), closes,
  });
  message("/beheer", error?.code === "P0001" ? error.message : error ? "Ronde kon niet worden geopend." : "Stemronde geopend.");
}

export async function setDeadline(form: FormData) {
  const { user_id } = await requireAccount(true);
  const { error } = await database().rpc("set_round_deadline", {
    actor: user_id, target: value(form, "round"), closes: parseDeadline(form),
  });
  message("/beheer", error?.code === "P0001" ? error.message : error ? "Deadline kon niet worden opgeslagen." : "Deadline opgeslagen.");
}

export async function closeRound(form: FormData) {
  const { user_id } = await requireAccount(true);
  const { error } = await database().rpc("close_round", { actor: user_id, target: value(form, "round") });
  message("/beheer", error ? "Ronde kon niet worden gesloten." : "Stemronde gesloten.");
}

export async function savePlayer(form: FormData) {
  await requireAccount(true);
  const id = value(form, "player");
  const name = value(form, "name");
  const db = database();
  const { error } = id
    ? await db.from("players").update({ name, active: form.get("active") === "on" }).eq("id", id)
    : await db.from("players").insert({ name });
  message("/beheer", error ? "Speler kon niet worden opgeslagen. Controleer de naam." : "Speler opgeslagen.");
}

export async function deactivate(form: FormData) {
  const admin = await requireAccount(true);
  const email = value(form, "email");
  const { error } = await database().from("accounts").update({ active: false })
    .eq("email", email).eq("role", "lid").neq("email", admin.email);
  message("/beheer", error ? "Lid kon niet worden gedeactiveerd." : "Lid gedeactiveerd.");
}

export async function invite(form: FormData) {
  await requireAccount(true);
  const email = value(form, "email").toLowerCase();
  const player_id = value(form, "player");
  if (email.length > 254 || !/^[^ @]+@[^ @]+\.[^ @]+$/.test(email)) message("/beheer", "Vul een geldig e-mailadres in.");
  const db = database();
  const player = await db.from("players").select("id,initial_superuser").eq("id", player_id).eq("active", true).maybeSingle();
  if (!player.data) message("/beheer", "Kies een actief spelersprofiel.");
  const reserved = await db.from("accounts").upsert({ email, player_id, role: player.data.initial_superuser ? "superuser" : "lid" }, { onConflict: "email", ignoreDuplicates: true });
  if (reserved.error) message("/beheer", "Dit spelersprofiel is al gekoppeld of de uitnodiging kon niet worden voorbereid.");
  const existing = await db.from("accounts").select("*").eq("email", email).single();
  if (!existing.data || existing.data.player_id !== player_id || !existing.data.active || existing.data.user_id) {
    message("/beheer", "Dit account is al gekoppeld of gedeactiveerd.");
  }
  const { data, error } = await db.auth.admin.inviteUserByEmail(email);
  if (error || !data.user) message("/beheer", "De uitnodiging kon niet worden verzonden. Controleer de e-mailconfiguratie en probeer opnieuw.");
  message("/beheer", "Uitnodiging verzonden.");
}
