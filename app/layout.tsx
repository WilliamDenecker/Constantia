import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import "./style.css";

export const metadata: Metadata = {
  title: "Constantia Heren 1 · Stemmen",
  icons: { icon: "/constantia-hc.png" },
  description: "Stem na de wedstrijd op de Man of the Match en Loser of the Match.",
};

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="nl-BE">
    <body>
      <header className="masthead"><div className="shell masthead-inner">
        <Link className="brand" href="/"><Image className="crest" src="/constantia-hc.png" width={48} height={48} alt="" />
          <span>Constantia <small>HEREN 1</small></span></Link>
        <Link className="nav-link" href="/">Stemmen</Link>
      </div></header>
      <main className="shell">{children}</main>
      <footer className="shell footer">Constantia Heren 1</footer>
    </body>
  </html>;
}
