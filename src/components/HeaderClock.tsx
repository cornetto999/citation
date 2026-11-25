import { useEffect, useState } from "react";

const dateFormatter = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});
const timeFormatter = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
});

export function HeaderClock() {
  // Render the same placeholder on the server and first client render.
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const update = () => setNow(new Date());
    update();
    const timer = window.setInterval(update, 1000);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);

  return (
    <div
      role="timer"
      aria-label="Current date and time in the Philippines"
      aria-live="off"
      className="no-print min-h-5 text-[11px] leading-5 text-sidebar-foreground tabular-nums sm:text-xs"
    >
      {now ? (
        <time
          dateTime={now.toISOString()}
          className="flex flex-wrap items-center justify-end gap-x-2"
        >
          <span className="whitespace-nowrap">{dateFormatter.format(now)}</span>
          <span aria-hidden="true">·</span>
          <span className="whitespace-nowrap">{timeFormatter.format(now)}</span>
          <span title="Philippine time (UTC+8)">PHT</span>
        </time>
      ) : (
        <span>Philippine date &amp; time</span>
      )}
    </div>
  );
}
