# Citation Ticket & Payment System

A role-based traffic citation and payment system for Gitagum Municipal Government. Built with TanStack Start, React 19, TypeScript, Tailwind CSS v4, and Supabase.

## Roles

| Role | Path | Access |
|------|------|--------|
| Traffic Enforcer | `/enforcer` | Private |
| PNP / Police | `/pnp` | Private |
| Municipal Treasury | `/treasury` | Private |
| System Admin | `/admin` | Private |
| Public Portal | `/portal` | Public |

## Features

- **Enforcer** — Mobile-first fast citation entry with plate lookup, violation picker, and photo capture
- **PNP** — Read-only monitoring table with status filters and due-date watch
- **Treasury** — Cashier POS: search ticket, process cash or GCash payment, print e-receipt
- **Admin** — Full dashboard with metrics, charts, user management, and reports
- **Portal** — Public ticket lookup and QRPh online payment

## Tech Stack

- [TanStack Start](https://tanstack.com/start) + [TanStack Router](https://tanstack.com/router) — SSR framework with file-based routing
- [React 19](https://react.dev) + TypeScript
- [Tailwind CSS v4](https://tailwindcss.com) + [shadcn/ui](https://ui.shadcn.com)
- [Supabase](https://supabase.com) — Postgres database + realtime subscriptions
- [Zustand](https://zustand-demo.pmnd.rs) — Global ticket state with optimistic updates
- [Recharts](https://recharts.org) — Analytics charts
- [Nitro](https://nitro.unjs.io) — Server engine (auto-detects Vercel/Node/Cloudflare)

## Development

Requires Node.js 22.12+ and npm (or bun). With [nvm](https://github.com/nvm-sh/nvm), use the Node 22 version selected by `.nvmrc`:

```sh
git clone <repository-url>
cd citation
nvm install 22
nvm use 22
npm ci
npm run dev
```

Open the local URL printed by Vite. If an already-open terminal still uses an older Node version, `npm run dev` automatically uses a compatible Node 22 installation from nvm. On Apple Silicon it selects an `arm64` runtime, including when the terminal's Node runs under Rosetta. It prints the selected runtime and forwards Vite arguments, for example `npm run dev -- --port 3001`.

If Vite reports `Cannot find native binding`, check `node -p 'process.version + " " + process.arch'`. On Apple Silicon, use an `arm64` Node installation. After switching Node versions or architectures, run `npm ci --include=optional` to reinstall the native dependencies from the existing lockfile.

If nvm prints `Unknown option: n` from XAMPP's `head` command, run `export PATH="/usr/bin:$PATH"` before `nvm use 22` so nvm uses macOS's `head`.

For admin-created accounts that verify their email before signing in, follow [the email verification setup](docs/email-verification.md). This requires Supabase Auth, a server-only admin key, the database migration, and custom SMTP for Gmail recipients.

## Deployment

Deployed to Vercel. Push to `main` to trigger a build. The `nitro()` plugin auto-detects the Vercel environment and outputs the correct serverless function format.

```sh
npm run build   # builds to .output/
```
