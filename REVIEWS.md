# Verified order reviews

Reviews use the app's existing SQLite database (`DB_PATH`). Startup adds only the `reviews` table and its index; no order, session, chat, menu, or opening-hours data is changed by this feature. Back up the database before deploying as usual.

Customers use **Orders → picked-up order → Review your meal** in the same browser session used for the order. Ready, cancelled, held and cooking orders cannot be reviewed. Possession of an order number or matching contact details grants no access.

## Review links for past customers

Customers who ordered on WhatsApp, Instagram or by phone (or from another browser) get a **review link** from the owner instead. In **More → Reviews → Ask a past customer for a review** the owner types an optional note (who it's for, kept private), creates the link and sends it with **Copy link** or **Send on WhatsApp**.

- The link is `/review/<code>` with a random 24-character code and **expires after 30 days**. When creating it the owner picks **One person** (works once) or **A group** (up to 25 or 50 reviews; share it with many people). A full link can be opened up again with **Allow more reviews**, so the link people already have keeps working. **Stop** ends a link that can still take reviews; reviews already received stay. A stopped link looks the same as an unknown one.
- On a group link each browser can send one review; this is a convenience check only, so the limit and owner moderation are the real safeguards.
- The customer gives 1–5 stars, an optional comment and an optional first name. The same rules apply as for order reviews (no phone numbers, emails or links; first name only).
- The review arrives **pending**, like every review. Published, it shows **"✓ Annapurna customer"** rather than "✓ Verified order", because no website order backs it. The owner's note and the link code are never public.
- Storage: a `review_invites` table (with `max_uses` and `use_count`), and `reviews` gains an `invite_id` column with `order_id` now optional (exactly one of the two is set; one link may have several reviews). Startup rebuilds the `reviews` table once when needed, keeping every row and id.

A review needs an integer rating of 1–5 and an optional comment of up to 500 characters. Only the star rating is required. A first name is optional and never copied from the order/customer record; blank names display as **Annapurna guest**. Direct email addresses, phone numbers and links are rejected in comments. Owners must still check for other personal details before publishing. Content is rendered as text, never HTML.

Reviews start **pending**. **More → Reviews** preserves the existing main navigation and supports:

- **Publish**: visible publicly.
- **Hide**: retained privately for moderation.
- **Unpublish**: returned to pending.
- **Delete**: clears the comment and display name permanently and removes the review from management/public views. A minimal row remains to enforce one review per order. It cannot be republished or resubmitted.

Public reviews appear on the welcome screen and signed-in home, newest first (up to 100), refreshing every minute. Public JSON includes only rating, comment, chosen display name and the verified flag. It excludes order IDs, internal review IDs, contact details, customer/session IDs and moderation state. No seed or fabricated reviews are shipped.

## Validation and rollback

Run `npm test`, `node --check public/app.js`, and `node --check public/desk.js`. Tests cover session ownership, pickup eligibility, validation, default moderation, all moderation actions, public projection, duplicate prevention, deletion and SQLite restart persistence.

The backend/tests and customer/owner UI are separate commits. Revert the UI commit first, then the backend commit to remove the feature. The unused additive SQLite table can safely remain so existing reviews survive rollback; do not drop it to revert application code. Deploy/restart normally to load the changed static assets. No production deployment is performed as part of implementation.
