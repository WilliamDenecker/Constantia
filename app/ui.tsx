import Link from "next/link";
import { signOut } from "./actions";

export const shortDate = (value: string) => new Intl.DateTimeFormat("nl-BE", {
  dateStyle: "long", timeZone: "Europe/Brussels",
}).format(new Date(value));

export const deadlineLabel = (value: string) => new Intl.DateTimeFormat("nl-BE", {
  dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Brussels",
}).format(new Date(value));

export function AdminNav() {
  return <nav className="tabs" aria-label="Beheer">
    <Link href="/beheer">Beheer</Link><Link href="/archief">Resultatenarchief</Link><Link href="/import">Excel-import</Link>
  </nav>;
}

export function Logout() {
  return <form action={signOut}><button className="secondary">Uitloggen</button></form>;
}

export function Notice({ text }: { text?: string }) {
  return text && <p className="notice" role="status">{text.slice(0, 240)}</p>;
}
