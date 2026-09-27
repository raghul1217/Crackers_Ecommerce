# Vercel Setup Guide

Setup instructions for deploying **sivakasi666crackers** and getting the Admin Panel working.

The admin panel stores data in `products.json` and `orders.json` **on GitHub**, using a GitHub
token. There is no database server to provision.

---

## 1. Create a GitHub token

The panel only needs to read and write two JSON files in one repository, so a **fine-grained**
token is the right choice — it can be locked to this repo and these two files only.

1. Sign in to GitHub.
2. Click your avatar (top-right) → **Settings**.
3. In the left sidebar, scroll to the bottom → **Developer settings**.
4. **Personal access tokens** → **Tokens (fine-grained)**.
5. Click **Generate new token**.

### Fill in the form

| Field | Value |
| --- | --- |
| Token name | `sivakasi666crackers-admin` |
| Expiration | `90 days` (re-create when it expires) |
| Repository access | **Only select repositories** |
| Selected repositories | Choose this website's repo |

### Set the permissions

Under **Repository permissions**, add exactly these two:

| Permission | Access level | Why |
| --- | --- | --- |
| **Contents** | **Read and write** | Read + write `products.json` and `orders.json` |
| **Metadata** | **Read-only** | Granted automatically, required by the API |

> Do not grant Issues, Pull requests, Workflows, Administration, or any account-level permission.
> The panel does not use them.

6. Click **Generate token**.
7. Copy the token now (`github_pat_...`) — **GitHub shows it only once**.

### Find your Owner / Repo / Branch

- **Owner**: the username or org in `github.com/<owner>/<repo>` (e.g. `sivakasi666crackers`)
- **Repo**: the repository name
- **Branch**: usually `main`

### Grant the token access to a private repo

Fine-grained tokens need explicit access. Open the token's page →
**Repository access → your repo → Permissions → "Contents: Read and write"** → **Update permissions**.

---

## 2. Generate `AUTH_SECRET`

`AUTH_SECRET` signs the admin session cookie. **It has no default** — without it every login is
rejected. Generate a random value:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the 64-character output. Use a new one for every project; never reuse or commit it.

---

## 3. Add the environment variables in Vercel

