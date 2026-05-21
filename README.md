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

**Entwurf.** Persistenz läuft aktuell in `localStorage` pro Browser (Demo-Modus).
Vor Go-Live wird angedockt:

- **Token-Store**: Upstash KV (REST) — Tokens, Status, Audit-Log serverseitig
- **GLS-API**: offizieller Endpoint für Abhol-Buchungen (Anfrage bei GLS läuft)
- **Auth**: einfacher CS-Login-Gate für `PickUp-Ranger.html` (PULSE-Schema)

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
