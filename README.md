# Swift Ticket Flow

Act as an expert frontend developer and UX architect. I need to design and build the UI and flow for a Citation Ticket and Payment System with Role-Based Access Control (RBAC).

Tech Stack: Next.js 14+ (App Router), React, TypeScript, Tailwind CSS, and Zustand (for global state management).

Important Constraint: For this phase, use mock data only. Do not connect to any external database or backend API. Use Zustand to simulate a global database so that when a ticket is created in one dashboard, it instantly appears in the others.

1. Roles, Dashboards, & UX Requirements

Please design distinct, role-isolated dashboards using Next.js route groups.

Traffic Enforcer (Private): Needs a mobile-first, highly optimized data entry form. Crucial: Make this flow extremely fast for field use. Include large tap targets, simulated autocomplete for vehicle types/violations, a mock photo upload area, and a streamlined "Submit" flow.

PNP / Police (Private): Needs a desktop-optimized, read-only monitoring dashboard. Should feature a data table to view all tickets, filter by status (Unpaid/Paid), and monitor due dates.

Municipal Treasury (Private): Needs a desktop cashier point-of-sale (POS) dashboard. They must be able to quickly search a ticket by ID, review the fine, simulate processing an over-the-counter cash payment, and manually update the ticket status to "Paid".

Violator / Public (Public): Needs a clean, trustworthy public-facing portal. They enter their unique Ticket ID to view ticket details, simulate paying online via QRPh (display a mock QR code), and view a mock electronic Official Receipt (e-OR) once paid.

2. Core Workflow to Simulate

Issuance: Enforcer submits the fast-entry form. The Zustand store pushes a new ticket with a dynamically generated ID and a default "Unpaid" status.

Real-time Sync: Because all dashboards share the Zustand store, the new ticket should immediately reflect on the PNP monitoring table and become searchable by the Treasury and Violator.

Payment & Settlement: When a payment is simulated (via the Treasury cashier or Violator public portal), the ticket status in the store updates to "Paid", instantly reflecting across all views.

3. Required Deliverables

Please provide the following to get me started on the right foot:

Type Definitions (types/index.ts): Robust TypeScript interfaces for User (Roles), Ticket, ViolationCode, and Payment.

Mock Data (lib/mockData.ts): A realistic set of initial dummy data (at least 5 tickets in various states) to pre-populate the Zustand store.

Project Structure: A suggested Next.js App Router folder structure (using (routes) or similar grouping) demonstrating how to isolate the layouts and pages for the 4 different roles.

State Management (store/useTicketStore.ts): A complete Zustand store implementation showing the initial state injection and the actions (addTicket, payTicket) required to make the cross-dashboard sync work.

Enforcer Form Snippet: A code example of the Enforcer's "fast-entry" form to demonstrate how you would implement the speed-optimized mobile UI using Tailwind CSS.

Why these enhancements will get you a better result:

Explicit Route Groups: Asking for route isolation explicitly tells the AI to utilize Next.js App Router's (folder) convention, which is best practice for multi-dashboard apps.

Zustand Specified: Recommending Zustand over React Context prevents the AI from writing boilerplate-heavy Context providers, giving you a much cleaner file for simulating a real-time database.

UX Directives: Translating "make it fast" into specific frontend patterns (mobile-first, large tap targets, autocomplete) ensures the AI writes tailored Tailwind CSS classes rather than a generic HTML form.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/a3c5e313-4771-430e-a5c9-0b64ec4e948f).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
