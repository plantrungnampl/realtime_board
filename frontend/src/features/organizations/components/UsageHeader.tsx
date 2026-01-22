import { useTranslation } from "react-i18next";

import type { StatusMessage } from "@/features/organizations/organizationMembers.types";
import type { OrganizationUsage } from "@/features/organizations/types";

type UsageCard = {
  key: "members" | "boards" | "storage";
  label: string;
  used: number;
  limit: number;
  warning: boolean;
  unit?: string;
  queued?: number;
};

type UsageHeaderProps = {
  usage: OrganizationUsage | null;
  status: StatusMessage | null;
  queuedInvites: number;
};

export function UsageHeader({ usage, status, queuedInvites }: UsageHeaderProps) {
  const { t } = useTranslation();

  if (!usage && !status) {
    return null;
  }

  const usageCards: UsageCard[] = usage
    ? [
        {
          key: "members",
          label: t("org.usageMembers"),
          used: usage.members_used,
          limit: usage.members_limit,
          warning: usage.members_warning,
          queued: queuedInvites,
        },
        {
          key: "boards",
          label: t("org.usageBoards"),
          used: usage.boards_used,
          limit: usage.boards_limit,
          warning: usage.boards_warning,
          queued: 0,
        },
        {
          key: "storage",
          label: t("org.usageStorage"),
          used: usage.storage_used_mb,
          limit: usage.storage_limit_mb,
          warning: usage.storage_warning,
          unit: "mb",
          queued: 0,
        },
      ]
    : [];

  const usageWarningResources = usage
    ? [
        usage.members_warning ? t("org.usageMembers") : null,
        usage.boards_warning ? t("org.usageBoards") : null,
        usage.storage_warning ? t("org.usageStorage") : null,
      ].filter((value): value is string => Boolean(value))
    : [];

  return (
    <section className="rounded-2xl border border-border bg-surface p-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold text-text-primary">
          {t("org.usageTitle")}
        </h2>
        <p className="text-sm text-text-secondary">{t("org.usageSubtitle")}</p>
      </div>

      {status && (
        <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          {status.message}
        </div>
      )}

      {usage && (
        <>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {usageCards.map((item) => {
              const percent = getUsagePercent(item.used, item.limit);
              return (
                <div
                  key={item.key}
                  className="rounded-xl border border-border bg-bg-base p-4"
                >
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-text-secondary">{item.label}</span>
                    <span
                      className={
                        item.warning
                          ? "text-yellow-400 font-medium"
                          : "text-text-muted"
                      }
                    >
                      {formatUsageLabel(
                        item.used,
                        item.limit,
                        item.unit,
                        item.queued,
                        t,
                      )}
                    </span>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-border/60">
                    <div
                      className={
                        item.warning
                          ? "h-full rounded-full bg-yellow-400"
                          : "h-full rounded-full bg-text-secondary/70"
                      }
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {usageWarningResources.length > 0 && (
            <div className="mt-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-300">
              {t("org.usageWarning", {
                resources: usageWarningResources.join(", "),
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function getUsagePercent(used: number, limit: number) {
  if (limit <= 0) {
    return 0;
  }

  const percent = Math.round((used / limit) * 100);
  return Math.min(100, Math.max(0, percent));
}

function formatUsageLabel(
  used: number,
  limit: number,
  unit: string | undefined,
  queued: number | undefined,
  t: (key: string, options?: Record<string, string>) => string,
) {
  const usedLabel = formatUsageValue(used, unit);
  if (queued && queued > 0) {
    if (limit <= 0) {
      return t("org.usageUnlimitedQueued", {
        used: usedLabel,
        queued: queued.toString(),
      });
    }

    const limitLabel = formatUsageValue(limit, unit);
    return t("org.usageLimitQueued", {
      used: usedLabel,
      limit: limitLabel,
      queued: queued.toString(),
    });
  }
  if (limit <= 0) {
    return t("org.usageUnlimited", { used: usedLabel });
  }

  const limitLabel = formatUsageValue(limit, unit);
  return t("org.usageLimit", { used: usedLabel, limit: limitLabel });
}

function formatUsageValue(value: number, unit: string | undefined) {
  if (unit === "mb") {
    return formatStorage(value);
  }

  return value.toString();
}

function formatStorage(value: number) {
  if (value >= 1024) {
    return `${(value / 1024).toFixed(1)} GB`;
  }

  return `${value} MB`;
}
