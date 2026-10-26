"use client";

import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@karakeep/trpc/routers/_app";
import { CapturedSkeleton } from "@/components/loading-ui/CapturedSkeleton";
import bones from "@/components/loading-ui/bones/subscription.bones.json";
import priceBones from "@/components/loading-ui/bones/subscription-price.bones.json";

import { useEffect, useState } from "react";
import { toast } from "@/components/ui/sonner";
import { useTranslation } from "@/lib/i18n/client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Loader2 } from "lucide-react";

import { useTRPC } from "@karakeep/shared-react/trpc";

import { Alert, AlertDescription } from "../ui/alert";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import { SettingsSection } from "./SettingsPage";

export default function SubscriptionSettings() {
  const api = useTRPC();
  const { t } = useTranslation();
  const {
    data: subscriptionStatus,
    refetch,
    isLoading: isQueryLoading,
  } = useQuery(api.subscriptions.getSubscriptionStatus.queryOptions());

  const { data: subscriptionPrice } = useQuery(
    api.subscriptions.getSubscriptionPrice.queryOptions(),
  );

  const { mutate: syncStripeState } = useMutation(
    api.subscriptions.syncWithStripe.mutationOptions({
      onSuccess: () => {
        refetch();
      },
    }),
  );
  const createCheckoutSession = useMutation(
    api.subscriptions.createCheckoutSession.mutationOptions({
      onSuccess: (resp) => {
        if (resp.url) {
          window.location.href = resp.url;
        }
      },
      onError: () => {
        toast({
          description: t("common.something_went_wrong"),
          variant: "destructive",
        });
      },
    }),
  );
  const createPortalSession = useMutation(
    api.subscriptions.createPortalSession.mutationOptions({
      onSuccess: (resp) => {
        if (resp.url) {
          window.location.href = resp.url;
        }
      },
      onError: () => {
        toast({
          description: t("common.something_went_wrong"),
          variant: "destructive",
        });
      },
    }),
  );

  const isLoading =
    createCheckoutSession.isPending || createPortalSession.isPending;

  useEffect(() => {
    syncStripeState();
  }, []);

  return (
    <SettingsSection
      title={t("settings.subscription.subscription")}
      description={t("settings.subscription.manage_subscription")}
    >
      {isQueryLoading ? (
        <CapturedSkeleton name="subscription" bones={bones} />
      ) : (
        <SubscriptionDetails
          subscriptionStatus={subscriptionStatus}
          subscriptionPrice={subscriptionPrice}
          isLoading={isLoading}
          onCheckout={(billingPeriod) =>
            createCheckoutSession.mutate({ billingPeriod })
          }
          onPortal={() => createPortalSession.mutate()}
        />
      )}
    </SettingsSection>
  );
}

