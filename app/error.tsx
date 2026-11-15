"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <section className="panel">
    <h1>Tijdelijk onbereikbaar</h1>
    <p>De gegevens konden niet worden opgehaald.</p>
    <button onClick={reset}>Probeer opnieuw</button>
  </section>;
}
