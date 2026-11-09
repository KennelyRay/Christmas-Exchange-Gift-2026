/** Response shapes shared by the API and the client. */

export type ExchangeStatus = "open" | "locked" | "drawn";

export type PublicParticipant = {
  id: string;
  /** Full name, shown everywhere. */
  name: string;
  lastName: string;
  familyKey: string;
  itemCount: number;
};

export type PublicAuditEntry = { id: number; event: string; detail: string; at: string };

export type LobbyView = {
  slug: string;
  name: string;
  status: ExchangeStatus;
  budgetCentavos: number | null;
  revealAt: string;
  commitmentHash: string | null;
  sealOpened: boolean;
  drawGeneration: number;
  participants: PublicParticipant[];
  /** Why the draw couldn't run right now, or null when it could. */
  drawWarning: string | null;
  audit: PublicAuditEntry[];
};

export type EnvelopeItem = {
  name: string;
  priceCentavos: number | null;
  url: string | null;
  imageUrl: string | null;
};

export type EnvelopeView =
  | { state: "waiting"; giverName: string }
  | {
      state: "ready";
      giverName: string;
      recipientName: string;
      items: EnvelopeItem[];
      codeReissuedAt: string | null;
    };

export type ChainView =
  | { state: "not_drawn"; revealAt: string }
  | { state: "sealed"; revealAt: string }
  | {
      state: "live";
      step: number;
      /** Number of presses in a full reveal: one per person, plus the first giver. */
      totalSteps: number;
      /** People revealed so far. The last entry equals the first when the loop closes. */
      sequence: string[];
      names: string[];
    };

export type SealView = {
  commitmentHash: string | null;
  manifest: string | null;
  openedAt: string | null;
};

export type DashboardView = {
  slug: string;
  name: string;
  status: ExchangeStatus;
  budgetCentavos: number | null;
  revealAt: string;
  commitmentHash: string | null;
  drawGeneration: number;
  chainStep: number;
  sealOpened: boolean;
  canOpenSeal: boolean;
  canResetDraw: boolean;
  participants: Array<{
    id: string;
    name: string;
    lastName: string;
    familyKey: string;
    itemCount: number;
    hasOpened: boolean;
    codeReissuedAt: string | null;
  }>;
  exclusions: Array<[string, string]>;
  drawCheck: { message: string; blocksLock: boolean } | null;
};

export type ApiErrorBody = { error: { code: string; message: string; fields?: Record<string, string> } };
