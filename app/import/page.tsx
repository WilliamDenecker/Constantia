import { checked, database, requireAccount, type Player } from "../../lib/db";
import { AdminNav } from "../ui";
import ImportWorkbook from "./workbook";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  await requireAccount(true);
  const players = checked(await database().from("players").select("id,name").order("name")) as Pick<Player, "id" | "name">[];
  return <>
    <AdminNav />
    <h1>Historische Excel-import</h1>
    <ImportWorkbook players={players} />
  </>;
}
