import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

const USERKEY_HEADER = "x-billing-user-key";
const USERKEY_COOKIE = "tradewithvic_billing_user_key";

export function readUserKey(req: NextRequest): string | null {
  const header = req.headers.get(USERKEY_HEADER);
  if (header) return header;
  const cookie = req.cookies.get(USERKEY_COOKIE)?.value;
  return cookie ?? null;
}

/** Resolve the billing account for the request; create one if this is the user's first call. */
export async function getOrCreateBillingAccount(req: NextRequest) {
  const userKey = readUserKey(req);
  if (!userKey) return null;
  let account = await prisma.billingAccount.findUnique({ where: { userKey } });
  if (account) return account;
  account = await prisma.billingAccount.create({ data: { userKey } });
  return account;
}

/**
 * Append a transaction and keep the account balances consistent. Use inside a
 * transaction when the caller already has one.
 */
export async function postTransaction(opts: {
  billingAccountId: string;
  userKey: string;
  transactionType: "deposit" | "withdrawal" | "fee" | "refund" | "adjustment";
  amount: number;
  currency?: string;
  status?: string;
  description?: string;
  referenceType?: string;
  referenceId?: string;
  metadata?: Record<string, unknown>;
}) {
  return prisma.billingTransaction.create({
    data: {
      billingAccountId: opts.billingAccountId,
      userKey: opts.userKey,
      transactionType: opts.transactionType,
      amount: opts.amount,
      currency: opts.currency ?? "USD",
      status: opts.status ?? "completed",
      description: opts.description,
      referenceType: opts.referenceType,
      referenceId: opts.referenceId,
      metadataJson: JSON.stringify(opts.metadata ?? {}),
    },
  });
}
