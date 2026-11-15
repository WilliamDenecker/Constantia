import Link from "next/link";
import { loginWithPassword } from "./account-actions";
import { redirect } from "next/navigation";
import { login, vote } from "./actions";
import { AdminNav, Logout, Notice, deadlineLabel, shortDate } from "./ui";
import { checked, configured, database, identity, type Round } from "../lib/db";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ melding?: string; code?: string; sb_flow_id?: string; error_code?: string }> }) {
  const { melding, code, sb_flow_id, error_code } = await searchParams;
  if (typeof code === "string" && code) {
    const params = new URLSearchParams({ code });
    if (typeof sb_flow_id === "string" && sb_flow_id) params.set("sb_flow_id", sb_flow_id);
    redirect("/auth/callback?" + params.toString());
  }

  const notice = error_code === "otp_expired"
    ? "Deze inloglink is ongeldig of verlopen. Vraag een nieuwe link aan en open de meest recente mail."
    : melding;
  const { account, signedIn, pending } = await identity();
  const rounds = account ? checked(await database().rpc("round_overview", { actor: account.user_id })) as Round[] : [];

  return <>
    <section className="hero">
      <div>
        <p className="eyebrow">Constantia Heren 1</p>
        <h1>Jouw stem.<br /><em>Na de match.</em></h1>
        <p>Kies na elke wedstrijd je Man of the Match en Loser of the Match.</p>
      </div>
      <div className="pitch" aria-hidden><i /><b /><span /></div>
    </section>
    {account?.role === "superuser" && <AdminNav />}
    <Notice text={notice} />
    {!account ? <section className="panel narrow">
      <p className="eyebrow">Teamtoegang</p>
      <h2>{pending ? "Wacht op goedkeuring" : signedIn ? "Account heeft geen toegang" : "Log in om te stemmen"}</h2>
      {signedIn ? <>
        {pending && <p>Een beheerder moet je account nog aan een spelersprofiel koppelen.</p>}
        <Logout />
      </> : <>
        <form action={loginWithPassword} className="stack">
          <label>E-mailadres<input type="email" autoComplete="email" name="email" maxLength={254} required /></label>
          <label>Wachtwoord<input type="password" autoComplete="current-password" name="password" required /></label>
          <button disabled={!configured()}>Inloggen</button>
        </form>
        <p><Link href="/registreren">Account aanmaken</Link> · <Link href="/wachtwoord">Wachtwoord instellen of vergeten</Link></p>
        <details>
          <summary>Inloggen met een link</summary>
          <form action={login} className="stack">
            <label>E-mailadres<input type="email" autoComplete="email" name="email" maxLength={254} required /></label>
            <button disabled={!configured()}>Stuur een inloglink</button>
          </form>
        </details>
        {!configured() && <p className="muted">De aanmeldservice wordt ingesteld.</p>}
      </>}
    </section> : <>
      <div className="section-title"><h2>Jouw stemrondes</h2><Link href="/wachtwoord">Wachtwoord instellen</Link><Logout /></div>
      {rounds.filter(round => round.status !== "concept" && (round.can_vote || round.has_voted)).length === 0 &&
        <p className="panel">Er staan geen stemrondes voor je klaar.</p>}
      {rounds.filter(round => round.status !== "concept" && (round.can_vote || round.has_voted)).map(round =>
        <article className="panel" key={round.round_id}>
          <p className="eyebrow">{round.status === "open" ? "Open" : "Gesloten"} · {shortDate(round.played_on)}</p>
          <h3>Tegen {round.opponent}</h3>
          {round.has_voted ? <p className="notice">Je hebt gestemd.</p> : <>
            {round.deadline && <p>Stem vóór {deadlineLabel(round.deadline)}.</p>}
            <form action={vote} className="stack">
              <input type="hidden" name="round" value={round.round_id} />
              <div className="columns">
                {[["man", "Man of the Match"], ["loser", "Loser of the Match"]].map(([key, label]) =>
                  <label key={key}>{label}<select name={key} defaultValue="" required>
                    <option value="" disabled>Kies een speler</option>
                    {round.candidates.map(player => <option key={player.id} value={player.id}>{player.name}</option>)}
                  </select></label>)}
              </div>
              <button>Bevestig mijn stem</button>
            </form>
          </>}
        </article>)}
    </>}
  </>;
}
