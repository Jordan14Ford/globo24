# Send the digest with Resend

The pipeline writes files to `output/`. **Resend** sends `digest.html` + `digest.txt` to your inbox when `RESEND_API_KEY` is set.

If `RESEND_API_KEY` is missing, configure **SMTP** (`SMTP_HOST` and credentials in `.env`). The sender will not fall back to `localhost:587` — that avoids opaque `ECONNREFUSED` errors when no local mail server is running.

## 1. Create a Resend account

1. Go to [resend.com](https://resend.com) and sign up.
2. **API Keys** → Create API Key → copy it (starts with `re_`).

## 2. “From” address (pick one)

| Option | When to use |
|--------|-------------|
| **Test sender** | Quick test: use Resend’s documented test `from` (see [Resend docs → Sending → Domain](https://resend.com/docs/dashboard/domains/introduction)). Often you can send **only to your signup email** until you add a domain. |
| **Your domain** | Production: add a domain in Resend, add DNS records, verify, then use e.g. `Digest <digest@yourdomain.com>`. |

`EMAIL_FROM` must match what Resend allows for your account (test rules vs verified domain).

## 3. Configure `.env`

Scripts load **`.env` from the `global-news-pipeline/` folder** (next to `package.json`), not from whatever directory you run `npm` in. Keep your API key in that file.

From the project root:

```bash
cp .env.example .env
```

Edit `.env`:

```env
RESEND_API_KEY=re_xxxxxxxxxxxx
EMAIL_FROM="Digest <onboarding@resend.dev>"
EMAIL_TO=you@example.com
EMAIL_SUBJECT=[Global Macro Digest] Review
```

- Replace `RESEND_API_KEY` with your key.
- Set `EMAIL_TO` to the address that should receive the digest (comma-separated for multiple).
- Adjust `EMAIL_FROM` to match Resend’s rules for your account (test vs verified domain).

## 4. Run pipeline + send

```bash
npm run pipeline
npm run send
```

Or one shot:

```bash
npm run run:all
```

Success looks like: `[sendEmail] Sent via Resend id=…` plus **to=** / **from=** lines (see `lib/email/sendDigest.ts`).

## Troubleshooting

| Issue | What to check |
|-------|----------------|
| `401` / invalid API key | Key copied fully; no extra spaces. |
| Domain not verified | Use Resend dashboard to verify DNS, or use the test sender + allowed recipient. |
| `from` rejected | `EMAIL_FROM` must match an allowed sender in Resend (domain or test address). |
| No digest file | Run `npm run pipeline` first so `output/digest.html` exists. |
| **API says sent but no Gmail** | With **`onboarding@resend.dev`**, Resend often delivers **only to the email you used to sign up**. Set **`EMAIL_TO`** to that exact address, or verify a **domain** and send from your domain. |
| Still missing | **Resend → Emails**: open the row for the **id** from the terminal; check delivery/bounce. Gmail: **Promotions**, **Spam**, **All Mail** search for subject or “Globo”. |

### Quick fix (test sender)

1. Use the same address for Resend signup and for **`EMAIL_TO`** in `.env`.
2. Run `npm run send:test` or `npm run pipeline:test`.

For any recipient, add a **verified domain** in Resend and set `EMAIL_FROM` to e.g. `Digest <news@yourdomain.com>`.
