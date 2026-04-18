/**
 * Thin BitPay REST client — just the two endpoints we need (create invoice +
 * fetch invoice state) so we don't pull in bitpay-sdk's heavy deps.
 *
 * Docs: https://bitpay.com/api
 *
 * Env:
 *   BITPAY_TOKEN    merchant facade token from BitPay dashboard
 *   BITPAY_ENV      "prod" (default) or "test"
 *   BITPAY_WEBHOOK_SECRET optional secret you also set in the BitPay IPN
 *                          configuration; we verify it on inbound webhooks
 */

export function isBitPayConfigured(): boolean {
  return Boolean(process.env.BITPAY_TOKEN);
}

function baseUrl(): string {
  const env = (process.env.BITPAY_ENV ?? "prod").toLowerCase();
  return env === "test" ? "https://test.bitpay.com" : "https://bitpay.com";
}

export interface BitPayInvoicePayload {
  price: number;
  currency: string;
  orderId?: string;
  notificationURL?: string;
  redirectURL?: string;
  buyerEmail?: string;
  itemDesc?: string;
}

export interface BitPayInvoice {
  id: string;
  status: string;
  url: string;
  price: number;
  currency: string;
  orderId?: string;
  invoiceTime?: number;
  expirationTime?: number;
}

async function bitpayFetch(path: string, init: RequestInit = {}): Promise<any> {
  const token = process.env.BITPAY_TOKEN;
  if (!token) throw new Error("BITPAY_TOKEN not configured");

  const res = await fetch(baseUrl() + path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Accept-Version": "2.0.0",
      ...(init.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`BitPay ${res.status}: ${body?.error ?? JSON.stringify(body)}`);
  }
  return body;
}

export async function createBitPayInvoice(payload: BitPayInvoicePayload): Promise<BitPayInvoice> {
  const token = process.env.BITPAY_TOKEN!;
  const body = {
    token,
    price: payload.price,
    currency: payload.currency,
    orderId: payload.orderId,
    notificationURL: payload.notificationURL,
    redirectURL: payload.redirectURL,
    buyerEmail: payload.buyerEmail,
    itemDesc: payload.itemDesc,
  };
  const json = await bitpayFetch("/invoices", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const data = json?.data ?? json;
  return {
    id: data.id,
    status: data.status,
    url: data.url,
    price: data.price,
    currency: data.currency,
    orderId: data.orderId,
    invoiceTime: data.invoiceTime,
    expirationTime: data.expirationTime,
  };
}

export async function getBitPayInvoice(invoiceId: string): Promise<BitPayInvoice | null> {
  const token = process.env.BITPAY_TOKEN!;
  const json = await bitpayFetch(`/invoices/${invoiceId}?token=${encodeURIComponent(token)}`);
  const data = json?.data ?? json;
  if (!data?.id) return null;
  return {
    id: data.id,
    status: data.status,
    url: data.url,
    price: data.price,
    currency: data.currency,
    orderId: data.orderId,
    invoiceTime: data.invoiceTime,
    expirationTime: data.expirationTime,
  };
}
