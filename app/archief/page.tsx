import { checked, database, requireAccount } from "../../lib/db";
import { AdminNav, shortDate } from "../ui";

export const dynamic = "force-dynamic";
type Result = { category: string; display_name: string; votes: number | null; rank: number | null; excel_code: number | null };
type Match = { id: string; played_on: string; opponent: string; source: string; rounds: { status: string } | null; results: Result[] };

export default async function Archive() {
  await requireAccount(true);
  const db = database();
  const matches = checked(await db.from("matches").select("id,played_on,opponent,source,rounds(status),results(category,display_name,votes,rank,excel_code)")
    .order("played_on", { ascending: false })) as unknown as Match[];
  const archive = matches.filter(match => match.source === "excel" || match.rounds?.status === "gesloten");
  return <>
    <AdminNav />
    <h1>Resultatenarchief</h1>
    {archive.length === 0 && <p className="panel">Er zijn nog geen uitslagen.</p>}
    {archive.map(match => <article className="panel" key={match.id}>
      <p className="eyebrow">{shortDate(match.played_on)} · {match.source === "excel" ? "Historisch · Excel-import" : "Gesloten"}</p>
      <h2>Tegen {match.opponent}</h2>
      <div className="columns">
        {[["man", "Man of the Match"], ["loser", "Loser of the Match"]].map(([category, label]) => {
          const entries = match.results.filter(result => result.category === category).sort((a, b) =>
            (b.votes ?? b.excel_code ?? 0) - (a.votes ?? a.excel_code ?? 0) || a.display_name.localeCompare(b.display_name, "nl-BE"));
          const tied = entries.filter(entry => entry.rank === 1).length > 1;
          return <section key={category}><h3>{label}</h3>
            {match.source === "live" && !entries.some(entry => (entry.votes ?? 0) > 0) && <p>Nul stemmen.</p>}
            {match.source === "excel" && entries.length === 0 && <p>Geen historische vermeldingen.</p>}
            {entries.length > 0 && <ul className="ranks">{entries.map(entry => <li key={entry.display_name}>
              <span>{entry.rank === null ? "" : entry.rank === 1 && tied ? "Gedeeld 1 · " : entry.rank + " · "}{entry.display_name}</span>
              <strong>{entry.excel_code === 3 ? "Verkozen" : entry.excel_code === 1 ? "Top 3" : entry.votes}</strong>
            </li>)}</ul>}
          </section>;
        })}
      </div>
    </article>)}
  </>;
}