export function SubscriptionDetails({
  subscriptionStatus,
  subscriptionPrice,
  isLoading,
  onCheckout,
  onPortal,
}: {
  subscriptionStatus:
    | inferRouterOutputs<AppRouter>["subscriptions"]["getSubscriptionStatus"]
    | undefined;
  subscriptionPrice:
    | inferRouterOutputs<AppRouter>["subscriptions"]["getSubscriptionPrice"]
    | undefined;
  isLoading: boolean;
  onCheckout: (period: "monthly" | "yearly") => void;
  onPortal: () => void;
}) {
  const { t } = useTranslation();
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">(
    "monthly",
  );
  const hasYearlyPricing = !!subscriptionPrice?.yearly;

  const currentPrice =
    billingPeriod === "yearly" && subscriptionPrice?.yearly
      ? subscriptionPrice.yearly
      : subscriptionPrice?.monthly;

  const formatDate = (date: Date | null) => {
    if (!date) return "N/A";
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    }).format(date);
  };

  const getStatusBadge = (status: "free" | "paid") => {
    switch (status) {
      case "paid":
        return (
          <Badge variant="default" className="bg-green-500">
            {t("settings.subscription.paid")}
          </Badge>
        );
      case "free":
        return (
          <Badge variant="outline">{t("settings.subscription.free")}</Badge>
        );
    }
  };

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium">
            {t("settings.subscription.current_plan")}
          </label>
          <div className="flex items-center gap-2">
            {subscriptionStatus?.tier &&
              getStatusBadge(subscriptionStatus.tier)}
          </div>
        </div>

        {subscriptionStatus?.hasActiveSubscription && (
          <>
            <div className="space-y-2">
              <label className="text-sm font-medium">
                {t("settings.subscription.billing_period")}
              </label>
              <div className="text-sm text-muted-foreground">
                {formatDate(subscriptionStatus.startDate)} -{" "}
                {formatDate(subscriptionStatus.endDate)}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="space-y-4">
        {!subscriptionStatus?.hasActiveSubscription ? (
          <div className="space-y-4">
            <div className="rounded-lg border p-4">
              <h3 className="font-semibold">
                {t("settings.subscription.paid_plan")}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("settings.subscription.unlock_bigger_quota")}
              </p>

              <ul className="mt-4 space-y-1.5">
                {(
                  ["pro_feature_bookmarks", "pro_feature_storage"] as const
                ).map((key) => (
                  <li key={key} className="flex items-center text-sm">
                    <Check className="mr-2 h-4 w-4 shrink-0 text-green-500" />
                    {t(`settings.subscription.${key}`)}
                  </li>
                ))}
              </ul>

              <div className="mt-4 flex flex-col items-start gap-4 border-t pt-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  {hasYearlyPricing && (
                    <div className="mb-2 inline-flex items-center rounded-lg bg-muted p-1">
                      <Button
                        type="button"
                        size="sm"
                        variant={
                          billingPeriod === "monthly" ? "outline" : "ghost"
                        }
                        aria-pressed={billingPeriod === "monthly"}
                        onClick={() => setBillingPeriod("monthly")}
                      >
                        {t("settings.subscription.monthly")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={
                          billingPeriod === "yearly" ? "outline" : "ghost"
                        }
                        aria-pressed={billingPeriod === "yearly"}
                        onClick={() => setBillingPeriod("yearly")}
                      >
                        {t("settings.subscription.yearly")}
                        {subscriptionPrice?.monthly?.amount &&
                          subscriptionPrice?.yearly?.amount && (
                            <span className="ml-1.5 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                              {t("settings.subscription.yearly_savings", {
                                percent: Math.round(
                                  (1 -
                                    subscriptionPrice.yearly.amount /
                                      (subscriptionPrice.monthly.amount * 12)) *
                                    100,
                                ),
                              })}
                            </span>
                          )}
                      </Button>
                    </div>
                  )}
                  {currentPrice && currentPrice.amount ? (
                    <SubscriptionPrice
                      amount={currentPrice.amount}
                      currency={currentPrice.currency}
                      billingPeriod={billingPeriod}
                    />
                  ) : (
                    <CapturedSkeleton
                      name="subscription-price"
                      bones={priceBones}
                      fallback={<Skeleton className="h-6 w-24" />}
                      className="w-24"
                    />
                  )}
                </div>
                <Button
                  onClick={() => onCheckout(billingPeriod)}
                  disabled={isLoading}
                  size="lg"
                  className="ease-(--ease-out) shadow-md transition-[transform,box-shadow] duration-200 hover:scale-[1.02] hover:shadow-lg active:scale-[0.98]"
                >
                  {isLoading && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {t("settings.subscription.subscribe_now")}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button
                onClick={() => onPortal()}
                disabled={isLoading}
                variant="outline"
              >
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("settings.subscription.manage_billing")}
              </Button>
            </div>

            {subscriptionStatus.cancelAtPeriodEnd && (
              <Alert>
                <AlertDescription>
                  {t("settings.subscription.subscription_canceled", {
                    date: formatDate(subscriptionStatus.endDate),
                  })}
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}
      </div>
    </>
  );
}

export function SubscriptionPrice({
  amount,
  currency,
  billingPeriod,
}: {
  amount: number;
  currency: string;
  billingPeriod: "monthly" | "yearly";
}) {
  const { t } = useTranslation();
  return (
    <span className="flex flex-wrap items-baseline gap-2">
      <SubscriptionPriceAmount amount={amount} currency={currency} />
      <span className="text-sm text-muted-foreground">
        /
        {billingPeriod === "yearly"
          ? t("settings.subscription.per_year")
          : t("settings.subscription.per_month")}
      </span>
      <span className="text-xs italic text-muted-foreground">
        ({t("settings.subscription.excl_vat")})
      </span>
    </span>
  );
}

export function SubscriptionPriceAmount({
  amount,
  currency,
}: {
  amount: number;
  currency: string;
}) {
  return (
    <span className="text-2xl font-bold">
      {amount / 100} {currency.toUpperCase()}
    </span>
  );
}
