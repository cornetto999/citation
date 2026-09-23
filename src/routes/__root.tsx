import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Loader2, ShieldCheck, Home, RefreshCw } from "lucide-react";

import appCss from "../styles.css?url";
function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-authority px-4">
      <div className="animate-fade-in-up max-w-md text-center">
        <div className="mx-auto mb-6 flex size-20 items-center justify-center rounded-2xl glass-dark">
          <ShieldCheck className="size-10 text-sidebar-primary" />
        </div>
        <h1 className="font-display text-7xl font-bold tracking-tight text-primary-foreground">
          404
        </h1>
        <h2 className="mt-3 text-xl font-semibold text-primary-foreground/90">
          Page not found
        </h2>
        <p className="mt-2 text-sm text-primary-foreground/60">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-8">
          <Link
            to="/"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/10 px-6 py-3 text-sm font-semibold text-primary-foreground backdrop-blur-sm transition-all hover:bg-white/20 hover:shadow-glow"
          >
            <Home className="size-4" />
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-authority px-4">
      <div className="animate-scale-in max-w-md text-center">
        <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl bg-destructive/20 backdrop-blur-sm">
          <span className="text-3xl">⚠</span>
        </div>
        <h1 className="font-display text-xl font-bold tracking-tight text-primary-foreground">
          Something went wrong
        </h1>
        <p className="mt-2 text-sm text-primary-foreground/60">
          An unexpected error occurred. You can try refreshing or head back
          home.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/10 px-5 py-2.5 text-sm font-semibold text-primary-foreground backdrop-blur-sm transition-all hover:bg-white/20"
          >
            <RefreshCw className="size-4" />
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:bg-white/10"
          >
            <Home className="size-4" />
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

function PendingComponent() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-authority">
      <div className="flex flex-col items-center gap-5 animate-fade-in">
        <div className="relative">
          <div className="absolute inset-0 rounded-2xl bg-sidebar-primary/20 blur-xl animate-pulse-soft" />
          <div className="relative flex size-16 items-center justify-center rounded-2xl glass-dark">
            <ShieldCheck className="size-8 text-sidebar-primary animate-pulse" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Loader2 className="size-4 animate-spin text-primary-foreground/60" />
          <p className="text-sm font-medium text-primary-foreground/60">
            Loading…
          </p>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    head: () => ({
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { title: "Citation System" },
        { name: "description", content: "Traffic Citation System" },
        { property: "og:title", content: "Citation System" },
        { property: "og:description", content: "Traffic Citation System" },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [
        { rel: "preconnect", href: "https://fonts.googleapis.com" },
        {
          rel: "preconnect",
          href: "https://fonts.gstatic.com",
          crossOrigin: "anonymous",
        },
        {
          rel: "stylesheet",
          href: appCss,
        },
        { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      ],
    }),
    shellComponent: RootShell,
    component: RootComponent,
    notFoundComponent: NotFoundComponent,
    errorComponent: ErrorComponent,
    pendingComponent: PendingComponent,
  },
);

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    import("@/store/useTicketStore").then(({ useTicketStore }) => {
      useTicketStore.getState().fetchTickets();
      useTicketStore.getState().subscribeToRealtime();
    });
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
    </QueryClientProvider>
  );
}
