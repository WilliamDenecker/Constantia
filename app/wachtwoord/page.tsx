import Link from "next/link";
import { requestPasswordReset, updatePassword } from "../account-actions";
import { Notice } from "../ui";
import { authClient, configured } from "../../lib/db";

export default async function Password({ searchParams }: { searchParams: Promise<{ melding?: string }> }) {
  const { melding } = await searchParams;
  const user = configured() ? (await (await authClient()).auth.getUser()).data.user : null;
  return <section className="panel narrow">
    <h1>Wachtwoord instellen</h1>
    <Notice text={melding} />
    {user?.email_confirmed_at ? <form action={updatePassword} className="stack">
      <label>Nieuw wachtwoord<input name="password" type="password" autoComplete="new-password" minLength={8} maxLength={72} required /></label>
      <label>Herhaal je wachtwoord<input name="repeat" type="password" autoComplete="new-password" minLength={8} maxLength={72} required /></label>
      <button>Wachtwoord opslaan</button>
    </form> : <form action={requestPasswordReset} className="stack">
      <label>E-mailadres<input name="email" type="email" autoComplete="email" maxLength={254} required /></label>
      <button>Stuur een wachtwoordlink</button>
    </form>}
    <p><Link href="/">Terug naar inloggen</Link></p>
  </section>;
}
