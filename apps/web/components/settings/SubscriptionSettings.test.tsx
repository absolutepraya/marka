// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SubscriptionDetails } from "./SubscriptionSettings";

vi.mock("@/components/ui/sonner", () => ({ toast: vi.fn() }));
vi.mock("@/lib/i18n/client", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@karakeep/shared-react/trpc", () => ({
  useTRPC: () => {
    throw new Error("Presentation must not fetch or mutate data");
  },
}));
beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const subscriptionPrice = {
  monthly: { priceId: "monthly", currency: "usd", amount: 500 },
  yearly: { priceId: "yearly", currency: "usd", amount: 5000 },
};
const free = {
  tier: "free" as const,
  status: null,
  startDate: null,
  endDate: null,
  hasActiveSubscription: false,
  cancelAtPeriodEnd: false,
};

describe("subscription presentation", () => {
  it("preserves the selected billing period for checkout without fetching data", () => {
    const checkout = vi.fn();
    const view = render(
      <SubscriptionDetails
        subscriptionStatus={free}
        subscriptionPrice={subscriptionPrice}
        isLoading={false}
        onCheckout={checkout}
        onPortal={vi.fn()}
      />,
    );
    fireEvent.click(
      view.getByRole("button", { name: /settings.subscription.yearly/ }),
    );
    fireEvent.click(
      view.getByRole("button", { name: "settings.subscription.subscribe_now" }),
    );
    expect(checkout).toHaveBeenCalledWith("yearly");
  });
  it("keeps billing management and the pending guard for active subscriptions", () => {
    const portal = vi.fn();
    const props = {
      subscriptionStatus: {
        ...free,
        tier: "paid" as const,
        status: "active" as const,
        hasActiveSubscription: true,
      },
      subscriptionPrice,
      onCheckout: vi.fn(),
      onPortal: portal,
    };
    const view = render(<SubscriptionDetails {...props} isLoading={false} />);
    fireEvent.click(
      view.getByRole("button", {
        name: "settings.subscription.manage_billing",
      }),
    );
    expect(portal).toHaveBeenCalledOnce();
    view.rerender(<SubscriptionDetails {...props} isLoading />);
    expect(
      (
        view.getByRole("button", {
          name: "settings.subscription.manage_billing",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
});
