# PaceMeet live schalten

Diese Anleitung bringt PaceMeet von der Demo zu einer echten App mit Konten, Datenbank und eigener Adresse.
Rechne für den ersten Durchlauf mit 2–3 Stunden. Programmierkenntnisse brauchst du dafür kaum, nur Geduld beim Klicken.

**Was am Ende läuft:** Anmeldung per E-Mail-Code, echte Aktivitäten in der Datenbank, Live-Chat, Benachrichtigungen in der App,
Profilfotos, Liga, Konto löschen und Datenexport. Die App ist auf dem Handy installierbar („Zum Home-Bildschirm“).

---

## 1. Konten anlegen (kostenlos)

| Dienst | Wofür | Link |
|---|---|---|
| Supabase | Datenbank, Anmeldung, Fotos, Echtzeit | supabase.com |
| GitHub | Speicherort für den Code | github.com |
| Netlify **oder** Vercel | Veröffentlicht die App im Internet | netlify.com / vercel.com |
| Brevo (o. ä.) | Versand der Anmeldecodes per E-Mail | brevo.com |

## 2. Supabase-Projekt erstellen

1. In Supabase **New project** anlegen.
2. **Region: Central EU (Frankfurt)** wählen. Wichtig für den Datenschutz.
3. Ein sicheres Datenbank-Passwort vergeben und im Passwortmanager speichern.

## 3. Datenbank einrichten

1. Im Supabase-Projekt links **SQL Editor** öffnen → **New query**.
2. Den kompletten Inhalt von `supabase/migrations/20261024000000_init.sql` einfügen → **Run**. Es muss „Success“ erscheinen.
3. Neue Abfrage, Inhalt von `supabase/migrations/20261024000100_storage.sql` einfügen → **Run**.
4. Ebenso `20261024000200_features.sql` und `20261024000300_schedules.sql` (Teilen, Serien, Erinnerungen, Push).
   In `..._schedules.sql` stehen Projekt-URL und anon-Schlüssel des Projekts; bei einem neuen Projekt anpassen.
5. Edge Function `supabase/functions/send-push/index.ts` anlegen: Edge Functions → Deploy a new function → Via Editor,
   Name `send-push`, Code einfügen, Deploy. Die Push-Schlüssel erzeugt sie beim ersten Aufruf selbst.
6. Optional: `supabase/seed_events.sql` für ein erstes Community-Event (Daten vorher anpassen).

> Die Datenbankregeln sind mit 86 automatischen Tests geprüft (`npm run test:db`).

## 4. Anmeldung einstellen

Unter **Authentication**:

1. **Sign In / Providers → Email:** aktiviert lassen, „Confirm email“ an.
2. **Email OTP Length: 6**, **Email OTP Expiration: 3600** Sekunden.
3. **Emails → Templates:**
   - „Magic Link“: Betreff *Dein Anmeldecode für PaceMeet*, Inhalt aus `supabase/email/magic-link.html`.
   - „Confirm signup“: Inhalt aus `supabase/email/confirm-signup.html`.
   Wichtig: Die Vorlage muss `{{ .Token }}` enthalten, sonst kommt kein Code an.
4. **URL Configuration → Site URL:** später deine echte Adresse eintragen (z. B. `https://pacemeet.de`).
5. **Emails → SMTP Settings:** eigenen E-Mail-Versand eintragen (z. B. Brevo: SMTP-Server, Port 587, Benutzer, Schlüssel).
   Ohne eigenen Versand schickt Supabase nur sehr wenige E-Mails pro Stunde, das reicht nur zum Testen.

## 5. App mit Supabase verbinden

1. In Supabase **Project Settings → API** öffnen.
2. Im Projektordner die Datei `.env.example` kopieren und in `.env` umbenennen.
3. `Project URL` bei `VITE_SUPABASE_URL` eintragen, den `anon public`-Schlüssel bei `VITE_SUPABASE_ANON_KEY`.
   Den `service_role`-Schlüssel **niemals** in die App eintragen.
4. Lokal testen: `npm install`, dann `npm run dev`. Die App zeigt jetzt „Anmelden oder registrieren“ statt der Demo.
5. Mit zwei verschiedenen E-Mail-Adressen (z. B. in zwei Browsern) testen: Aktivität erstellen, mit dem zweiten Konto beitreten, chatten.

## 6. Rechtliches vorbereiten

