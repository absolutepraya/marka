import { PageHeader } from "@/components/shared/PageHeader";
import { cn } from "@/lib/utils";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";

export function SettingsPage({
  title,
  description,
  icon,
  action,
  children,
}: {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-5">
      <PageHeader
        title={title}
        description={description}
        icon={icon}
        action={action}
        variant="settings"
      />
      {children}
    </div>
  );
}

export function SettingsSection({
  title,
  description,
  action,
  children,
  variant = "default",
  className,
  contentClassName,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  variant?: "default" | "danger";
  className?: string;
  contentClassName?: string;
}) {
  const hasHeader = !!(title || description || action);

  return (
    <Card
      className={cn(
        "shadow-xs rounded-xl border-border/80 bg-card",
        variant === "danger" && "border-destructive/25 bg-destructive/[0.03]",
        className,
      )}
    >
      {hasHeader && (
        <CardHeader className="gap-3 border-b border-border/70 px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
          <div className="min-w-0 space-y-1">
            {title && (
              <CardTitle
                className={cn(
                  "text-base font-semibold tracking-tight",
                  variant === "danger" && "text-destructive",
                )}
              >
                {title}
              </CardTitle>
            )}
            {description && (
              <CardDescription className="max-w-2xl leading-6">
                {description}
              </CardDescription>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </CardHeader>
      )}
      <CardContent
        className={cn(
          "space-y-3 px-5 py-4",
          hasHeader && "pt-4",
          contentClassName,
        )}
      >
        {children}
      </CardContent>
    </Card>
  );
}
