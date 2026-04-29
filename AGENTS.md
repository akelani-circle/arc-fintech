# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start development server (port 3000)
npm run build    # Production build
npm run lint     # ESLint checks
```

No test suite is configured. Type-check with `npx tsc --noEmit`.

## Environment Setup

Copy `.env.example` to `.env.local` and populate:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # server-side only
CIRCLE_API_KEY=                   # server-side only
CIRCLE_ENTITY_SECRET=             # server-side only
```

## Architecture

**Arc Fintech** is a multi-chain treasury management app built on Next.js App Router. It connects two external services:

- **Circle** — developer-controlled wallets, cross-chain bridging, Gateway (on/off-ramp), and compliance screening
- **Supabase** — auth (email/password), PostgreSQL (wallets, transactions, compliance_logs, webhook_events), and Realtime subscriptions for live UI updates

### Request Flow

All sensitive operations go through Next.js API routes (`app/api/`), never directly from the browser. The API routes call Circle SDKs and Supabase with service-role credentials. The frontend uses only the anon/publishable Supabase key.

### Key API Route Groups

| Route | Purpose |
|---|---|
| `api/wallet/` | Create wallets, fetch balances, transfer, validate addresses |
| `api/wallet-set/` | Create Circle wallet sets |
| `api/gateway/` | Gateway deposit and balance |
| `api/bridge/` | Cross-chain rebalancing (estimate, execute, monitor) |
| `api/compliance/` | AML screening and audit logs |
| `api/circle/webhook` | Receive and store Circle webhook events |

### State Management

`BalanceContext` (`lib/contexts/`) is the single source of truth for gateway and wallet balances. It:
- Opens one Supabase Realtime subscription for the whole app
- Debounces balance refreshes (3 s delay, 5 s cooldown) to avoid hammering Circle's API
- Tracks processed transaction IDs to prevent duplicate updates

### Database

Supabase tables all have RLS enabled — users can only read/write their own rows. Schema migrations live in `supabase/migrations/`.

### Supported Networks (testnet only)

`ETH-SEPOLIA`, `BASE-SEPOLIA`, `AVAX-FUJI`, `ARC-TESTNET` — chain constants (USDC addresses, domain IDs, RPC endpoints) are in `lib/constants/`.

### UI Conventions

- shadcn/ui (New York style, neutral) with Tailwind CSS v4
- Dialogs in `components/dialogs/` handle create/edit flows
- Toast notifications via Sonner
- Charts via Recharts; data tables via TanStack React Table
- Dark/light mode via next-themes; sidebar via shadcn Sidebar component
