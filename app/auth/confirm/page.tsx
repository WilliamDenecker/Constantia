import { confirmToken } from "../../actions";

export default async function Confirm({ searchParams }: { searchParams: Promise<{ token_hash?: string; type?: string }> }) {
  const { token_hash, type } = await searchParams;
  return <section className="panel narrow">
    <p className="eyebrow">Toegang tot het team</p>
    <h1>Bevestig je aanmelding</h1>
    <form action={confirmToken}>
      <input type="hidden" name="token" value={token_hash ?? ""} />
      <input type="hidden" name="type" value={type ?? ""} />
      <button>Inloggen</button>
    </form>
  </section>;
}
