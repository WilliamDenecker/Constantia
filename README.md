# Constantia Heren 1

Nederlandstalige teamwebsite voor Man of the Match en Loser of the Match. Gebouwd met Next.js, TypeScript, Supabase Auth en PostgreSQL.

## Lokaal draaien

Gebruik Node.js 22. Kopieer `.env.example` naar `.env.local` en vul de Supabase-project-URL, publishable key en een server-side secret key in. Zet `HEALTH_TOKEN` op een lange willekeurige waarde, bijvoorbeeld via `openssl rand -hex 32`.

```sh
npm ci
npm run dev
npm run typecheck
npm run build
```

## Supabase

Het gekoppelde project is [Constantia](https://supabase.com/dashboard/project/vxtuuifizlkihrsbsiba). De migraties staan in `supabase/migrations`. Voor een nieuwe installatie kun je met de Supabase CLI het project linken en `supabase db push` uitvoeren. Controleer bij een bestaand project eerst `supabase migration list`.

Alle tabellen hebben RLS en zijn voor `anon` en `authenticated` gesloten. Serveracties valideren de Auth-gebruiker en zijn actieve ledenrecord. Het stembiljet is één rij met beide keuzes, met een unieke sleutel per ronde en gebruiker. Inzenden en afsluiten vergrendelen dezelfde ronde. De deadline wordt bij inzending vergeleken met de databaseklok en de databasejob bevriest de uitslag op de eerstvolgende minuut. Bij gelijke aantallen geldt dezelfde rang. Een kandidaat met nul stemmen krijgt geen rang.

## Aanmelden en superusers

1. Vul bij **Authentication → URL Configuration** de canonieke productie-URL in bij **Site URL**. Voeg eventuele exacte ontwikkel-URL’s toe als redirects wanneer je die gebruikt. Zet publieke registratie uit bij **Authentication → Providers**.
2. Configureer een eigen SMTP-provider voor verzending naar teamleden. Supabase beperkt de standaardmailer tot toegestane adressen. Zie [Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp).
3. Gebruik deze links in de corresponderende e-mailtemplates. De tussenpagina vraagt een bevestigingsklik, zodat een scanner de link niet bij een gewoon GET-verzoek gebruikt.

   **Invite user**

   ```html
   <p>Je bent uitgenodigd voor Constantia Heren 1.</p>
   <p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=invite">Aanvaard je uitnodiging</a></p>
   ```

   **Magic link**

   ```html
   <p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=email">Log in bij Constantia Heren 1</a></p>
   ```

4. In dit project zijn 21 spelersprofielen geladen en is Williams accountplaats gekoppeld aan zijn opgegeven e-mailadres. Nodig hem vanuit **Authentication → Users → Add user → Send invitation** uit zodra de URL en SMTP zijn ingesteld. Zijn profiel wordt gekoppeld na e-mailverificatie. In Beheer kan hij Zeno later uitnodigen door diens eigen profiel te selecteren. Beide initiële profielen krijgen de rol superuser. Andere uitnodigingen krijgen de rol lid.
5. Bij een verse database laad je eerst de spelersprofielen, markeer je uitsluitend de twee bedoelde profielen met `initial_superuser = true` en reserveer je de eerste accountplaats in `public.accounts` met het geverifieerde e-mailadres of het e-mailadres voor de uitnodiging. Voor een al geverifieerd account koppel je de overeenkomstige `auth.users.id` bij het reserveren. Contactgegevens en spelerslijst staan uitsluitend in Supabase.

## Historische resultaten

Open **Beheer → Excel-import**, kies het werkblad en bekijk de voorbeeldrijen. Selecteer het bereik en wijs de kolommen toe op basis van de bron. De import ondersteunt afzonderlijke wedstrijdkolommen met een vaste datum en tegenstander, en rijen met datum en tegenstander als eigen kolommen. Voeg de relevante bereiken samen in de preview. Los lege en onbekende koppelingen handmatig op en beoordeel afwijkende waarden vóór bevestiging.

Alleen de twee categorieën, spelers en wedstrijdgegevens worden opgeslagen. Code 3 wordt getoond als **Verkozen**, code 1 als **Top 3**. Blanco en 0 geven geen vermelding. Het originele werkboek en andere statistieken worden niet opgeslagen. Herimport werkt een uitslag bij op wedstrijd, speler en categorie. Een historische wedstrijd wordt geïdentificeerd door de datum en de voor hoofdletters ongevoelige tegenstander. Controleer na opslag de opgegeven wedstrijden in het Resultatenarchief.

## Vercel en monitoring

Importeer `WilliamDenecker/Constantia` in het bestaande bijbehorende Vercel-project of maak daarvoor een Next.js-project. Stel **Production Branch** in op `main`. Vul de server-side productievariabelen uit `.env.example` in, configureer de Supabase Auth-URL en voer een productiedeploy uit. Stel op GitHub repositoryvariabele `PRODUCTION_URL` in en plaats dezelfde waarde van `HEALTH_TOKEN` in een Actions-secret. Start **Wekelijkse beschikbaarheidscontrole** handmatig via **Run workflow** en controleer of beide statussen 200 zijn. Elke maandag volgt een geplande run.

Op Supabase Free kan een project na zeven dagen met weinig databaseactiviteit pauzeren. De wekelijkse workflow dient als monitoring. Een betaald Supabase-abonnement voorkomt automatische inactiviteitspauzering. [Supabase Project Pausing](https://supabase.com/docs/guides/platform/free-project-pausing)

## Productiecontrole

Valideer na configuratie zowel een superuser- als een ledenaccount. Open een ronde met een gecontroleerde kandidaten- en ledenlijst. Test één geldige stem, de herhaalde inzending en verboden kandidaten. Bevestig dat de beheerder tijdens de open ronde alleen opkomst ziet. Sluit handmatig en herhaal met een deadline. Bekijk een gedeelde winnaar en een uitslag met nul stemmen. Controleer dat een lid wordt teruggestuurd bij bezoek aan beheer of archief. Upload daarna een gecontroleerd Excel-bestand, bekijk de uitslagen in het archief en herimporteer hetzelfde bestand om te controleren op dubbelen.
