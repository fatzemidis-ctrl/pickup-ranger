# PickUp Ranger℠

**Sportstech CS-Tool für einmalige GLS-Abholungen.**

Erzeugt persönliche Einmal-Links für Kunden, die einen Abholtermin bei GLS
buchen sollen — ohne Login, ohne Account, ohne mehrfache Nutzung. Der Kunde
öffnet den Link aus der E-Mail, füllt Adresse und Zeitfenster aus und sieht
danach den Tracking-Status über denselben Link.

## Live

- **Interne CS-Konsole**: `https://<deploy>.vercel.app/` → leitet auf `/PickUp-Ranger.html`
- **Kundenseite**: `https://<deploy>.vercel.app/abholung?t=<TOKEN>`

## Module

| Datei | Rolle |
|---|---|
| `PickUp-Ranger.html` | Interne Konsole: Einmal-Links erzeugen, kopieren, Status verfolgen, stornieren |
| `abholung.html` | Kundenseite: Adresse + Wunsch-Zeitfenster eintragen, Bestätigung + Tracking |
| `index.html` | Redirect auf `PickUp-Ranger.html` |
| `vercel.json` | Routen + Security-Header |

## Status

**Phase 1 (Zendesk-Macro-Automatisierung):** ✅ implementiert.
Setup-Anleitung: [`docs/zendesk-setup.md`](docs/zendesk-setup.md)

- `api/pickup/issue.js` — Webhook-Endpoint für Zendesk-Trigger, erzeugt Token,
  schreibt in Upstash KV, postet öffentliche Antwort ans Ticket
- `api/_lib/kv.js` — Upstash REST-Helper (kein `@vercel/kv`-Import)
- `api/_lib/zendesk.js` — Zendesk-API-Client (Comments, Tags)

**Phase 2 (geplant):** Buchungs-Endpoint + Liste + Cancel
- `api/pickup/book.js` — Kundenseite ruft auf, validiert Token, ruft GLS-API
- `api/pickup/get.js` — Kundenseite holt Token-State
- `api/pickup/list.js` + `api/pickup/cancel.js` — interne Konsole
- HTML-Seiten von `localStorage`-Mock auf `fetch`-Calls umstellen
- Auth-Gate für die interne Konsole

**Offen / extern:**

- **GLS-API**: offizieller Endpoint für Abhol-Buchungen (Anfrage bei GLS läuft)

## Env-Vars (Vercel)

| Variable | Wofür |
|---|---|
| `ZENDESK_SUBDOMAIN` | `sportstech` |
| `ZENDESK_EMAIL` | E-Mail des Zendesk-API-Accounts |
| `ZENDESK_TOKEN` | Zendesk-API-Token |
| `ZENDESK_WEBHOOK_SECRET` | Shared Secret zwischen Zendesk-Trigger und unserem Endpoint |
| `KV_REST_API_URL` | Upstash KV — von Vercel automatisch gesetzt |
| `KV_REST_API_TOKEN` | Upstash KV — von Vercel automatisch gesetzt |

## Lokal entwickeln

Reine statische HTML-Seiten — jeder Web-Server tut's. Z. B.:

```
python -m http.server 3000
```

Dann öffnen: `http://localhost:3000/PickUp-Ranger.html`

Demo-Tokens (werden beim ersten Laden in `localStorage` geseedet):

- `?t=DEMO-OPEN` → Buchungsformular
- `?t=DEMO-USED` → Tracking-Ansicht
- `?t=DEMO-EXPIRED` → Abgelaufen-State

## Deploy

`git push origin main` → Vercel baut automatisch.

## Sicherheits-Modell (Ziel-Architektur)

- Tokens nur serverseitig (hohe Entropie, an Ticket + Kunde gebunden)
- Statusmaschine: `ISSUED → CONFIRMED → PICKED_UP → COMPLETED`, einmal-pro-Token
- 7 Tage Ablaufzeit als Default
- Rate-Limit pro IP
- Audit-Log jeder Token-Erzeugung und -Einlösung
- Keine Kunden-Accounts → keine Passwort-Risiken, keine Mehrfach-Nutzung
