import type { ActionType, Capability, ExecutionType } from "../../contracts/src";

export interface ProviderContext {
  subscriptionId: string;
  serviceSlug: string;
  billingProviderSlug: string;
  countryCode?: string;
  planName?: string;
}

export interface ProviderActionResult {
  execution: ExecutionType;
  requiresConfirmation: boolean;
  redirectUrl?: string;
  providerPayload?: Record<string, unknown>;
  explanation: string;
}

export interface ProviderAdapter {
  readonly id: string;
  supports(ctx: ProviderContext): boolean;
  capabilities(ctx: ProviderContext): Promise<Capability[]>;
  prepare(
    ctx: ProviderContext,
    action: ActionType
  ): Promise<ProviderActionResult>;
}

const commonDirectCapabilities: Capability[] = [
  { action: "PAUSE", supported: true, execution: "DIRECT" },
  { action: "CANCEL", supported: true, execution: "DIRECT" },
  { action: "REACTIVATE", supported: true, execution: "DIRECT" },
];

export class NetflixDirectMockAdapter implements ProviderAdapter {
  readonly id = "netflix-direct-mock";

  supports(ctx: ProviderContext) {
    return ctx.serviceSlug === "netflix" && ctx.billingProviderSlug === "direct";
  }

  async capabilities() {
    return commonDirectCapabilities;
  }

  async prepare(ctx: ProviderContext, action: ActionType) {
    return {
      execution: "DIRECT" as const,
      requiresConfirmation: true,
      explanation:
        `Mock direct flow for ${action.toLowerCase()} on Netflix. ` +
        "Production implementation must use a supported provider integration."
    };
  }
}

export class ApplePlatformMockAdapter implements ProviderAdapter {
  readonly id = "apple-platform-mock";

  supports(ctx: ProviderContext) {
    return ctx.billingProviderSlug === "apple";
  }

  async capabilities(): Promise<Capability[]> {
    return [
      {
        action: "PAUSE",
        supported: false,
        execution: "UNSUPPORTED",
        reason: "Provider-specific pause may not be available through Apple."
      },
      {
        action: "CANCEL",
        supported: true,
        execution: "PROVIDER_REDIRECT"
      },
      {
        action: "REACTIVATE",
        supported: true,
        execution: "PROVIDER_REDIRECT"
      }
    ];
  }

  async prepare(_: ProviderContext, action: ActionType) {
    if (action === "PAUSE") {
      return {
        execution: "UNSUPPORTED" as const,
        requiresConfirmation: false,
        explanation: "Pause is not supported for this billing route."
      };
    }

    return {
      execution: "PROVIDER_REDIRECT" as const,
      requiresConfirmation: true,
      redirectUrl: "https://apps.apple.com/account/subscriptions",
      explanation:
        "Apple manages this subscription. Savlivo routes the user to Apple's subscription management."
    };
  }
}

export class DisneyPremiumMockAdapter implements ProviderAdapter {
  readonly id = "disney-premium-mock";

  supports(ctx: ProviderContext) {
    return ctx.serviceSlug === "disney-plus" && ctx.billingProviderSlug === "direct";
  }

  async capabilities(): Promise<Capability[]> {
    return [
      { action: "PAUSE", supported: true, execution: "DIRECT", premiumOnly: true },
      { action: "CANCEL", supported: true, execution: "DIRECT" },
      { action: "REACTIVATE", supported: true, execution: "DIRECT" }
    ];
  }

  async prepare(_: ProviderContext, action: ActionType) {
    return {
      execution: "DIRECT" as const,
      requiresConfirmation: true,
      explanation:
        action === "PAUSE"
          ? "Premium-eligible mock flow: pause may be scheduled by Autopilot."
          : `Mock direct ${action.toLowerCase()} flow for Disney+.`
    };
  }
}

export class FallbackGuidedAdapter implements ProviderAdapter {
  readonly id = "fallback-guided";

  supports() {
    return true;
  }

  async capabilities(): Promise<Capability[]> {
    return [
      { action: "PAUSE", supported: false, execution: "UNSUPPORTED" },
      { action: "CANCEL", supported: true, execution: "GUIDED" },
      { action: "REACTIVATE", supported: true, execution: "GUIDED" }
    ];
  }

  async prepare(_: ProviderContext, action: ActionType) {
    if (action === "PAUSE") {
      return {
        execution: "UNSUPPORTED" as const,
        requiresConfirmation: false,
        explanation: "Pause is not currently supported for this route."
      };
    }
    return {
      execution: "GUIDED" as const,
      requiresConfirmation: true,
      explanation:
        "Savlivo will guide the user through a verified provider-specific flow."
    };
  }
}

export const providerAdapters: ProviderAdapter[] = [
  new NetflixDirectMockAdapter(),
  new ApplePlatformMockAdapter(),
  new DisneyPremiumMockAdapter(),
  new FallbackGuidedAdapter()
];

export function resolveProvider(ctx: ProviderContext): ProviderAdapter {
  const adapter = providerAdapters.find((candidate) => candidate.supports(ctx));
  if (!adapter) throw new Error("No provider adapter available");
  return adapter;
}
