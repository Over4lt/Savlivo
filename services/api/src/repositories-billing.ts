import { pool } from "./db.js";
import type { SavlivoPlan } from "../../../packages/contracts/src/index.js";

export async function applyVerifiedPurchase(args: {
  userId: string;
  platform: "IOS" | "ANDROID";
  productId: string;
  externalTransactionId: string;
  expiresAt?: string;
  plan: SavlivoPlan;
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `INSERT INTO purchase_events (
        user_id, platform, product_id, external_transaction_id, valid, expires_at
      ) VALUES ($1,$2,$3,$4,true,$5)
      ON CONFLICT (platform, external_transaction_id) DO NOTHING`,
      [
        args.userId,
        args.platform,
        args.productId,
        args.externalTransactionId,
        args.expiresAt ?? null
      ]
    );

    await client.query(
      `INSERT INTO entitlements (
        user_id, plan, platform, external_product_id,
        external_transaction_id, status, expires_at, updated_at
      )
      VALUES ($1,$2,$3,$4,$5,'active',$6,now())
      ON CONFLICT (user_id) DO UPDATE SET
        plan = EXCLUDED.plan,
        platform = EXCLUDED.platform,
        external_product_id = EXCLUDED.external_product_id,
        external_transaction_id = EXCLUDED.external_transaction_id,
        status = 'active',
        expires_at = EXCLUDED.expires_at,
        updated_at = now()`,
      [
        args.userId,
        args.plan,
        args.platform.toLowerCase(),
        args.productId,
        args.externalTransactionId,
        args.expiresAt ?? null
      ]
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
