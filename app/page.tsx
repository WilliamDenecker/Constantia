import { login, vote } from "./actions";
import { AdminNav, Logout, Notice, deadlineLabel, shortDate } from "./ui";
import { checked, configured, database, identity, type Round } from "../lib/db";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ melding?: string }> }) {
  const { melding } = await searchParams;
  const { account, signedIn } = await identity();
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
    <Notice text={melding} />
    {!account ? <section className="panel narrow">
      <p className="eyebrow">Teamtoegang</p>
      <h2>{signedIn ? "Account heeft geen toegang" : "Log in om te stemmen"}</h2>
      {signedIn ? <Logout /> : <>
        <p>Gebruik het e-mailadres waarop je voor het team bent uitgenodigd.</p>
        <form action={login} className="stack">
          <label>E-mailadres<input type="email" autoComplete="email" name="email" placeholder="naam@voorbeeld.be" maxLength={254} required /></label>
          <button disabled={!configured()}>Stuur een inloglink</button>
        </form>
        {!configured() && <p className="muted">De aanmeldservice wordt ingesteld.</p>}
      </>}
    </section> : <>
      <div className="section-title"><h2>Jouw stemrondes</h2><Logout /></div>
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
