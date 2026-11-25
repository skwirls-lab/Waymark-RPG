# Security review

*2026-11-25. Covers the security rules, the Cloud Functions, the hosting configuration and the AI path, as they stand after phase 7. To be repeated before launch, once phase 8 exists.*

## How it was done

Every collection's rules and every function were read against one question: what can a signed-in stranger, a player in someone else's campaign, or a hostile reply from the model do that they should not? Each finding below has a test that fails without its fix.

## Findings

| # | Finding | Rating | Status |
|---|---|---|---|
| 1 | **Join codes and hand-over codes could be guessed by a program.** Codes are six characters so people can read them aloud. Nothing counted wrong guesses, so with enough campaigns in existence a script could find its way into a stranger's campaign and read its brief, feed and character summaries. | High | **Fixed.** Ten wrong codes in an hour and further tries are refused for that account. Wrong join and hand-over codes share one count. |
| 2 | **AI requests could be run up at the project's expense.** Guests need no account, and every guest had the full free allowance of 30 requests a month. Guest accounts can be made in bulk. | High | **Fixed.** A guest has 5 requests a month. The whole app stops at 5,000 requests a day (about $2 at the chosen model's price) and says so. Budget alerts on the project are still needed (see "For John"). |
| 3 | **A member could post a feed line under any display name,** of any length. The account id on the line was always correct, so this was a nuisance, not an impersonation the Warden could not detect. | Low | **Fixed.** The name is limited to 80 characters and the time must be a number. The same for presence. |
| 4 | **No security headers on the app.** It could be shown inside a frame on another site. | Low | **Fixed.** The app now sends `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, a referrer policy and a permissions policy. The rules site sends the two that cannot interfere with sign-in, which uses a frame on that address. |
| 5 | **Deleting an account left its AI request count behind.** | Low | **Fixed.** |

## Checked and found sound

- **Plans.** No path lets a browser write `entitlements`, `usage`, `billingEvents`, `joinCodes`, `handovers` or `throttle`. Everything not opened by a rule is denied.
- **Other people's sheets.** A player sees only summaries. The Warden reads full sheets only in their own campaign, and can change one only if its player chose "directly", and then only the sheet, undo, name and time.
- **The Warden's secrets.** Planned cards, card notes, private beats, private notes, creatures and the fight cannot be read by players, one at a time or by listing.
- **Limits.** Character and campaign limits are enforced by document ids and by rules, not by the app. The read-only state after a plan ends cannot be escaped by choosing more than the limit or by filling a low slot.
- **Payments.** The webhook checks the provider's signature before reading anything. Events apply once, and an old event cannot undo a newer one. The address people are sent back to after paying is chosen from a fixed list.
- **AI.** User text reaches the model only as data. Replies are refused unless they match a strict shape with no extra fields and no markup. Links in answers are built on the server. The function writes nothing but the request count.
- **Secrets.** None in the repository. Keys live in Secret Manager, or for local evaluation are injected by the session's network proxy.
- **What the browser shows.** All user and model text is rendered as text, never as markup.

## Still open

| # | Item | Rating | Plan |
|---|---|---|---|
| A | **App Check is not turned on,** so the Cloud Functions can be called by any program holding a sign-in, not only by the app. The throttle and allowances above limit what such a program can do. | Medium | Turn on before launch (phase 9). It needs a reCAPTCHA key from the Firebase console. |
| B | **No content security policy** on the app. | Low | Add in phase 9, tested against real Google sign-in, which a strict policy can break. |
| C | **Budget alerts** are not set on the project. | Medium | John, in the console (phase 9, item 1). |

## For John

Nothing here needs you today. Before launch: budget alerts on the Google Cloud project, and App Check.
