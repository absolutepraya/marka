import type { ReactNode } from "react";
import { BookOpen, Download, Users } from "lucide-react";

export function MetricValue({ children }: { children: ReactNode }) {
  return (
    <p className="text-3xl font-semibold tracking-tight text-foreground">
      {children}
    </p>
  );
}

function MetricTile({
  label,
  value,
  icon,
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
}) {
  return (
    <div className="shadow-xs rounded-xl border border-border/70 bg-background/80 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <div className="flex size-9 items-center justify-center rounded-full border border-border/70 bg-card text-muted-foreground [&_svg]:size-4">
          {icon}
        </div>
      </div>
      {value}
    </div>
  );
}

export function BasicStatsContent({
  numUsers,
  numBookmarks,
  version,
  labels,
}: {
  numUsers: number;
  numBookmarks: number;
  version: ReactNode;
  labels: {
    heading: string;
    users: string;
    bookmarks: string;
    version: string;
  };
}) {
  return (
    <>
      <div className="mb-4 space-y-1">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          {labels.heading}
        </h2>
        <p className="text-sm text-muted-foreground">
          Core usage and release signals for the current instance.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <MetricTile
          label={labels.users}
          value={<MetricValue>{numUsers}</MetricValue>}
          icon={<Users className="h-4 w-4" />}
        />
        <MetricTile
          label={labels.bookmarks}
          value={<MetricValue>{numBookmarks}</MetricValue>}
          icon={<BookOpen className="h-4 w-4" />}
        />
        <MetricTile
          label={labels.version}
          value={version}
          icon={<Download className="h-4 w-4" />}
        />
      </div>
    </>
  );
}

// Capture the real view with synthetic values, without fetching admin data.
export function BasicStatsFixture() {
  return (
    <BasicStatsContent
      numUsers={12}
      numBookmarks={1234}
      version={
        <div className="space-y-2">
          <MetricValue>v1.2.3</MetricValue>
        </div>
      }
      labels={{
        heading: "Server Stats",
        users: "Total Users",
        bookmarks: "Total Bookmarks",
        version: "Server Version",
      }}
    />
  );
}
