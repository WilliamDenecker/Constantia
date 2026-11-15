import { Temporal } from "@js-temporal/polyfill";
import { checked, database, requireAccount, type Account, type Player, type Round } from "../../lib/db";
import { approveRegistration, changeMemberAccess, closeRound, createMatch, invite, openRound, savePlayer, setDeadline } from "../actions";
import { AdminNav, Notice, deadlineLabel, shortDate } from "../ui";

export const dynamic = "force-dynamic";

export default async function Beheer({ searchParams }: { searchParams: Promise<{ melding?: string }> }) {
  const admin = await requireAccount(true);
  const { melding } = await searchParams;
  const db = database();
  const [playerResult, accountResult, roundResult, pendingResult] = await Promise.all([
    db.from("players").select("*").order("name"),
    db.from("accounts").select("*").order("email"),
    db.rpc("round_overview", { actor: admin.user_id }),
    db.rpc("pending_registrations", { actor: admin.user_id }),
  ]);
  const players = checked(playerResult) as Player[];
  const accounts = checked(accountResult) as Account[];
  const pending = checked(pendingResult) as { user_id: string; email: string; display_name: string | null }[];
  const rounds = checked(roundResult) as Round[];
  const playerNames = new Map(players.map(p => [p.id, p.name]));
  const playerAccounts = new Set(accounts.map(a => a.player_id));
  const availablePlayers = players.filter(p => p.active && !playerAccounts.has(p.id));

  return <>
    <AdminNav />
    <h1>Beheer</h1>
    <Notice text={melding} />
    <section className="panel">
      <h2>Wedstrijden en stemrondes</h2>
      <form action={createMatch} className="stack">
        <div className="columns">
          <label>Wedstrijddatum<input type="date" name="date" required /></label>
          <label>Tegenstander<input name="opponent" maxLength={120} required /></label>
        </div>
        <button>Wedstrijd aanmaken</button>
      </form>
      {rounds.map(round => <details key={round.round_id}>
        <summary>{shortDate(round.played_on)} · {round.opponent} <span className="tag">{round.status}</span></summary>
        {round.status === "concept" && <form action={openRound} className="stack">
          <input type="hidden" name="round" value={round.round_id} />
          <div className="columns">
            <fieldset><legend>Kandidaten</legend>
              {players.filter(p => p.active).map(p => <label className="check" key={p.id}><input type="checkbox" name="candidates" value={p.id} />{p.name}</label>)}
            </fieldset>
            <fieldset><legend>Stemgerechtigde leden</legend>
              {accounts.filter(a => a.active && a.user_id).map(a => <label className="check" key={a.email}>
                <input type="checkbox" name="voters" value={a.user_id!} />{playerNames.get(a.player_id)}
              </label>)}
            </fieldset>
          </div>
          <label>Sluitingsdeadline (optioneel, Belgische tijd)<input type="datetime-local" name="deadline" /></label>
          <button>Stemronde openen</button>
        </form>}
        {round.status !== "concept" && <p>{round.turnout} van {round.electorate} leden hebben gestemd.</p>}
        {round.status === "open" && <>
          {round.deadline && <p>Sluit automatisch op {deadlineLabel(round.deadline)}.</p>}
          <form action={setDeadline} className="stack">
            <input type="hidden" name="round" value={round.round_id} />
            <label>Sluitingsdeadline (Belgische tijd, leeg voor handmatig sluiten)
              <input type="datetime-local" name="deadline" defaultValue={round.deadline ?
                Temporal.Instant.from(round.deadline).toZonedDateTimeISO("Europe/Brussels").toPlainDateTime().toString({ smallestUnit: "minute" }) : ""} />
            </label>
            <button className="secondary">Deadline opslaan</button>
          </form>
          <form action={closeRound}><input type="hidden" name="round" value={round.round_id} /><button className="secondary">Stemronde sluiten</button></form>
        </>}
      </details>)}
    </section>
    <section className="panel">
      <h2>Leden</h2>
      <p>Registratielink <a href="/registreren">constantia-heren-1.vercel.app/registreren</a></p>
      {pending.length > 0 && <h3>Registraties ter goedkeuring</h3>}
      {pending.map(request => <details key={request.user_id}>
        <summary>{request.display_name || request.email}</summary>
        <p className="wrap">{request.email}</p>
        <form action={approveRegistration} className="stack">
          <input type="hidden" name="user" value={request.user_id} />
          <label>Spelersprofiel<select name="player" defaultValue={availablePlayers.find(p =>
            p.name.toLowerCase() === request.display_name?.toLowerCase())?.id ?? ""}>
            <option value="">Nieuw spelersprofiel maken</option>
            {availablePlayers.map(p => <option value={p.id} key={p.id}>{p.name}</option>)}
          </select></label>
          <label>Naam voor een nieuw spelersprofiel<input name="name" defaultValue={request.display_name ?? ""} maxLength={120} /></label>
          <button>Lid goedkeuren</button>
        </form>
      </details>)}
      <details>
        <summary>Lid rechtstreeks uitnodigen</summary>
      <form action={invite} className="stack">
        <div className="columns">
          <label>E-mailadres<input name="email" type="email" maxLength={254} required /></label>
          <label>Spelersprofiel<select name="player" defaultValue="" required>
            <option value="" disabled>Kies een speler</option>
            {availablePlayers.map(p => <option value={p.id} key={p.id}>{p.name}</option>)}
          </select></label>
        </div>
        <button>Uitnodiging versturen</button>
      </form>
      </details>
      {accounts.map(a => <details key={a.email}><summary>{playerNames.get(a.player_id)} <span className="tag">{a.active ? (a.user_id ? (a.role === "superuser" ? "Beheerder" : "Lid") : "Uitgenodigd") : "Gedeactiveerd"}</span></summary>
        <p className="wrap">{a.email}</p>
        {a.active && !a.user_id && <form action={invite}>
          <input type="hidden" name="email" value={a.email} /><input type="hidden" name="player" value={a.player_id} />
          <button className="secondary">Uitnodiging opnieuw versturen</button>
        </form>}
        {a.user_id !== admin.user_id && <form action={changeMemberAccess} className="stack">
          <input type="hidden" name="email" value={a.email} />
          {a.active && a.user_id && <button className="secondary" name="change" value={a.role === "lid" ? "superuser" : "lid"}>
            {a.role === "lid" ? "Beheerder maken" : "Beheerdersrol intrekken"}
          </button>}
          <button className="secondary" name="change" value={a.active ? "deactivate" : "activate"}>
            {a.active ? "Toegang intrekken" : "Toegang herstellen"}
          </button>
        </form>}
      </details>)}
    </section>
    <section className="panel">
      <h2>Spelers</h2>
      <form action={savePlayer} className="stack">
        <label>Naam nieuwe speler<input name="name" maxLength={120} required /></label>
        <button>Speler toevoegen</button>
      </form>
      {players.map(player => <details key={player.id}>
        <summary>{player.name}{!player.active && <span className="tag">Inactief</span>}</summary>
        <form action={savePlayer} className="stack">
          <input type="hidden" name="player" value={player.id} />
          <label>Naam<input name="name" defaultValue={player.name} maxLength={120} required /></label>
          <label className="check"><input type="checkbox" name="active" defaultChecked={player.active} />Actief als kandidaat</label>
          <button className="secondary">Speler opslaan</button>
        </form>
      </details>)}
    </section>
  </>;
}
