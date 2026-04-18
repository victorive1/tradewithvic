"use client";

import { useEffect, useState } from "react";
import { loadStripe, type Stripe, type StripeElements } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";

interface Props {
  userKey: string;
  amount: number;
  savePaymentMethod?: boolean;
  onSuccess: (paymentIntentId: string) => void;
  onError?: (message: string) => void;
}

export function StripeCardForm(props: Props) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [publishableKey, setPublishableKey] = useState<string | null>(null);
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function mint() {
      try {
        const res = await fetch("/api/billing/stripe/payment-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-billing-user-key": props.userKey },
          body: JSON.stringify({ amount: props.amount, savePaymentMethod: props.savePaymentMethod }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.error ?? `stripe_intent_${res.status}`);
        }
        const data = await res.json();
        if (cancelled) return;
        setClientSecret(data.clientSecret);
        setPublishableKey(data.publishableKey);
        if (data.publishableKey) {
          setStripePromise(loadStripe(data.publishableKey));
        } else {
          setConfigError("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set in Vercel env vars.");
        }
      } catch (e: any) {
        if (!cancelled) setConfigError(e?.message ?? "Failed to initialize Stripe");
      }
    }
    mint();
    return () => { cancelled = true; };
  }, [props.userKey, props.amount, props.savePaymentMethod]);

  if (configError) {
    return (
      <div className="rounded-xl border border-bear/40 bg-bear/5 p-4 text-xs text-bear-light">
        <div className="font-semibold mb-1">Stripe unavailable</div>
        <div>{configError}</div>
      </div>
    );
  }
  if (!clientSecret || !stripePromise || !publishableKey) {
    return (
      <div className="rounded-xl border border-border bg-surface-2 p-4 text-xs text-muted">
        Initializing secure card form…
      </div>
    );
  }

  return (
    <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: "night" } }}>
      <InnerCardForm {...props} />
    </Elements>
  );
}

function InnerCardForm({ onSuccess, onError }: Pick<Props, "onSuccess" | "onError">) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);
    try {
      const { error: stripeError, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: typeof window !== "undefined" ? `${window.location.origin}/dashboard/payments?deposit=success` : "https://tradewithvic.com/dashboard/payments?deposit=success",
        },
        redirect: "if_required",
      });
      if (stripeError) {
        setError(stripeError.message ?? "Payment failed");
        onError?.(stripeError.message ?? "Payment failed");
      } else if (paymentIntent && paymentIntent.status === "succeeded") {
        onSuccess(paymentIntent.id);
      } else if (paymentIntent && paymentIntent.status === "processing") {
        // For async payment methods — the webhook will credit on confirmation
        onSuccess(paymentIntent.id);
      }
    } catch (e: any) {
      setError(e?.message ?? "Payment failed");
      onError?.(e?.message ?? "Payment failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-3">
      <PaymentElement />
      {error && <div className="text-xs text-bear-light">{error}</div>}
      <button onClick={submit} disabled={submitting || !stripe || !elements}
        className="btn-primary w-full">
        {submitting ? "Processing…" : "Pay with card"}
      </button>
      <p className="text-[10px] text-muted text-center">
        Your card data is handled directly by Stripe — we never see PAN or CVV. Stripe charges 2.9% + $0.30 per successful US card transaction.
      </p>
    </div>
  );
}
