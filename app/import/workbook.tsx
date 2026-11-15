"use client";

import type { CellValue, Worksheet, Workbook } from "exceljs";
import { useRef, useState } from "react";
import { dateKey, exactPlayer, excelCode, type Cell, type HistoricalGame, type PlayerOption } from "../../lib/history";
import { importHistory } from "./actions";

type PreviewRow = {
  ref: string; source: string; date: string; opponent: string; player: string;
  man: string; loser: string; manRaw: string; loserRaw: string; omit: boolean;
};
type Mapping = { sheet: string; start: string; end: string; player: string; man: string; loser: string; date: string; opponent: string };
const emptyMapping = { sheet: "", start: "2", end: "", player: "A", date: "B", opponent: "C", man: "D", loser: "E" };
const columns = [
  ["player", "Spelersnaam", "A"], ["man", "Man of the Match", "D"], ["loser", "Loser of the Match", "E"],
] as const;

function cellValue(value: CellValue): Cell {
  if (value instanceof Date || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (!value) return null;
  if ("result" in value) return value.result === undefined ? "Formule zonder resultaat" : cellValue(value.result);
  if ("formula" in value || "sharedFormula" in value) return "Formule zonder resultaat";
  if ("richText" in value) return value.richText.map(part => part.text).join("");
  if ("text" in value) return value.text;
  if ("error" in value) return value.error;
  return "Onbekende celwaarde";
}

function columnNumber(value: string) {
  const name = value.trim().toUpperCase();
  if (!/^[A-Z]{1,3}$/.test(name)) return 0;
  const column = [...name].reduce((n, letter) => n * 26 + letter.charCodeAt(0) - 64, 0);
  return column <= 16384 ? column : 0;
}

const raw = (value: Cell) => value === null ? "" : String(value);
const asCode = (value: Cell) => { const code = excelCode(value); return code === null ? "" : String(code); };

export default function ImportWorkbook({ players }: { players: PlayerOption[] }) {
  const workbook = useRef<Workbook | null>(null);
  const [sheets, setSheets] = useState<{ name: string; count: number }[]>([]);
  const [map, setMap] = useState<Mapping>(emptyMapping);
  const [fixed, setFixed] = useState(false);
  const [date, setDate] = useState("");
  const [opponent, setOpponent] = useState("");
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [, refreshSheet] = useState(0);

  function updateMap(key: keyof Mapping, value: string) {
    setMap(current => ({ ...current, [key]: value }));
  }

  async function load(file?: File) {
    if (!file) return;
    setBusy(true);
    setNotice("");
    setSheets([]);
    setRows([]);
    setConfirmed(false);
    workbook.current = null;
    try {
      if (!file.name.toLowerCase().endsWith(".xlsx") || file.size > 4 * 1024 * 1024) {
        setNotice("Kies een .xlsx-bestand van maximaal 4 MB.");
        return;
      }
      const ExcelJS = await import("exceljs");
      const book = new ExcelJS.Workbook();
      await book.xlsx.load(await file.arrayBuffer());
      const items = book.worksheets.filter(sheet => sheet.rowCount > 0).map(sheet => ({ name: sheet.name, count: sheet.rowCount }));
      workbook.current = book;
      setSheets(items);
      setMap({ ...emptyMapping, sheet: items[0]?.name ?? "", end: String(items[0]?.count ?? "") });
      refreshSheet(n => n + 1);
      if (!items.length) setNotice("Het werkboek bevat geen ingevulde werkbladen.");
    } catch {
      setNotice("Het Excel-bestand kon niet worden geopend.");
    } finally {
      setBusy(false);
    }
  }

  function buildPreview() {
    const sheet = workbook.current?.getWorksheet(map.sheet);
    if (!sheet) return;
    const start = Number(map.start);
    const end = Number(map.end);
    const fields = [map.player, map.man, map.loser, ...(!fixed ? [map.date, map.opponent] : [])].map(columnNumber);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start ||
        end > sheet.rowCount || end - start > 999 || fields.includes(0) || new Set(fields).size !== fields.length) {
      setNotice("Kies verschillende kolommen en een geldig bereik van maximaal 1.000 rijen.");
      return;
    }
    const [nameColumn, manColumn, loserColumn, dateColumn, opponentColumn] = fields;
    const found: PreviewRow[] = [];
    for (let row = start; row <= end; row++) {
      const read = (column: number) => cellValue(sheet.getRow(row).getCell(column).value);
      const source = raw(read(nameColumn)).trim();
      const man = read(manColumn);
      const loser = read(loserColumn);
      if (!source && excelCode(man) === 0 && excelCode(loser) === 0) continue;
      found.push({
        ref: `${sheet.id}:${row}:${fields.join("-")}:${fixed ? date + opponent : ""}`,
        source, player: exactPlayer(source, players), omit: false,
        date: fixed ? date : dateKey(read(dateColumn), workbook.current?.properties.date1904),
        opponent: (fixed ? opponent : raw(read(opponentColumn))).trim(),
        man: asCode(man), loser: asCode(loser), manRaw: raw(man), loserRaw: raw(loser),
      });
    }
    setRows(current => [...current.filter(previous => !found.some(row => row.ref === previous.ref)), ...found]);
    setConfirmed(false);
    setNotice(found.length ? `${found.length} rijen toegevoegd aan de preview.` : "In dit bereik zijn geen relevante rijen gevonden.");
  }

  function updateRow(ref: string, change: Partial<PreviewRow>) {
    setRows(current => current.map(row => row.ref === ref ? { ...row, ...change } : row));
    setConfirmed(false);
  }

  function makeGames(): HistoricalGame[] {
    const games = new Map<string, HistoricalGame>();
    for (const row of rows.filter(row => !row.omit)) {
      const opponent = row.opponent.trim();
      if (!row.date || !opponent || !row.man || !row.loser || ((row.man !== "0" || row.loser !== "0") && !row.player)) {
        throw new Error("Vul ontbrekende wedstrijdgegevens en koppelingen in en beoordeel de onverwachte waarden.");
      }
      const key = row.date + ":" + opponent.toLowerCase();
      const game = games.get(key) ?? { date: row.date, opponent, entries: [] };
      for (const [category, code] of [["man", row.man], ["loser", row.loser]] as const) {
        if (code === "0") continue;
        const existing = game.entries.find(entry => entry.player === row.player && entry.category === category);
        if (existing && existing.code !== Number(code)) throw new Error("Twee rijen geven een andere code voor dezelfde speler, wedstrijd en categorie.");
        if (!existing) game.entries.push({ player: row.player, category, code: code === "3" ? 3 : 1 });
      }
      games.set(key, game);
    }
    return [...games.values()].sort((a, b) => a.date.localeCompare(b.date) || a.opponent.localeCompare(b.opponent));
  }

  async function save() {
    setBusy(true);
    try {
      const result = await importHistory(makeGames());
      setNotice(result.error ?? `${result.count} historische wedstrijden opgeslagen of bijgewerkt.`);
      setConfirmed(false);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "De import kon niet worden opgeslagen.");
    } finally {
      setBusy(false);
    }
  }

  const sheet = workbook.current?.getWorksheet(map.sheet);
  let games: HistoricalGame[] = [];
  let issue = "";
  if (rows.length) {
    try { games = makeGames(); }
    catch (error) { issue = (error as Error).message; }
  }
  const names = new Map(players.map(player => [player.id, player.name]));
  return <>
    <section className="panel stack">
      <h2>Werkboek en kolommen</h2>
      <p>Kies een werkblad en wijs de kolommen met spelers en uitslagcodes toe. Voor een wedstrijd die over vaste kolommen is verdeeld, voeg je elk kolompaar afzonderlijk toe aan de preview.</p>
      <label>Excel-bestand<input type="file" accept=".xlsx" disabled={busy} onChange={event => void load(event.target.files?.[0])} /></label>
      {sheets.length > 0 && <>
        <label>Werkblad<select value={map.sheet} onChange={event => {
          const selected = sheets.find(item => item.name === event.target.value);
          setMap(current => ({ ...current, sheet: event.target.value, end: String(selected?.count ?? "") }));
        }}>{sheets.map(item => <option key={item.name}>{item.name}</option>)}</select></label>
        {sheet && <Sample sheet={sheet} />}
        <div className="columns">
          <label>Eerste rij<input type="number" min="1" value={map.start} onChange={event => updateMap("start", event.target.value)} /></label>
          <label>Laatste rij<input type="number" min="1" value={map.end} onChange={event => updateMap("end", event.target.value)} /></label>
        </div>
        <label className="check"><input type="checkbox" checked={fixed} onChange={event => setFixed(event.target.checked)} />Vaste datum en tegenstander voor dit bereik</label>
        <div className="columns">
          {fixed ? <>
            <label>Wedstrijddatum<input type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
            <label>Tegenstander<input value={opponent} onChange={event => setOpponent(event.target.value)} /></label>
          </> : <>
            <label>Kolom wedstrijddatum<input value={map.date} onChange={event => updateMap("date", event.target.value)} /></label>
            <label>Kolom tegenstander<input value={map.opponent} onChange={event => updateMap("opponent", event.target.value)} /></label>
          </>}
        </div>
        <div className="columns">
          {columns.map(([key, label]) => <label key={key}>Kolom {label}<input value={map[key]} onChange={event => updateMap(key, event.target.value)} /></label>)}
        </div>
        <button type="button" disabled={busy} onClick={buildPreview}>Toevoegen aan preview</button>
      </>}
    </section>
    {notice && <p className="notice" role="status">{notice}</p>}
    {rows.length > 0 && <section className="panel stack">
      <div className="section-title"><h2>Preview</h2><button className="secondary" disabled={busy} onClick={() => { setRows([]); setConfirmed(false); }}>Preview wissen</button></div>
      {issue && <p className="notice" role="status">{issue}</p>}
      <details>
        <summary>Rijen controleren en koppelen</summary>
        {rows.map(row => <div className="import-row" key={row.ref}>
          <strong>{row.source || "Spelersnaam ontbreekt"} · rij {row.ref.split(":")[1]}</strong>
          {!row.player && <p className="muted">Geen automatische koppeling.</p>}
          <div className="columns">
            <label>Speler<select value={row.player} onChange={event => updateRow(row.ref, { player: event.target.value })}>
              <option value="">Kies een speler</option>
              {players.map(player => <option key={player.id} value={player.id}>{player.name}</option>)}
            </select></label>
            <label>Datum<input type="date" value={row.date} onChange={event => updateRow(row.ref, { date: event.target.value })} /></label>
            <label>Tegenstander<input value={row.opponent} onChange={event => updateRow(row.ref, { opponent: event.target.value })} /></label>
          </div>
          <div className="columns">
            {([["man", "Man of the Match", row.manRaw], ["loser", "Loser of the Match", row.loserRaw]] as const).map(([key, label, original]) =>
              <label key={key}>{label}{row[key] === "" && ` · onverwacht: ${original || "leeg"}`}
                <select value={row[key]} onChange={event => updateRow(row.ref, { [key]: event.target.value })}>
                  <option value="" disabled>Beoordeel waarde</option><option value="0">Geen vermelding</option><option value="1">Top 3</option><option value="3">Verkozen</option>
                </select>
              </label>)}
          </div>
          <label className="check"><input type="checkbox" checked={row.omit} onChange={event => updateRow(row.ref, { omit: event.target.checked })} />Rij overslaan</label>
        </div>)}
      </details>
      {games.map(game => <div className="import-row" key={game.date + game.opponent}>
        <strong>{game.date} · {game.opponent}</strong>
        {game.entries.length ? <ul>{game.entries.map(entry => <li key={entry.player + entry.category}>
          {entry.category === "man" ? "Man of the Match" : "Loser of the Match"} · {names.get(entry.player)} · {entry.code === 3 ? "Verkozen" : "Top 3"}
        </li>)}</ul> : <p>Geen vermeldingen.</p>}
      </div>)}
      <label className="check"><input type="checkbox" disabled={Boolean(issue) || busy || !games.length} checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />Ik heb de wedstrijden en uitslagen gecontroleerd.</label>
      <button disabled={!confirmed || busy || !games.length} onClick={() => void save()}>Historische uitslagen opslaan</button>
    </section>}
  </>;
}

function Sample({ sheet }: { sheet: Worksheet }) {
  const rows = Array.from({ length: Math.min(6, sheet.rowCount) }, (_, index) => index + 1);
  const columnCount = Math.min(20, sheet.columnCount, 26);
  const columns = Array.from({ length: columnCount }, (_, index) => index + 1);
  return <details><summary>Bekijk de eerste rijen van het werkblad</summary>
    <div className="table-scroll"><table>
      <thead><tr><th scope="col">Rij</th>{columns.map(column => <th scope="col" key={column}>{String.fromCharCode(64 + column)}</th>)}</tr></thead>
      <tbody>{rows.map(row => <tr key={row}><th scope="row">{row}</th>{columns.map(column =>
        <td key={column}>{raw(cellValue(sheet.getRow(row).getCell(column).value)).slice(0, 80)}</td>)}</tr>)}</tbody>
    </table></div>
  </details>;
}
