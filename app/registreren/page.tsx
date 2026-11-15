import Link from "next/link";
import { register } from "../account-actions";
import { Notice } from "../ui";

export default async function Register({ searchParams }: { searchParams: Promise<{ melding?: string }> }) {
  const { melding } = await searchParams;
  return <section className="panel narrow">
    <h1>Account aanmaken</h1>
    <p>Bevestig je e-mailadres. Een beheerder koppelt daarna je account aan een spelersprofiel.</p>
    <Notice text={melding} />
    <form action={register} className="stack">
      <label>Voor- en achternaam<input name="name" autoComplete="name" maxLength={120} required /></label>
      <label>E-mailadres<input name="email" type="email" autoComplete="email" maxLength={254} required /></label>
      <label>Wachtwoord<input name="password" type="password" autoComplete="new-password" minLength={8} maxLength={72} required /></label>
      <label>Herhaal je wachtwoord<input name="repeat" type="password" autoComplete="new-password" minLength={8} maxLength={72} required /></label>
      <button>Account aanmaken</button>
    </form>
    <p><Link href="/">Terug naar inloggen</Link></p>
  </section>;
}
