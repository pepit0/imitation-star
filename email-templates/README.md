# Auth email templates (Supabase + Resend SMTP)

## Confirm signup

1. Open **Supabase → Authentication → Email Templates → Confirm signup**
2. **Subject:** `Confirm your Imitation Star account`
3. Paste the HTML from [`confirm-signup.html`](./confirm-signup.html)
4. Icon URL used in the template: `https://www.imitation.site/email-icon.png`  
   (served from `public/email-icon.png` after deploy)

## Resend SMTP (Supabase)

**Supabase → Project Settings → Authentication → SMTP Settings**

| Field | Value |
| --- | --- |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | Resend API key |
| Sender email | e.g. `noreply@imitation.site` (domain verified in Resend) |
| Sender name | `Imitation Star` |

Verify `imitation.site` (or your mail subdomain) in Resend before sending.

## Redirect URLs

Allow `https://www.imitation.site/auth/callback` in Supabase Auth URL configuration.
Sign-up already sets `emailRedirectTo` to that callback.
