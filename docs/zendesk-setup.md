# Zendesk-Setup: 1-Klick-Macro für Abhol-Links

Diese Anleitung verdrahtet die Automatisierung **einmalig** in Zendesk.
Danach reicht dem Agent ein einziger Klick auf das Macro, um dem Kunden den
persönlichen Abhol-Link zu schicken.

**Dauer:** ~10 Minuten. **Brauchst du:** Zendesk-Admin-Rechte.

---

## 1. Vercel-Env-Vars setzen

Im Vercel-Dashboard → `pickup-ranger` Projekt → **Settings → Environment Variables**.
Setze für `Production`, `Preview` und `Development`:

| Variable | Wert | Wofür |
|---|---|---|
| `ZENDESK_SUBDOMAIN` | `sportstech` | dein Zendesk-Subdomain |
| `ZENDESK_EMAIL` | `f.atzemidis@sportstech.de` (oder ein Service-Account) | wird mit `/token:…` für Basic-Auth kombiniert |
| `ZENDESK_TOKEN` | `<API-Token aus Zendesk>` | siehe Schritt 2 |
| `ZENDESK_WEBHOOK_SECRET` | `<eigenes 32+ Zeichen Geheimnis>` | Trigger → API authentifizieren |

**KV (Upstash):**

Vercel-Dashboard → `pickup-ranger` → **Storage** → „Create Database" → **Upstash KV**.
Vercel setzt `KV_REST_API_URL` und `KV_REST_API_TOKEN` automatisch.

---

## 2. Zendesk-API-Token erstellen

Zendesk → **Admin Center → Apps and Integrations → APIs → Zendesk API**:

1. Tab „Settings": **Token access** aktivieren
2. Tab „API tokens" → „Add API token" → Label: `PickUp Ranger`
3. Token kopieren → in Vercel als `ZENDESK_TOKEN` einfügen

(Das Token wird intern als `email@domain/token:<token>` Basic-Auth genutzt.)

---

## 3. Webhook anlegen

Zendesk → **Admin Center → Apps and Integrations → Webhooks → Actions → Create webhook**:

| Feld | Wert |
|---|---|
| Name | `PickUp Ranger — Issue Link` |
| Description | `Erzeugt Einmal-Link und sendet ihn ans Ticket.` |
| Endpoint URL | `https://pickup-ranger.vercel.app/api/pickup/issue` |
| Request method | `POST` |
| Request format | `JSON` |
| Authentication | `None` (wir nutzen Custom Header) |

Custom Header hinzufügen:
- Header name: `X-Pickup-Secret`
- Value: derselbe String wie `ZENDESK_WEBHOOK_SECRET` in Vercel

→ „Test webhook" (optional, mit Demo-Payload) → **Create**.

---

## 4. Macro anlegen

Zendesk → **Admin Center → Workspaces → Agent tools → Macros → Add macro**:

| Feld | Wert |
|---|---|
| Name | `📦 GLS · Einmal-Abholung anbieten` |
| Description | `Sendet dem Kunden automatisch einen persönlichen Abhol-Link. Klickt der Agent dieses Macro + Submit, läuft alles weitere automatisch.` |
| Available for | `All agents` (oder dein CS-Team) |

**Actions:**

1. **Add tags** → `pickup_request`
2. **Internal note** (privater Hinweis als Audit-Spur):
   ```
   PickUp Ranger: Abhol-Link wird automatisch versendet.
   ```
3. **Set status** → `Open` (damit der Trigger feuert)

→ Speichern.

---

## 5. Trigger anlegen

Zendesk → **Admin Center → Objects and rules → Business rules → Triggers → Add trigger**:

| Feld | Wert |
|---|---|
| Trigger name | `PickUp Ranger — Macro aktiviert` |
| Category | `Notifications` (oder eigene Kategorie) |

**Conditions — Meet ALL:**
- `Ticket → Tags` · `Contains at least one of the following` · `pickup_request`
- `Ticket → Tags` · `Contains none of the following` · `pickup_link_sent`

(Die zweite Bedingung verhindert, dass der Trigger doppelt feuert, falls jemand
das Macro versehentlich zweimal anwendet. Unser Endpoint setzt den Tag
`pickup_link_sent` nach erfolgreicher Reply.)

**Actions:**
- `Notifications → Notify active webhook` → wähle `PickUp Ranger — Issue Link`
- JSON body:

```json
{
  "ticket_id":       "{{ticket.id}}",
  "requester_name":  "{{ticket.requester.name}}",
  "requester_email": "{{ticket.requester.email}}",
  "subject":         "{{ticket.title}}"
}
```

→ **Create**.

---

## 6. Funktionstest

1. Beliebiges offenes Ticket öffnen
2. In der Antwort-Composer-Leiste **Apply macro → „📦 GLS · Einmal-Abholung anbieten"**
3. **Submit as Open** klicken
4. Innerhalb 5-10 Sekunden erscheint die automatische öffentliche Antwort mit dem Link
5. In der internen CS-Konsole [pickup-ranger.vercel.app](https://pickup-ranger.vercel.app/PickUp-Ranger.html) sollte der neue Token in der Tabelle sichtbar sein

Falls der Link nicht kommt:
- Zendesk → Webhooks → `PickUp Ranger — Issue Link` → Tab **Activity** zeigt Fehler
- Vercel → `pickup-ranger` → **Functions → Logs** zeigt die Response unseres Endpoints
- Häufig: `ZENDESK_WEBHOOK_SECRET` stimmt nicht überein → 401, oder `KV_REST_API_URL/TOKEN` nicht gesetzt → 503

---

## Was der Agent ab jetzt macht

```
Ticket öffnen
    ↓
Macro „📦 GLS · Einmal-Abholung anbieten" anwenden
    ↓
Submit
```

Drei Klicks. Alles andere passiert automatisch im Hintergrund.

---

## Was passiert intern (für die Doku)

```
Macro
 ├─ setzt Tag: pickup_request
 ├─ schreibt internen Audit-Hinweis
 └─ Ticket wird gespeichert
       ↓
Trigger erkennt Tag → feuert Webhook
       ↓ POST /api/pickup/issue
       ↓ Header: X-Pickup-Secret
       ↓ Body: { ticket_id, requester_name, requester_email, subject }
       ↓
Vercel-Function
 ├─ verifiziert Secret (timing-safe)
 ├─ prüft Idempotenz (gleicher Ticket schon mal? → re-use Token)
 ├─ erzeugt Token, speichert in Upstash KV (7d TTL)
 ├─ ruft Zendesk-API:
 │    PUT /tickets/{id}.json
 │    → public comment mit Link
 │    → tag: pickup_link_sent
 └─ 200 OK an Zendesk
       ↓
Kunde bekommt die E-Mail aus Zendesk (Standard-Trigger der ihm Replies meldet)
```
