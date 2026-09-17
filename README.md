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

Requires Node.js 20+ and npm (or bun).

```sh
git clone <repository-url>
cd citation
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deployment

Deployed to Vercel. Push to `main` to trigger a build. The `nitro()` plugin auto-detects the Vercel environment and outputs the correct serverless function format.

```sh
npm run build   # builds to .output/
```
