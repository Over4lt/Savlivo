import type {
  ActionPreview,
  ActionType,
  Capability,
  SavlivoPlan
} from "../../../packages/contracts/src/index.js";
import {
  resolveProvider,
  type ProviderContext
} from "../../../packages/provider-sdk/src/index.js";

const rank: Record<SavlivoPlan, number> = {
  VIEWER: 0,
  MANUAL: 1,
  PREMIUM: 2
};

export function requiresManual(plan: SavlivoPlan) {
  return rank[plan] >= rank.MANUAL;
}

export function requiresPremium(plan: SavlivoPlan) {
  return rank[plan] >= rank.PREMIUM;
}

export async function getCapabilities(
  ctx: ProviderContext
): Promise<Capability[]> {
  return resolveProvider(ctx).capabilities(ctx);
}

export async function previewAction(args: {
  ctx: ProviderContext;
  plan: SavlivoPlan;
  serviceName: string;
  action: ActionType;
}): Promise<ActionPreview> {
  if (!requiresManual(args.plan)) {
    throw new Error("PAID_PLAN_REQUIRED");
  }

  const adapter = resolveProvider(args.ctx);
  const caps = await adapter.capabilities(args.ctx);
  const capability = caps.find((c) => c.action === args.action);

  if (!capability || !capability.supported) {
    return {
      action: args.action,
      subscriptionId: args.ctx.subscriptionId,
      serviceName: args.serviceName,
      billingProvider: args.ctx.billingProviderSlug,
      execution: "UNSUPPORTED",
      requiresConfirmation: false,
      premiumRequired: false,
      explanation: capability?.reason ?? "Action is not supported."
    };
  }

  if (capability.premiumOnly && !requiresPremium(args.plan)) {
    return {
      action: args.action,
      subscriptionId: args.ctx.subscriptionId,
      serviceName: args.serviceName,
      billingProvider: args.ctx.billingProviderSlug,
      execution: capability.execution,
      requiresConfirmation: false,
      premiumRequired: true,
      explanation: "This action requires Savlivo Premium."
    };
  }

  const prepared = await adapter.prepare(args.ctx, args.action);

  return {
    action: args.action,
    subscriptionId: args.ctx.subscriptionId,
    serviceName: args.serviceName,
    billingProvider: args.ctx.billingProviderSlug,
    execution: prepared.execution,
    requiresConfirmation: prepared.requiresConfirmation,
    premiumRequired: false,
    redirectUrl: prepared.redirectUrl,
    explanation: prepared.explanation
  };
}
