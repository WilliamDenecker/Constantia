export type Category = "man" | "loser";
export type HistoryEntry = { player: string; category: Category; code: 1 | 3 };
export type HistoricalGame = { date: string; opponent: string; entries: HistoryEntry[] };
export type Cell = string | number | boolean | Date | null;
export type PlayerOption = { id: string; name: string };

export function dateKey(value: Cell, date1904 = false): string {
  if (value instanceof Date) return isNaN(+value) ? "" : value.toISOString().slice(0, 10);
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value < 100000) {
    const origin = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, value < 60 ? 31 : 30);
    return value === 60 && !date1904 ? "" : new Date(origin + value * 86400000).toISOString().slice(0, 10);
  }
  if (typeof value !== "string") return "";
  const local = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(value.trim());
  const date = local ? [local[3], local[2].padStart(2, "0"), local[1].padStart(2, "0")].join("-") : value.trim();
  return isDateKey(date) ? date : "";
}

export function isDateKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) return false;
  const date = new Date(value + "T00:00:00Z");
  return !isNaN(+date) && date.toISOString().slice(0, 10) === value;
}

export function excelCode(value: Cell): 0 | 1 | 3 | null {
  if (value === null || value === 0 || (typeof value === "string" && ["", "0"].includes(value.trim()))) return 0;
  if (value === 1 || (typeof value === "string" && value.trim() === "1")) return 1;
  if (value === 3 || (typeof value === "string" && value.trim() === "3")) return 3;
  return null;
}

export function exactPlayer(name: string, players: PlayerOption[]) {
  const normalize = (s: string) => s.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
  const matches = players.filter(player => normalize(player.name) === normalize(name));
  return matches.length === 1 ? matches[0].id : "";
}
