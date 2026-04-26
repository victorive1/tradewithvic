import { randomBytes } from "crypto";

/**
 * Broker templates — defaults applied at LinkedTradingAccount creation time
 * for known brokers. The goal is that adding a JustMarkets account in the
 * Trading Hub doesn't require an extra "Enable EA Bridge" click; the row is
 * created already wired for ea_webhook with the right symbol overrides and
 * a freshly generated secret ready to paste into the EA.
 *
 * To support a new broker:
 *   1. Add an entry to BROKER_TEMPLATES with the suffix, renames, and the
 *      adapter you want new accounts to use.
 *   2. Existing accounts can be upgraded with scripts/twv-apply-broker-templates.ts.
 */

export interface BrokerTemplate {
  /** Match is case-insensitive on brokerName as stored on LinkedTradingAccount. */
  brokerName: string;
  /** Adapter to use for newly-created accounts under this broker. */
  adapterKind: "ea_webhook" | "metaapi" | "mock" | "pending_queue";
  /** Suffix appended to every routed symbol (e.g. ".ecn", ".pro"). */
  brokerSymbolSuffix: string;
  /**
   * Renames where the symbol differs beyond a suffix. Internal → broker.
   * The suffix is appended after the rename, so values must be bare.
   */
  brokerSymbolRenames: Record<string, string>;
}

export const BROKER_TEMPLATES: BrokerTemplate[] = [
  {
    brokerName: "JustMarkets",
    adapterKind: "ea_webhook",
    brokerSymbolSuffix: ".ecn",
    brokerSymbolRenames: {
      USOIL: "WTI",
      NAS100: "US100",
      SPX500: "US500",
    },
  },
];

export function findBrokerTemplate(brokerName: string): BrokerTemplate | null {
  const needle = brokerName.trim().toLowerCase();
  if (!needle) return null;
  return BROKER_TEMPLATES.find((t) => t.brokerName.toLowerCase() === needle) ?? null;
}

export interface AppliedTemplate {
  adapterKind: string;
  brokerSymbolSuffix: string;
  brokerSymbolRenames: string;
  /** New webhook secret, only generated when adapterKind === "ea_webhook". */
  webhookSecret: string | null;
  /** Serialized adapterConfigJson, only set when a webhook secret was generated. */
  adapterConfigJson: string | null;
}

/**
 * Given a broker name, return the fields a new LinkedTradingAccount row
 * should be initialized with. Returns null if the broker isn't templated —
 * caller should fall back to the legacy mock defaults.
 */
export function applyBrokerTemplate(brokerName: string): AppliedTemplate | null {
  const template = findBrokerTemplate(brokerName);
  if (!template) return null;

  const needsSecret = template.adapterKind === "ea_webhook";
  const webhookSecret = needsSecret ? randomBytes(24).toString("base64url") : null;
  const adapterConfigJson = webhookSecret ? JSON.stringify({ webhookSecret }) : null;

  return {
    adapterKind: template.adapterKind,
    brokerSymbolSuffix: template.brokerSymbolSuffix,
    brokerSymbolRenames: JSON.stringify(template.brokerSymbolRenames),
    webhookSecret,
    adapterConfigJson,
  };
}
