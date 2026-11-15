"use server";

import { redirect } from "next/navigation";
import { authClient, configured } from "../lib/db";

function notice(path: string, text: string): never {
  redirect(path + "?melding=" + encodeURIComponent(text));
}

const emailAddress = (form: FormData) => String(form.get("email") ?? "").trim().toLowerCase();
const validEmail = (email: string) => email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

function newPassword(form: FormData, path: string) {
  const password = String(form.get("password") ?? "");
  if (password.length < 8 || password.length > 72 || new TextEncoder().encode(password).length > 72) {
    notice(path, "Gebruik een wachtwoord van minstens 8 tekens en maximaal 72 bytes.");
  }
  if (password !== form.get("repeat")) notice(path, "De wachtwoorden komen niet overeen.");
  return password;
}

export async function register(form: FormData) {
  const email = emailAddress(form);
  const name = String(form.get("name") ?? "").trim();
  const password = newPassword(form, "/registreren");
  if (!name || name.length > 120 || !validEmail(email)) notice("/registreren", "Vul je naam en een geldig e-mailadres in.");
  if (!configured()) notice("/registreren", "Registratie is tijdelijk onbeschikbaar.");

  const auth = await authClient();
  const { error } = await auth.auth.signUp({ email, password, options: { data: { display_name: name } } });
  if (error?.status === 429) notice("/registreren", "Er zijn te veel mails aangevraagd. Probeer het straks opnieuw.");
  if (error && error.code !== "user_already_exists" && error.code !== "email_exists") {
    notice("/registreren", "Registratie lukte niet. Controleer je gegevens of probeer het later opnieuw.");
  }
  notice("/registreren", "Controleer je inbox. Bevestig je e-mailadres en wacht op goedkeuring door een beheerder.");
}

export async function loginWithPassword(form: FormData) {
  const email = emailAddress(form);
  const password = String(form.get("password") ?? "");
  if (!configured() || !validEmail(email) || !password || password.length > 72) notice("/", "Controleer je e-mailadres en wachtwoord.");
  const auth = await authClient();
  const { error } = await auth.auth.signInWithPassword({ email, password });
  if (error?.code === "email_not_confirmed") notice("/", "Bevestig eerst je e-mailadres via de mail die je kreeg.");
  if (error) notice("/", "Inloggen lukte niet. Controleer je e-mailadres en wachtwoord.");
  redirect("/");
}

export async function requestPasswordReset(form: FormData) {
  const email = emailAddress(form);
  if (configured() && validEmail(email)) {
    const auth = await authClient();
    const { error } = await auth.auth.resetPasswordForEmail(email);
    if (error?.status === 429) notice("/wachtwoord", "Wacht even voordat je een nieuwe mail aanvraagt.");
  }
  notice("/wachtwoord", "Als dit adres een account heeft, ontvang je een link om je wachtwoord in te stellen.");
}

export async function updatePassword(form: FormData) {
  if (!configured()) redirect("/");
  const auth = await authClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user?.email_confirmed_at) redirect("/");
  const password = newPassword(form, "/wachtwoord");
  const { error } = await auth.auth.updateUser({ password });
  if (error) notice("/wachtwoord", "Opslaan lukte niet. Log opnieuw in of vraag een nieuwe link aan.");
  notice("/", "Je wachtwoord is opgeslagen.");
}
