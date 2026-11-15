"use server";

import { database, requireAccount } from "../../lib/db";
import { isDateKey, type HistoricalGame } from "../../lib/history";

export async function importHistory(games: HistoricalGame[]) {
  const { user_id } = await requireAccount(true);
  if (!Array.isArray(games) || !games.length || games.length > 300) return { error: "Selecteer 1 tot 300 wedstrijden." };

  const candidates = new Set<string>();
  for (const game of games) {
    if (!game || typeof game.date !== "string" || !isDateKey(game.date) ||
        typeof game.opponent !== "string" || !game.opponent.trim() || game.opponent.trim().length > 120 ||
        !Array.isArray(game.entries) || game.entries.length > 200) return { error: "Controleer de wedstrijdgegevens." };
    const entries = new Set<string>();
    for (const entry of game.entries) {
      if (!entry || typeof entry.player !== "string" || !/^[0-9a-f-]{36}$/i.test(entry.player) ||
          !["man", "loser"].includes(entry.category) || ![1, 3].includes(entry.code)) {
        return { error: "Controleer de gekoppelde uitslagen en codes." };
      }
      const key = entry.player + ":" + entry.category;
      if (entries.has(key)) return { error: "Dezelfde speler en categorie komen meermaals voor in een wedstrijd." };
      entries.add(key);
    }
    const key = game.date + ":" + game.opponent.trim().toLowerCase();
    if (candidates.has(key)) return { error: "Dezelfde wedstrijd komt meermaals voor in de preview." };
    candidates.add(key);
  }
  const { error, data } = await database().rpc("import_history", { actor: user_id, games });
  return error ? { error: "De import kon niet worden opgeslagen. Controleer de koppelingen." } : { count: data as number };
}