1. Sign in at [vercel.com](https://vercel.com).
2. Open your project.
3. Go to **Project Settings** → **Environment Variables**.
4. Click **Add Environment Variable**.

Add each of the following:

| Variable | Value | Required | Notes |
| --- | --- | --- | --- |
| `AUTH_SECRET` | 64-char hex from step 2 | **Yes** | Signs the session cookie |
| `GITHUB_TOKEN` | `github_pat_...` from step 1 | **Yes** | Fine-grained token |
| `GITHUB_OWNER` | GitHub username or org | **Yes** | e.g. `sivakasi666crackers` |
| `GITHUB_REPO` | Repository name | **Yes** | e.g. `Crackers_Ecommerce` |
| `GITHUB_BRANCH` | `main` | No | Defaults to `main` if omitted |
| `ADMIN_USERNAME` | Your admin username | No | Defaults to `kotravel` |
| `ADMIN_PASSWORD` | Your admin password | No | Defaults to `sivakasi` |

### Environment selection

Vercel lets you tick **Production**, **Preview**, and **Development** independently. Tick at
least **Production**. For local testing, tick **Development** too.

### Add them from the CLI instead (faster)

```bash
npm i -g vercel
vercel link
vercel env add AUTH_SECRET production
vercel env add GITHUB_TOKEN production
vercel env add GITHUB_OWNER production
vercel env add GITHUB_REPO production
vercel env add GITHUB_BRANCH production
vercel env add ADMIN_USERNAME production
vercel env add ADMIN_PASSWORD production
```

Paste the value and press Enter when prompted. Then redeploy so the new variables take effect:

```bash
vercel env pull .env.local
vercel --prod
```

> Environment variables are **encrypted at rest and never shown again** after you save them.
> If you lose the GitHub token, delete the variable and create a new token.

---

## 4. Deploy

### From the dashboard

**Project Settings** → **Git** → make sure the repo is connected, then **Deployments** →
**Redeploy**.

### From the CLI

```bash
vercel --prod
```

> **Important:** changing an environment variable does **not** redeploy automatically.
> You must redeploy for the new value to take effect.

---

## 5. Verify the setup

### Check the public catalogue

```bash
curl https://www.sivakasi666crackers.com/api/products
```

Returns the 140-product catalogue as JSON. If you get
`{"error":"GitHub storage is not configured"}`, the `GITHUB_*` variables are missing or wrong.

### Check that the panel is protected

```bash
curl -i https://www.sivakasi666crackers.com/api/orders
```

Must return `401`. If it returns `200`, the panel is unprotected — remove the link from the
footer and rotate `AUTH_SECRET` immediately.

### Log in

1. Open `https://www.sivakasi666crackers.com/admin`
2. Sign in with your credentials.
3. Confirm the product table lists 140 products.

### Place a test order

1. Add a product to the cart on the storefront.
2. On the cart page, enter a name, mobile, and delivery address.
3. Click **Place Order on WhatsApp**.
4. WhatsApp opens with your order details. ✅
5. Open the admin panel → **Orders**. The new order should appear with an `SVC-0001` ID. ✅
6. Change its status and download the invoice. ✅
7. `git log` should show a new commit for each admin change. ✅

---

## 6. Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `GitHub storage is not configured` | `GITHUB_*` variables missing | Add them, then redeploy |
| `401` on `/api/orders` but you're logged in | Panel deployed without `AUTH_SECRET` | Add it and redeploy |
| Login always fails | Panel has no `AUTH_SECRET`, so no cookie is issued | Add `AUTH_SECRET` and redeploy |
| `401 Invalid username or password` | Wrong credentials | Check `ADMIN_USERNAME` / `ADMIN_PASSWORD` |
| `403` from GitHub | Token lacks write access | Re-open token → update repository permissions |
| `401` from GitHub | Token expired or revoked | Generate a new token, update `GITHUB_TOKEN` |
| `404` from GitHub | `GITHUB_REPO` typo, or file not on `GITHUB_BRANCH` | Check the repo name and branch |
| `409 Conflict` | Two writes at once | Retry — the API retries automatically once |
| Admin edits not showing on storefront | Browser cache | Hard-refresh with `Ctrl+Shift+R` |
| Works locally, fails on Vercel | Variables set for Preview only | Set them for **Production** too |

---

## 7. Security checklist

- [ ] Repo is **private** — the built-in fallback password is readable in the source.
- [ ] `ADMIN_PASSWORD` is set to something stronger than the default.
- [ ] `AUTH_SECRET` was generated fresh and never committed.
- [ ] `GITHUB_TOKEN` is **fine-grained** and limited to this one repository with Contents: RW only.
- [ ] Token expiration is set to 90 days; add a calendar reminder to rotate it.
- [ ] `/api/orders` returns `401` when logged out.
- [ ] `AUTH_SECRET`, `GITHUB_TOKEN`, and `.env*` are in `.gitignore`.
- [ ] `images/logo.png` added (panel falls back to an `S66` monogram without it).

---

## 8. How the storage works

| Action | Result |
| --- | --- |
| Add / update / delete a product | Commits the new `products.json` via the GitHub Contents API |
| Place an order | Appends to `orders.json` via the GitHub Contents API |
| Change order status | Commits the new `orders.json` |
| Delete an order | Commits the new `orders.json` |

Every admin action is a real git commit, so `git log` doubles as an audit trail. Each write
rewrites the whole file and Vercel redeploys, which is fine for hundreds of orders.

### Environment variable reference

| Variable | Read in | Default |
| --- | --- | --- |
| `AUTH_SECRET` (or `ADMIN_SESSION_SECRET`) | `api/_auth.js:11` | none — required |
| `GITHUB_OWNER` | `api/_github.js:14` | none — required |
| `GITHUB_REPO` | `api/_github.js:15` | none — required |
| `GITHUB_TOKEN` | `api/_github.js:17` | none — required |
| `GITHUB_BRANCH` | `api/_github.js:16` | `main` |
| `ADMIN_USERNAME` | `api/login.js:10` | `kotravel` |
| `ADMIN_PASSWORD` | `api/login.js:11` | `sivakasi` |