1. In `src/config/app.ts` den Block `OPERATOR` ausfüllen (Name, ladungsfähige Anschrift, E-Mail).
2. Die Entwürfe in `src/content/legal.ts` (Impressum, Datenschutz, Nutzungsbedingungen) **prüfen lassen**:
   Anwalt, IHK-Beratung oder ein Generator wie eRecht24. Danach `legalReviewed: true` setzen.
3. Auftragsverarbeitungsverträge (AVV/DPA) abschließen: Supabase (Dashboard → Organization → Legal Documents),
   Netlify bzw. Vercel und dein E-Mail-Dienst. Meist ein Klick im jeweiligen Konto.
4. Eintragen, welchen Hosting- und E-Mail-Dienst du nutzt (Abschnitt 3 der Datenschutzerklärung).

## 7. Veröffentlichen

1. Projekt auf GitHub hochladen (z. B. mit GitHub Desktop: *Add existing repository* → *Publish*).
   Die Datei `.env` wird automatisch **nicht** hochgeladen.
2. In Netlify: **Add new site → Import from GitHub** → Repository wählen. Build-Einstellungen kommen aus `netlify.toml`.
3. Unter **Site configuration → Environment variables** die beiden `VITE_SUPABASE_…`-Werte eintragen → neu deployen.
4. Eigene Domain verbinden (z. B. bei Netlify kaufen oder bei deinem Anbieter einen DNS-Eintrag setzen).
5. Die echte Adresse in Supabase unter **Site URL** und **Redirect URLs** eintragen.

## 8. Vor dem Start testen (Checkliste)

- [ ] Registrierung mit neuer E-Mail, Code kommt innerhalb einer Minute an
- [ ] Profil anlegen, Foto hochladen, Profil bearbeiten
- [ ] Aktivität mit Rundkurs und mit Start → Ziel erstellen
- [ ] Zweites Konto tritt bei, Chat funktioniert in beide Richtungen ohne Neuladen
- [ ] Änderung der Startzeit erzeugt Benachrichtigung beim Teilnehmenden
- [ ] Absage durch Gastgeber erreicht alle
- [ ] Nach dem Termin: Teilnahme bestätigen (beide Seiten), Punkte erscheinen in der Liga
- [ ] Blockieren, Melden, Daten herunterladen, Konto löschen
- [ ] Auf iPhone (Safari → Teilen → Zum Home-Bildschirm) und Android (Chrome → App installieren) installieren
- [ ] Impressum und Datenschutz sind erreichbar und ohne Platzhalter

## 9. Betrieb

- **Meldungen prüfen und Nutzer sperren:** in der App unter Profil → Einstellungen → *Moderation* (nur für Admins).
  Weitere Admins: im SQL-Editor `insert into public.admins (user_id) select id from auth.users where email = '…';`
- **Events anlegen:** in der App unter *Moderation → Events*.
- **Rauchtest der Live-Datenbank:** Inhalt von `supabase/tests/live_smoke_test.sql` im SQL-Editor ausführen. Er rollt alles zurück und zeigt das Ergebnis als Meldung.
- **Backups:** Im kostenlosen Supabase-Tarif gibt es keine automatischen Backups, die du selbst zurückspielen kannst. Zum Start den Pro-Tarif nehmen.
- **Pausierung:** Kostenlose Supabase-Projekte werden nach etwa einer Woche ohne Nutzung pausiert. Für den echten Betrieb Pro-Tarif.

## 10. Kosten (Richtwerte, bitte aktuell prüfen)

| Posten | Start | Hinweis |
|---|---|---|
| Supabase | 0 € zum Testen, ca. 25 $/Monat (Pro) im Betrieb | Backups, keine Pausierung |
| Netlify / Vercel | 0 € | reicht für den Start |
| E-Mail (Brevo) | 0 € bis ca. 300 E-Mails/Tag | danach ab ca. 9 €/Monat |
| Domain | ca. 10–15 €/Jahr | |
| Kartendienste | 0 € | öffentliche Server mit Nutzungsgrenzen, siehe README |

## 11. Was noch fehlt (nächste Ausbaustufen)

- **App-Store-Versionen** für iOS und Android (die Web-App lässt sich mit Capacitor verpacken)
- **Eigene Kartenserver** oder ein Kartenanbieter mit Vertrag, sobald viele Nutzer aktiv sind
- **Weitere Sprachen** (Texte in Sprachdateien auslagern)
