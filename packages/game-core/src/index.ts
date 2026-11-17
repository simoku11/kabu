export const RULES_VERSION = "1.0" as const;

export type RulesVersion = typeof RULES_VERSION;
export const SUITS = ["hearts", "diamonds", "spades", "clubs"] as const;
export const RANKS = [
  "ace",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "jack",
  "queen",
  "king",
] as const;

export type Suit = (typeof SUITS)[number];
export type Rank = (typeof RANKS)[number];
export type CardId = `${Suit}:${Rank}`;
export type PositionRow = "near" | "far";
export type DiscardOrigin = "drawn" | "swapped" | "reaction";

export interface Card {
  id: CardId;
  suit: Suit;
  rank: Rank;
  value: number;
}
export interface RandomSource {
  integer(maxExclusive: number): number;
}
export interface RoundPlayerInput {
  playerId: string;
  seat: number;
}
export interface CardPosition {
  id: string;
  row: PositionRow;
  column: number;
  cardId: CardId | null;
  occupancyVersion: number;
}
export interface RoundPlayer {
  playerId: string;
  seat: number;
  initialViewOpen: boolean;
  eliminated: boolean;
  finalScore?: number;
  positions: CardPosition[];
}
export interface DiscardEntry {
  cardId: CardId;
  origin: DiscardOrigin;
  abilityEligible: boolean;
}
export interface TurnState {
  id: string;
  number: number;
  phase: "awaiting-draw" | "awaiting-decision";
}
export interface PositionTarget {
  playerId: string;
  positionId: string;
  occupancyVersion: number;
}
export type EffectKind =
  | "inspect-own"
  | "inspect-opponent"
  | "blind-swap"
  | "give-card"
  | "inspect-swap";
export const PRIVATE_VIEW_DURATION_MS = 20_000;
export interface EffectState {
  id: string;
  ownerPlayerId: string;
  kind: EffectKind;
  phase: "selecting" | "viewing" | "deciding";
  targets: PositionTarget[];
  expiresAt?: number;
  activated?: boolean;
}
export interface ReactionWindow {
  id: string;
  rank: Rank;
  status: "open" | "consumed";
}
export const FINAL_REACTION_DURATION_MS = 6_000;
export interface PlayerRoundScore {
  playerId: string;
  cardPoints: number;
  kabuPenalty: number;
  roundPoints: number;
  cards: CardId[];
}
export interface CompletedRound {
  roundNumber: number;
  endReason: "zero-cards" | "kabu";
  kabuCallerId: string | null;
  scores: PlayerRoundScore[];
}
export interface PendingTransfer {
  id: string;
  reactingPlayerId: string;
  recipientPlayerId: string;
  recipientPositionId: string;
}
export interface PublicReveal {
  id: string;
  target: PositionTarget;
  cardId: CardId;
  expiresAt: number;
  reason?: "wrong-card" | "too-late";
}
export type PublicAction =
  | { id: string; kind: "draw" | "discard-drawn"; actorPlayerId: string }
  | {
      id: string;
      kind: "swap-drawn" | "inspect" | "reaction" | "penalty";
      actorPlayerId: string;
      source: PositionTarget;
    }
  | {
      id: string;
      kind: "ability-swap" | "transfer";
      actorPlayerId: string;
      source: PositionTarget;
      target: PositionTarget;
    }
  | {
      id: string;
      kind: "keep";
      actorPlayerId: string;
      targets: PositionTarget[];
    }
  | {
      id: string;
      kind: "add-card";
      actorPlayerId: string;
      targetPlayerId: string;
    };
export interface RoundState {
  dataVersion: 4;
  rulesVersion: RulesVersion;
  id: string;
  number: number;
  phase:
    | "initial-view"
    | "playing"
    | "provisional-end"
    | "final-reaction"
    | "round-result"
    | "game-over";
  startingPlayerId: string;
  activePlayerId: string;
  players: RoundPlayer[];
  drawPile: CardId[];
  discardPile: DiscardEntry[];
  removedCards: CardId[];
  drawnCard: { playerId: string; cardId: CardId } | null;
  turn: TurnState;
  effects: EffectState[];
  reactionWindow: ReactionWindow | null;
  pendingTransfers: PendingTransfer[];
  publicReveals: PublicReveal[];
  lastAction?: PublicAction;
  nextEntityNumber: number;
  restartCount: number;
  lastRestartReason?: "draw-pile-exhausted";
  roundCount: number;
  kabuCallerId: string | null;
  pendingFinalTurns: string[];
  finalReactionDeadline: number | null;
  finalReactionExpired: boolean;
  endReason: "zero-cards" | "kabu" | null;
  completedRounds: CompletedRound[];
  totalScores: Record<string, number>;
  nextRoundReady: string[];
  winners: string[];
}
export const DEVELOPMENT_SCENARIOS = [
  "ability-2",
  "ability-own-look",
  "ability-opponent-look",
  "ability-black-queen",
  "ability-red-king",
  "ability-black-king",
  "reaction-own",
  "reaction-wrong",
  "reaction-two-wrong",
  "reaction-foreign",
  "reaction-during-insight",
  "m5-zero-own",
  "m5-foreign-last",
  "m5-red-king-rescue",
  "m5-kabu",
  "m5-kabu-tie",
  "m5-kabu-early-zero",
  "m5-short-game",
  "m6-grown-field",
  "m6-four-player-grown-fields",
] as const;
export type DevelopmentScenario = (typeof DEVELOPMENT_SCENARIOS)[number];

export type RoundErrorCode =
  | "ROUND_NOT_PLAYING"
  | "INITIAL_VIEW_CLOSED"
  | "NOT_ACTIVE_PLAYER"
  | "INVALID_TURN"
  | "DRAW_REQUIRED"
  | "INVALID_POSITION"
  | "STALE_POSITION"
  | "DRAW_PILE_EXHAUSTED"
  | "INVALID_EFFECT"
  | "INVALID_REACTION_WINDOW"
  | "CARD_HELD"
  | "ACTION_REQUIRED"
  | "REACTION_NOT_ALLOWED"
  | "KABU_NOT_ALLOWED"
  | "FINAL_REACTION_NOT_EXPIRED"
  | "ROUND_ALREADY_COMPLETE"
  | "NEXT_ROUND_NOT_AVAILABLE";
export type RoundResult =
  | { ok: true; state: RoundState }
  | { ok: false; code: RoundErrorCode; message: string };

export interface PublicCard {
  suit: Suit;
  rank: Rank;
  value: number;
}
export interface PositionView {
  id: string;
  row: PositionRow;
  column: number;
  occupied: boolean;
  occupancyVersion: number;
  held?: boolean;
  card?: PublicCard;
}
export interface RoundView {
  id: string;
  number: number;
  phase: RoundState["phase"];
  startingPlayerId: string;
  activePlayerId: string;
  drawPileCount: number;
  discardTop?: PublicCard & { origin: DiscardOrigin };
  turn: TurnState;
  reactionWindow: ReactionWindow | null;
  effects: Array<{
    id: string;
    ownerPlayerId: string;
    kind: EffectKind;
    phase: EffectState["phase"];
    targets: PositionTarget[];
    expiresAt?: number;
    activated?: boolean;
  }>;
  pendingTransfer?: Omit<PendingTransfer, "reactingPlayerId">;
  publicReveals: Array<{
    id: string;
    target: PositionTarget;
    card: PublicCard;
    expiresAt: number;
    reason: "wrong-card" | "too-late";
  }>;
  lastAction?: PublicAction;
  restartCount: number;
  lastRestartReason?: "draw-pile-exhausted";
  roundCount: number;
  kabuCallerId: string | null;
  pendingFinalTurns: string[];
  finalReactionDeadline: number | null;
  endReason: "zero-cards" | "kabu" | null;
  completedRounds: Array<{
    roundNumber: number;
    endReason: "zero-cards" | "kabu";
    kabuCallerId: string | null;
    scores: Array<Omit<PlayerRoundScore, "cards">>;
  }>;
  totalScores: Record<string, number>;
  nextRoundReady: string[];
  winners: string[];
  players: Array<{
    playerId: string;
    seat: number;
    initialViewClosed: boolean;
    eliminated: boolean;
    finalScore?: number;
    positions: PositionView[];
  }>;
  you: {
    initialViewOpen: boolean;
    drawnCard?: PublicCard;
    privateEffect?: {
      effectId: string;
      expiresAt: number;
      cards: Array<{ target: PositionTarget; card: PublicCard }>;
    };
  };
}

export function cardId(suit: Suit, rank: Rank): CardId {
  return `${suit}:${rank}`;
}

export function cardFor(id: CardId): Card {
  const [suit, rank] = id.split(":") as [Suit, Rank];
  const numeric = Number(rank);
  const value =
    rank === "ace"
      ? 1
      : rank === "jack"
        ? 11
        : rank === "queen"
          ? 12
          : rank === "king"
            ? suit === "hearts" || suit === "diamonds"
              ? 0
              : 13
            : numeric;
  return { id, suit, rank, value };
}

export function createDeck(): Card[] {
  return SUITS.flatMap((suit) =>
    RANKS.map((rank) => cardFor(cardId(suit, rank))),
  );
}

export function shuffle<T>(values: readonly T[], random: RandomSource): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = random.integer(index + 1);
    if (!Number.isInteger(other) || other < 0 || other > index) {
      throw new Error("Random source returned an invalid integer");
    }
    [result[index], result[other]] = [result[other]!, result[index]!];
  }
  return result;
}

function positionId(
  playerId: string,
  row: PositionRow,
  column: number,
): string {
  return `${playerId}:${row}:${column}`;
}
function initialPositions(playerId: string): CardPosition[] {
  return (["near", "far"] as const).flatMap((row) =>
    [0, 1].map((column) => ({
      id: positionId(playerId, row, column),
      row,
      column,
      cardId: null,
      occupancyVersion: 0,
    })),
  );
}
function validatePlayers(
  players: readonly RoundPlayerInput[],
): RoundPlayerInput[] {
  if (players.length < 2 || players.length > 6)
    throw new Error("A round requires 2 to 6 players");
  const sorted = [...players].toSorted((left, right) => left.seat - right.seat);
  if (
    new Set(sorted.map((p) => p.playerId)).size !== sorted.length ||
    new Set(sorted.map((p) => p.seat)).size !== sorted.length
  ) {
    throw new Error("Players and seats must be unique");
  }
  return sorted;
}
function validateDeckOrder(deckOrder: readonly CardId[]): CardId[] {
  const canonical = createDeck().map((card) => card.id);
  if (
    deckOrder.length !== canonical.length ||
    new Set(deckOrder).size !== canonical.length ||
    deckOrder.some((id) => !canonical.includes(id))
  ) {
    throw new Error("A deck order must contain every card exactly once");
  }
  return [...deckOrder];
}

export function createRound(input: {
  players: readonly RoundPlayerInput[];
  random: RandomSource;
  roundNumber?: number;
  previousStartingSeat?: number;
  deckOrder?: readonly CardId[];
  roundCount?: number;
  completedRounds?: CompletedRound[];
  totalScores?: Record<string, number>;
  eliminatedPlayers?: Array<{ playerId: string; finalScore: number }>;
  restartCount?: number;
}): RoundState {
  const eliminatedScores = new Map(
    input.eliminatedPlayers?.map(({ playerId, finalScore }) => [
      playerId,
      finalScore,
    ]) ?? [],
  );
  const players = validatePlayers(input.players).map((player) => {
    const finalScore = eliminatedScores.get(player.playerId);
    return {
      ...player,
      initialViewOpen: finalScore === undefined,
      eliminated: finalScore !== undefined,
      ...(finalScore === undefined ? {} : { finalScore }),
      positions: initialPositions(player.playerId),
    };
  });
  const activePlayers = players.filter((player) => !player.eliminated);
  if (activePlayers.length < 2)
    throw new Error("A round requires at least 2 active players");
  const topFirst = input.deckOrder
    ? validateDeckOrder(input.deckOrder)
    : shuffle(
        createDeck().map((card) => card.id),
        input.random,
      );
  const drawPile = topFirst.toReversed();
  for (let cardIndex = 0; cardIndex < 4; cardIndex += 1) {
    for (const player of activePlayers) {
      const position = player.positions[cardIndex]!;
      position.cardId = drawPile.pop()!;
      position.occupancyVersion = 1;
    }
  }
  const startingIndex =
    input.previousStartingSeat === undefined
      ? input.random.integer(activePlayers.length)
      : (() => {
          const nextIndex = activePlayers.findIndex(
            (player) => player.seat > input.previousStartingSeat!,
          );
          return nextIndex < 0 ? 0 : nextIndex;
        })();
  if (
    !Number.isInteger(startingIndex) ||
    startingIndex < 0 ||
    startingIndex >= activePlayers.length
  )
    throw new Error("Random source returned an invalid integer");
  const startingPlayerId = activePlayers[startingIndex]!.playerId;
  const roundNumber = input.roundNumber ?? 1;
  return {
    dataVersion: 4,
    rulesVersion: RULES_VERSION,
    id: `round-${roundNumber}`,
    number: roundNumber,
    phase: "initial-view",
    startingPlayerId,
    activePlayerId: startingPlayerId,
    players,
    drawPile,
    discardPile: [],
    removedCards: [],
    drawnCard: null,
    turn: { id: "turn-1", number: 1, phase: "awaiting-draw" },
    effects: [],
    reactionWindow: null,
    pendingTransfers: [],
    publicReveals: [],
    nextEntityNumber: 1,
    restartCount: input.restartCount ?? 0,
    roundCount: input.roundCount ?? 1,
    kabuCallerId: null,
    pendingFinalTurns: [],
    finalReactionDeadline: null,
    finalReactionExpired: false,
    endReason: null,
    completedRounds: structuredClone(input.completedRounds ?? []),
    totalScores: {
      ...Object.fromEntries(players.map((player) => [player.playerId, 0])),
      ...(input.totalScores ?? {}),
    },
    nextRoundReady: [],
    winners: [],
  };
}

function rejected(code: RoundErrorCode, message: string): RoundResult {
  return { ok: false, code, message };
}

export function closeInitialView(
  state: RoundState,
  playerId: string,
  roundId: string,
): RoundResult {
  if (state.id !== roundId || state.phase !== "initial-view")
    return rejected(
      "INITIAL_VIEW_CLOSED",
      "Die Startansicht ist bereits geschlossen.",
    );
  const player = state.players.find(
    (candidate) => candidate.playerId === playerId,
  );
  if (!player?.initialViewOpen)
    return rejected(
      "INITIAL_VIEW_CLOSED",
      "Die Startansicht ist bereits geschlossen.",
    );
  const next = structuredClone(state);
  next.players.find(
    (candidate) => candidate.playerId === playerId,
  )!.initialViewOpen = false;
  if (next.players.every((candidate) => !candidate.initialViewOpen))
    next.phase = "playing";
  return { ok: true, state: next };
}

function recycleDiscard(state: RoundState, random: RandomSource): boolean {
  if (state.drawPile.length > 0) return true;
  if (state.discardPile.length <= 1) return false;
  const top = state.discardPile.pop()!;
  const recyclable = state.discardPile.splice(0).map((entry) => entry.cardId);
  state.drawPile.push(...shuffle(recyclable, random));
  state.discardPile.push(top);
  return true;
}
function nextId(state: RoundState, prefix: string): string {
  const id = `${prefix}-${state.nextEntityNumber}`;
  state.nextEntityNumber += 1;
  return id;
}
function restartAfterExhaustion(
  state: RoundState,
  random: RandomSource,
): RoundState {
  const activePlayers = state.players.filter((player) => !player.eliminated);
  const startingIndex = activePlayers.findIndex(
    (player) => player.playerId === state.startingPlayerId,
  );
  const previousStartingSeat =
    startingIndex < 0
      ? undefined
      : activePlayers[
          (startingIndex - 1 + activePlayers.length) % activePlayers.length
        ]!.seat;
  const restarted = createRound({
    players: state.players.map(({ playerId, seat }) => ({ playerId, seat })),
    random,
    roundNumber: state.number,
    roundCount: state.roundCount,
    completedRounds: state.completedRounds,
    totalScores: state.totalScores,
    eliminatedPlayers: state.players.flatMap((player) =>
      player.eliminated
        ? [{ playerId: player.playerId, finalScore: player.finalScore! }]
        : [],
    ),
    restartCount: state.restartCount + 1,
    ...(previousStartingSeat === undefined ? {} : { previousStartingSeat }),
  });
  restarted.id = `round-${state.number}-restart-${state.restartCount + 1}`;
  restarted.lastRestartReason = "draw-pile-exhausted";
  return restarted;
}
function locatePosition(state: RoundState, target: PositionTarget) {
  const player = state.players.find(
    (item) => item.playerId === target.playerId,
  );
  const position = player?.positions.find(
    (item) => item.id === target.positionId,
  );
  return { player, position };
}
function heldBy(state: RoundState, positionId: string): string | undefined {
  return state.effects.find((effect) =>
    effect.targets.some((target) => target.positionId === positionId),
  )?.ownerPlayerId;
}
function hasPendingAction(state: RoundState, playerId: string): boolean {
  return state.pendingTransfers.some(
    (transfer) => transfer.reactingPlayerId === playerId,
  );
}
function occupiedCount(state: RoundState, playerId: string): number {
  return (
    state.players
      .find((player) => player.playerId === playerId)
      ?.positions.filter((position) => position.cardId).length ?? 0
  );
}
function activePlayers(state: RoundState): RoundPlayer[] {
  return state.players.filter((player) => !player.eliminated);
}

function eliminatePlayer(state: RoundState, playerId: string): void {
  const player = state.players.find(
    (candidate) => candidate.playerId === playerId,
  );
  if (!player || player.eliminated || occupiedCount(state, playerId) < 9)
    return;

  const cardPoints = player.positions.reduce(
    (sum, position) =>
      sum + (position.cardId ? cardFor(position.cardId).value : 0),
    0,
  );
  const finalScore = (state.totalScores[playerId] ?? 0) + cardPoints;
  state.totalScores[playerId] = finalScore;
  player.eliminated = true;
  player.finalScore = finalScore;
  player.initialViewOpen = false;
  for (const position of player.positions) {
    if (position.cardId) state.removedCards.push(position.cardId);
    position.cardId = null;
    position.occupancyVersion += 1;
  }

  state.effects = state.effects.filter(
    (effect) =>
      effect.ownerPlayerId !== playerId &&
      effect.targets.every((target) => target.playerId !== playerId),
  );
  state.pendingTransfers = state.pendingTransfers.filter(
    (transfer) =>
      transfer.reactingPlayerId !== playerId &&
      transfer.recipientPlayerId !== playerId,
  );
  state.publicReveals = state.publicReveals.filter(
    (reveal) => reveal.target.playerId !== playerId,
  );
  state.pendingFinalTurns = state.pendingFinalTurns.filter(
    (candidate) => candidate !== playerId,
  );
  if (state.kabuCallerId === playerId) {
    state.kabuCallerId = null;
    state.pendingFinalTurns = [];
    state.finalReactionDeadline = null;
    state.finalReactionExpired = false;
    if (state.phase === "final-reaction") state.phase = "playing";
  }

  if (state.drawnCard?.playerId === playerId) {
    state.removedCards.push(state.drawnCard.cardId);
    state.drawnCard = null;
  }

  const remaining = activePlayers(state);
  if (remaining.length === 1) {
    if (state.drawnCard) {
      state.discardPile.push({
        cardId: state.drawnCard.cardId,
        origin: "drawn",
        abilityEligible: false,
      });
      state.drawnCard = null;
    }
    state.winners = [remaining[0]!.playerId];
    state.phase = "game-over";
    state.effects = [];
    state.pendingTransfers = [];
    state.pendingFinalTurns = [];
    state.reactionWindow = null;
    state.finalReactionDeadline = null;
    return;
  }
  if (state.activePlayerId === playerId) {
    const later = remaining.filter((candidate) => candidate.seat > player.seat);
    state.activePlayerId = (later[0] ?? remaining[0])!.playerId;
    const number = state.turn.number + 1;
    state.turn = { id: `turn-${number}`, number, phase: "awaiting-draw" };
    state.drawnCard = null;
  }
}
function scoreAndFinishRound(
  state: RoundState,
  reason: "zero-cards" | "kabu",
): void {
  if (state.phase === "round-result" || state.phase === "game-over") return;
  const eligiblePlayers = activePlayers(state);
  const cardPoints = new Map(
    eligiblePlayers.map((player) => [
      player.playerId,
      player.positions.reduce(
        (sum, position) =>
          sum + (position.cardId ? cardFor(position.cardId).value : 0),
        0,
      ),
    ]),
  );
  const lowest = Math.min(...cardPoints.values());
  const scores = eligiblePlayers.map((player): PlayerRoundScore => {
    const points = cardPoints.get(player.playerId)!;
    const callerIsAloneLowest =
      state.kabuCallerId === player.playerId &&
      points === lowest &&
      [...cardPoints.values()].filter((value) => value === lowest).length === 1;
    const kabuPenalty =
      state.kabuCallerId === player.playerId && !callerIsAloneLowest ? 10 : 0;
    return {
      playerId: player.playerId,
      cardPoints: points,
      kabuPenalty,
      roundPoints: points + kabuPenalty,
      cards: player.positions.flatMap((position) =>
        position.cardId ? [position.cardId] : [],
      ),
    };
  });
  state.endReason = reason;
  state.completedRounds.push({
    roundNumber: state.number,
    endReason: reason,
    kabuCallerId: state.kabuCallerId,
    scores,
  });
  for (const score of scores)
    state.totalScores[score.playerId] =
      (state.totalScores[score.playerId] ?? 0) + score.roundPoints;
  state.effects = [];
  state.pendingTransfers = [];
  state.pendingFinalTurns = [];
  state.reactionWindow = null;
  state.finalReactionDeadline = null;
  state.finalReactionExpired = true;
  state.nextRoundReady = [];
  if (state.number >= state.roundCount) {
    const best = Math.min(
      ...eligiblePlayers.map(
        (player) => state.totalScores[player.playerId] ?? 0,
      ),
    );
    state.winners = eligiblePlayers
      .filter((player) => state.totalScores[player.playerId] === best)
      .map((player) => player.playerId);
    state.phase = "game-over";
  } else state.phase = "round-result";
}

function settleProvisionalEnd(state: RoundState): void {
  if (state.phase === "round-result" || state.phase === "game-over") return;
  const hasZero = activePlayers(state).some(
    (player) => occupiedCount(state, player.playerId) === 0,
  );
  if (!hasZero) {
    if (state.phase === "provisional-end") {
      if (state.kabuCallerId && state.pendingFinalTurns.length === 0) {
        if (state.finalReactionDeadline && !state.finalReactionExpired)
          state.phase = "final-reaction";
        else scoreAndFinishRound(state, "kabu");
      } else state.phase = "playing";
    }
    if (
      state.phase === "final-reaction" &&
      state.finalReactionExpired &&
      state.effects.length === 0 &&
      state.pendingTransfers.length === 0
    )
      scoreAndFinishRound(state, "kabu");
    return;
  }
  if (state.drawnCard) {
    state.discardPile.push({
      cardId: state.drawnCard.cardId,
      origin: "drawn",
      abilityEligible: false,
    });
    state.drawnCard = null;
    advanceTurn(state);
  }
  state.reactionWindow = state.reactionWindow
    ? { ...state.reactionWindow, status: "consumed" }
    : null;
  state.phase = "provisional-end";
  if (state.effects.length === 0 && state.pendingTransfers.length === 0)
    scoreAndFinishRound(state, "zero-cards");
}

function beginFinalReaction(state: RoundState, now: number): void {
  state.phase = "final-reaction";
  state.finalReactionDeadline = now + FINAL_REACTION_DURATION_MS;
  state.finalReactionExpired = false;
}

/** Adds M5 fields to persisted M3/M4 JSON snapshots without exposing a second
 * rules path. An old confirmed zero-card connector is settled immediately. */
export function upgradeRoundState(
  persisted: RoundState,
  roundCount = 1,
): RoundState {
  const source = persisted as RoundState & { dataVersion?: number };
  if (
    source.dataVersion !== undefined &&
    ![1, 2, 3, 4].includes(source.dataVersion)
  ) {
    throw new Error(
      `Nicht unterstützte Snapshot-Version: ${source.dataVersion}`,
    );
  }
  if (
    source.rulesVersion !== undefined &&
    source.rulesVersion !== RULES_VERSION
  ) {
    throw new Error(
      `Nicht unterstützte Regelversion: ${String(source.rulesVersion)}`,
    );
  }
  const runtimePhase = (persisted as unknown as { phase: string }).phase;
  if (source.dataVersion === 4) return persisted;
  const next = structuredClone(source) as RoundState;
  next.dataVersion = 4;
  next.removedCards = [];
  for (const player of next.players) {
    player.eliminated = false;
    delete player.finalScore;
  }
  if (source.dataVersion === 3) return next;
  next.roundCount = roundCount;
  next.kabuCallerId = null;
  next.pendingFinalTurns = [];
  next.finalReactionDeadline = null;
  next.finalReactionExpired = false;
  next.endReason = null;
  next.completedRounds = [];
  next.totalScores = Object.fromEntries(
    next.players.map((player) => [player.playerId, 0]),
  );
  next.nextRoundReady = [];
  next.winners = [];
  if (runtimePhase === "awaiting-m5") {
    next.phase = "provisional-end";
    settleProvisionalEnd(next);
  }
  return next;
}
function openReactionWindow(state: RoundState, card: CardId): void {
  state.reactionWindow = {
    id: nextId(state, "reaction"),
    rank: cardFor(card).rank,
    status: "open",
  };
}
function addEffectForDirectDiscard(
  state: RoundState,
  ownerPlayerId: string,
  card: CardId,
  random: RandomSource,
  now: number,
): void {
  const { rank, suit } = cardFor(card);
  if (rank === "2") {
    advanceTurn(state);
    return;
  }
  let kind: EffectKind | undefined;
  if (["3", "4", "5", "6"].includes(rank)) kind = "inspect-own";
  else if (["7", "8", "9", "10"].includes(rank)) kind = "inspect-opponent";
  else if (rank === "queen" && (suit === "spades" || suit === "clubs"))
    kind = "blind-swap";
  else if (rank === "king" && (suit === "hearts" || suit === "diamonds"))
    kind = "give-card";
  else if (rank === "king") kind = "inspect-swap";
  if (!kind) return;
  if (
    (kind === "blind-swap" || kind === "inspect-swap") &&
    state.players.filter((player) => occupiedCount(state, player.playerId) > 0)
      .length < 2
  )
    return;
  state.effects.push({
    id: nextId(state, "effect"),
    ownerPlayerId,
    kind,
    phase: "selecting",
    targets: [],
    expiresAt: now + PRIVATE_VIEW_DURATION_MS,
  });
  void random;
}
function validateTurn(
  state: RoundState,
  playerId: string,
  turnId: string,
): RoundResult | undefined {
  if (state.phase !== "playing")
    return rejected(
      "ROUND_NOT_PLAYING",
      "Der normale Zug ist noch nicht freigegeben.",
    );
  if (state.players.find((player) => player.playerId === playerId)?.eliminated)
    return rejected(
      "NOT_ACTIVE_PLAYER",
      "Ausgeschiedene Spieler dürfen nicht mehr handeln.",
    );
  if (state.activePlayerId !== playerId)
    return rejected(
      "NOT_ACTIVE_PLAYER",
      "Nur der aktive Spieler darf handeln.",
    );
  if (state.turn.id !== turnId)
    return rejected("INVALID_TURN", "Dieser Zug ist nicht mehr aktuell.");
  if (state.effects.length > 0)
    return rejected(
      "ACTION_REQUIRED",
      "Die offene Aktion muss zuerst abgeschlossen oder abgelehnt werden.",
    );
  if (hasPendingAction(state, playerId))
    return rejected(
      "ACTION_REQUIRED",
      "Schließe zuerst den verpflichtenden Ausgleich ab.",
    );
  return undefined;
}
export function drawCard(
  state: RoundState,
  playerId: string,
  turnId: string,
  random: RandomSource,
): RoundResult {
  const invalid = validateTurn(state, playerId, turnId);
  if (invalid) return invalid;
  if (state.turn.phase !== "awaiting-draw" || state.drawnCard)
    return rejected("INVALID_TURN", "In diesem Zug wurde bereits gezogen.");
  const next = structuredClone(state);
  if (!recycleDiscard(next, random))
    return { ok: true, state: restartAfterExhaustion(next, random) };
  next.drawnCard = { playerId, cardId: next.drawPile.pop()! };
  next.turn.phase = "awaiting-decision";
  next.lastAction = { id: next.turn.id, kind: "draw", actorPlayerId: playerId };
  return { ok: true, state: next };
}
function advanceTurn(state: RoundState): void {
  if (state.kabuCallerId) {
    state.pendingFinalTurns = state.pendingFinalTurns.filter(
      (playerId) => playerId !== state.activePlayerId,
    );
    if (state.pendingFinalTurns.length > 0)
      state.activePlayerId = state.pendingFinalTurns[0]!;
    const number = state.turn.number + 1;
    state.turn = { id: `turn-${number}`, number, phase: "awaiting-draw" };
    return;
  }
  const eligible = activePlayers(state);
  const current = eligible.findIndex(
    (player) => player.playerId === state.activePlayerId,
  );
  state.activePlayerId = eligible[(current + 1) % eligible.length]!.playerId;
  const number = state.turn.number + 1;
  state.turn = { id: `turn-${number}`, number, phase: "awaiting-draw" };
}

export function callKabu(
  state: RoundState,
  playerId: string,
  turnId: string,
): RoundResult {
  const invalid = validateTurn(state, playerId, turnId);
  if (invalid) return invalid;
  if (
    state.kabuCallerId ||
    state.turn.phase !== "awaiting-draw" ||
    state.drawnCard
  )
    return rejected(
      "KABU_NOT_ALLOWED",
      "Kabu ist nur einmal und zu Beginn des eigenen Zuges erlaubt.",
    );
  const next = structuredClone(state);
  const eligible = activePlayers(next);
  const callerIndex = eligible.findIndex(
    (player) => player.playerId === playerId,
  );
  next.kabuCallerId = playerId;
  next.pendingFinalTurns = Array.from(
    { length: eligible.length - 1 },
    (_, offset) =>
      eligible[(callerIndex + offset + 1) % eligible.length]!.playerId,
  );
  next.activePlayerId = next.pendingFinalTurns[0]!;
  const number = next.turn.number + 1;
  next.turn = { id: `turn-${number}`, number, phase: "awaiting-draw" };
  next.reactionWindow = null;
  return { ok: true, state: next };
}

export function expireFinalReaction(
  state: RoundState,
  now = Date.now(),
): RoundResult {
  if (
    state.phase !== "final-reaction" ||
    state.finalReactionDeadline === null ||
    now < state.finalReactionDeadline
  )
    return rejected(
      "FINAL_REACTION_NOT_EXPIRED",
      "Die Kabu-Abschlussfrist ist nicht abgelaufen.",
    );
  const next = structuredClone(state);
  next.finalReactionExpired = true;
  next.reactionWindow = next.reactionWindow
    ? { ...next.reactionWindow, status: "consumed" }
    : null;
  if (next.effects.length === 0 && next.pendingTransfers.length === 0)
    scoreAndFinishRound(next, "kabu");
  return { ok: true, state: next };
}

export function readyForNextRound(
  state: RoundState,
  playerId: string,
  random: RandomSource,
): RoundResult {
  if (state.phase !== "round-result")
    return rejected(
      "NEXT_ROUND_NOT_AVAILABLE",
      "Es ist keine nächste Runde freigegeben.",
    );
  if (
    !state.players.some(
      (player) => player.playerId === playerId && !player.eliminated,
    )
  )
    return rejected(
      "INVALID_POSITION",
      "Dieser Spieler gehört nicht zur Runde.",
    );
  if (state.nextRoundReady.includes(playerId))
    return { ok: true, state: structuredClone(state) };
  const next = structuredClone(state);
  next.nextRoundReady.push(playerId);
  if (next.nextRoundReady.length < activePlayers(next).length)
    return { ok: true, state: next };
  const previousStartingSeat = next.players.find(
    (player) => player.playerId === next.startingPlayerId,
  )!.seat;
  return {
    ok: true,
    state: createRound({
      players: next.players.map(({ playerId: id, seat }) => ({
        playerId: id,
        seat,
      })),
      random,
      roundNumber: next.number + 1,
      previousStartingSeat,
      roundCount: next.roundCount,
      completedRounds: next.completedRounds,
      totalScores: next.totalScores,
      eliminatedPlayers: next.players.flatMap((player) =>
        player.eliminated
          ? [{ playerId: player.playerId, finalScore: player.finalScore! }]
          : [],
      ),
    }),
  };
}
export function discardDrawn(
  state: RoundState,
  playerId: string,
  turnId: string,
  random: RandomSource = { integer: () => 0 },
  now = Date.now(),
): RoundResult {
  const invalid = validateTurn(state, playerId, turnId);
  if (invalid) return invalid;
  if (
    state.turn.phase !== "awaiting-decision" ||
    state.drawnCard?.playerId !== playerId
  )
    return rejected("DRAW_REQUIRED", "Ziehe zuerst genau eine Karte.");
  const next = structuredClone(state);
  const discarded = next.drawnCard!.cardId;
  next.discardPile.push({
    cardId: discarded,
    origin: "drawn",
    abilityEligible: true,
  });
  next.drawnCard = null;
  next.lastAction = {
    id: `${turnId}:discard`,
    kind: "discard-drawn",
    actorPlayerId: playerId,
  };
  advanceTurn(next);
  openReactionWindow(next, discarded);
  addEffectForDirectDiscard(next, playerId, discarded, random, now);
  if (next.kabuCallerId && next.pendingFinalTurns.length === 0)
    beginFinalReaction(next, now);
  return { ok: true, state: next };
}
export function swapDrawn(
  state: RoundState,
  playerId: string,
  turnId: string,
  target: { positionId: string; occupancyVersion: number },
  now = Date.now(),
): RoundResult {
  const invalid = validateTurn(state, playerId, turnId);
  if (invalid) return invalid;
  if (
    state.turn.phase !== "awaiting-decision" ||
    state.drawnCard?.playerId !== playerId
  )
    return rejected("DRAW_REQUIRED", "Ziehe zuerst genau eine Karte.");
  const player = state.players.find(
    (candidate) => candidate.playerId === playerId,
  )!;
  const position = player.positions.find(
    (candidate) => candidate.id === target.positionId,
  );
  if (!position?.cardId)
    return rejected("INVALID_POSITION", "Wähle eine belegte eigene Position.");
  if (position.occupancyVersion !== target.occupancyVersion)
    return rejected(
      "STALE_POSITION",
      "Diese Position hat sich inzwischen geändert.",
    );
  if (heldBy(state, position.id))
    return rejected("CARD_HELD", "Diese Karte wird bereits gehalten.");
  const next = structuredClone(state);
  const nextPosition = next.players
    .find((candidate) => candidate.playerId === playerId)!
    .positions.find((candidate) => candidate.id === target.positionId)!;
  const discarded = nextPosition.cardId!;
  nextPosition.cardId = next.drawnCard!.cardId;
  nextPosition.occupancyVersion += 1;
  next.lastAction = {
    id: `${turnId}:swap`,
    kind: "swap-drawn",
    actorPlayerId: playerId,
    source: {
      playerId,
      positionId: target.positionId,
      occupancyVersion: target.occupancyVersion,
    },
  };
  next.drawnCard = null;
  next.discardPile.push({
    cardId: discarded,
    origin: "swapped",
    abilityEligible: false,
  });
  advanceTurn(next);
  openReactionWindow(next, discarded);
  if (next.kabuCallerId && next.pendingFinalTurns.length === 0)
    beginFinalReaction(next, now);
  return { ok: true, state: next };
}

export function nextAdditionalPosition(player: RoundPlayer): CardPosition {
  const empty = player.positions
    .filter((position) => position.cardId === null)
    .toSorted(
      (left, right) =>
        left.column - right.column ||
        (left.row === "near" ? 0 : 1) - (right.row === "near" ? 0 : 1),
    )[0];
  if (empty) return empty;
  const highestColumn = Math.max(
    ...player.positions.map((position) => position.column),
  );
  const row: PositionRow =
    player.positions.some(
      (position) =>
        position.column === highestColumn && position.row === "near",
    ) &&
    !player.positions.some(
      (position) => position.column === highestColumn && position.row === "far",
    )
      ? "far"
      : "near";
  const column = row === "far" ? highestColumn : highestColumn + 1;
  return {
    id: positionId(player.playerId, row, column),
    row,
    column,
    cardId: null,
    occupancyVersion: 0,
  };
}

/** M4 can use this transfer primitive for penalties and red kings. It deliberately
 * places a card without revealing it and does not execute an ability. */
export function giveAdditionalCard(
  state: RoundState,
  playerId: string,
  random: RandomSource,
): RoundResult {
  const player = state.players.find(
    (candidate) => candidate.playerId === playerId,
  );
  if (!player || player.eliminated)
    return rejected(
      "INVALID_POSITION",
      "Der Empfänger gehört nicht zu dieser Runde.",
    );
  const next = structuredClone(state);
  if (!recycleDiscard(next, random))
    return rejected(
      "DRAW_PILE_EXHAUSTED",
      "Es ist keine zusätzliche Karte verfügbar.",
    );
  const nextPlayer = next.players.find(
    (candidate) => candidate.playerId === playerId,
  )!;
  const reserved = new Set(
    next.pendingTransfers
      .filter((transfer) => transfer.recipientPlayerId === playerId)
      .map((transfer) => transfer.recipientPositionId),
  );
  const target =
    nextPlayer.positions
      .filter(
        (position) => position.cardId === null && !reserved.has(position.id),
      )
      .toSorted(
        (left, right) =>
          left.column - right.column ||
          (left.row === "near" ? 0 : 1) - (right.row === "near" ? 0 : 1),
      )[0] ??
    nextAdditionalPosition({
      ...nextPlayer,
      positions: nextPlayer.positions.filter(
        (position) => !reserved.has(position.id),
      ),
    });
  const existing = nextPlayer.positions.find(
    (position) => position.id === target.id,
  );
  if (existing) {
    existing.cardId = next.drawPile.pop()!;
    existing.occupancyVersion += 1;
  } else {
    nextPlayer.positions.push({
      ...target,
      cardId: next.drawPile.pop()!,
      occupancyVersion: 1,
    });
  }
  eliminatePlayer(next, playerId);
  return { ok: true, state: next };
}

function validFreshTarget(
  state: RoundState,
  target: PositionTarget,
  allowRequiredTransferCard = false,
): RoundResult | undefined {
  const { player, position } = locatePosition(state, target);
  if (!player || player.eliminated || !position?.cardId)
    return rejected("INVALID_POSITION", "Diese Karte ist nicht mehr wählbar.");
  if (position.occupancyVersion !== target.occupancyVersion)
    return rejected(
      "STALE_POSITION",
      "Diese Position hat sich inzwischen geändert.",
    );
  if (heldBy(state, position.id))
    return rejected("CARD_HELD", "Diese Karte wird bereits gehalten.");
  if (
    !allowRequiredTransferCard &&
    state.pendingTransfers.some(
      (transfer) => transfer.reactingPlayerId === target.playerId,
    ) &&
    occupiedCount(state, target.playerId) <= 1
  )
    return rejected(
      "ACTION_REQUIRED",
      "Diese letzte Karte wird für einen Pflichtausgleich benötigt.",
    );
  return undefined;
}

export function selectEffectPosition(
  state: RoundState,
  playerId: string,
  effectId: string,
  target: PositionTarget,
  now = Date.now(),
): RoundResult {
  if (state.players.find((player) => player.playerId === playerId)?.eliminated)
    return rejected(
      "INVALID_EFFECT",
      "Ausgeschiedene Spieler dürfen nicht mehr handeln.",
    );
  const effect = state.effects.find((item) => item.id === effectId);
  if (
    !effect ||
    effect.ownerPlayerId !== playerId ||
    effect.phase !== "selecting" ||
    (effect.expiresAt !== undefined && effect.expiresAt <= now)
  )
    return rejected(
      "INVALID_EFFECT",
      "Dieser Effekt wartet nicht auf diese Auswahl.",
    );
  if (hasPendingAction(state, playerId))
    return rejected("ACTION_REQUIRED", "Schließe zuerst den Ausgleich ab.");
  const invalid = validFreshTarget(state, target);
  if (invalid) return invalid;
  if (effect.kind === "give-card")
    return rejected("INVALID_EFFECT", "Wähle für diesen Effekt einen Spieler.");
  if (effect.kind === "inspect-own" && target.playerId !== playerId)
    return rejected("INVALID_POSITION", "Wähle eine eigene Karte.");
  if (effect.kind === "inspect-opponent" && target.playerId === playerId)
    return rejected("INVALID_POSITION", "Wähle eine gegnerische Karte.");
  if (
    effect.targets.length > 0 &&
    (effect.targets[0]!.playerId === target.playerId ||
      effect.targets[0]!.positionId === target.positionId)
  )
    return rejected(
      "INVALID_POSITION",
      "Die beiden Karten müssen verschiedenen Spielern gehören.",
    );

  const next = structuredClone(state);
  const nextEffect = next.effects.find((item) => item.id === effectId)!;
  nextEffect.targets.push(target);
  if (
    nextEffect.kind === "inspect-own" ||
    nextEffect.kind === "inspect-opponent"
  ) {
    nextEffect.phase = "viewing";
    next.lastAction = {
      id: `${effectId}:inspect:${target.positionId}:${target.occupancyVersion}`,
      kind: "inspect",
      actorPlayerId: playerId,
      source: target,
    };
  } else if (
    nextEffect.targets.length === 2 &&
    nextEffect.kind === "blind-swap"
  ) {
    swapEffectTargets(next, nextEffect);
    next.lastAction = {
      id: `${effectId}:swap`,
      kind: "ability-swap",
      actorPlayerId: playerId,
      source: nextEffect.targets[0]!,
      target: nextEffect.targets[1]!,
    };
    next.effects = next.effects.filter((item) => item.id !== effectId);
    settleProvisionalEnd(next);
  } else if (nextEffect.targets.length === 2) {
    nextEffect.phase = "deciding";
  }
  return { ok: true, state: next };
}

/** Starts the explicit card-action selection with a fresh, one-time window. */
export function activateEffect(
  state: RoundState,
  playerId: string,
  effectId: string,
  now = Date.now(),
): RoundResult {
  const effect = state.effects.find((item) => item.id === effectId);
  if (
    !effect ||
    effect.ownerPlayerId !== playerId ||
    effect.phase !== "selecting" ||
    effect.activated ||
    (effect.expiresAt !== undefined && effect.expiresAt <= now)
  )
    return rejected(
      "INVALID_EFFECT",
      "Diese Aktivität kann nicht mehr gestartet werden.",
    );
  const next = structuredClone(state);
  const nextEffect = next.effects.find((item) => item.id === effectId)!;
  nextEffect.activated = true;
  nextEffect.expiresAt = now + PRIVATE_VIEW_DURATION_MS;
  return { ok: true, state: next };
}

function swapEffectTargets(state: RoundState, effect: EffectState): void {
  const first = locatePosition(state, effect.targets[0]!).position!;
  const second = locatePosition(state, effect.targets[1]!).position!;
  [first.cardId, second.cardId] = [second.cardId, first.cardId];
  first.occupancyVersion += 1;
  second.occupancyVersion += 1;
}

export function skipEffect(
  state: RoundState,
  playerId: string,
  effectId: string,
  now = Date.now(),
): RoundResult {
  const effect = state.effects.find((item) => item.id === effectId);
  if (
    !effect ||
    effect.ownerPlayerId !== playerId ||
    !["inspect-own", "inspect-opponent", "blind-swap", "inspect-swap"].includes(
      effect.kind,
    ) ||
    effect.phase !== "selecting" ||
    (effect.expiresAt !== undefined && effect.expiresAt <= now)
  )
    return rejected(
      "INVALID_EFFECT",
      "Diese Aktivität kann nicht abgelehnt werden.",
    );
  const next = structuredClone(state);
  next.lastAction = {
    id: `${effectId}:close`,
    kind: "keep",
    actorPlayerId: playerId,
    targets: effect.targets.map((target) => ({ ...target })),
  };
  next.effects = next.effects.filter((item) => item.id !== effectId);
  settleProvisionalEnd(next);
  return { ok: true, state: next };
}

export function closeEffectView(
  state: RoundState,
  playerId: string,
  effectId: string,
): RoundResult {
  const effect = state.effects.find((item) => item.id === effectId);
  if (
    !effect ||
    effect.ownerPlayerId !== playerId ||
    effect.phase !== "viewing"
  )
    return rejected(
      "INVALID_EFFECT",
      "Diese private Ansicht ist nicht mehr offen.",
    );
  const next = structuredClone(state);
  next.effects = next.effects.filter((item) => item.id !== effectId);
  settleProvisionalEnd(next);
  return { ok: true, state: next };
}

export function decideInspectSwap(
  state: RoundState,
  playerId: string,
  effectId: string,
  swap: boolean,
  now = Date.now(),
): RoundResult {
  const effect = state.effects.find((item) => item.id === effectId);
  if (
    !effect ||
    effect.ownerPlayerId !== playerId ||
    effect.kind !== "inspect-swap" ||
    effect.phase !== "deciding" ||
    effect.targets.length !== 2 ||
    (effect.expiresAt !== undefined && effect.expiresAt <= now)
  )
    return rejected(
      "INVALID_EFFECT",
      "Diese Königsentscheidung ist nicht mehr offen.",
    );
  const next = structuredClone(state);
  const nextEffect = next.effects.find((item) => item.id === effectId)!;
  if (swap) {
    swapEffectTargets(next, nextEffect);
    next.lastAction = {
      id: `${effectId}:swap`,
      kind: "ability-swap",
      actorPlayerId: playerId,
      source: nextEffect.targets[0]!,
      target: nextEffect.targets[1]!,
    };
  } else {
    next.lastAction = {
      id: `${effectId}:keep`,
      kind: "keep",
      actorPlayerId: playerId,
      targets: nextEffect.targets.map((target) => ({ ...target })),
    };
  }
  next.effects = next.effects.filter((item) => item.id !== effectId);
  settleProvisionalEnd(next);
  return { ok: true, state: next };
}

/** Ends an expired ability. For the black king, expiry means "keep". */
export function expireEffect(
  state: RoundState,
  effectId: string,
  now = Date.now(),
): RoundResult {
  const effect = state.effects.find((item) => item.id === effectId);
  if (!effect || effect.expiresAt === undefined || effect.expiresAt > now)
    return rejected("INVALID_EFFECT", "Dieser Effekt ist nicht abgelaufen.");
  const next = structuredClone(state);
  next.effects = next.effects.filter((item) => item.id !== effectId);
  settleProvisionalEnd(next);
  return { ok: true, state: next };
}

export function selectEffectPlayer(
  state: RoundState,
  playerId: string,
  effectId: string,
  targetPlayerId: string,
  random: RandomSource,
  now = Date.now(),
): RoundResult {
  if (state.players.find((player) => player.playerId === playerId)?.eliminated)
    return rejected(
      "INVALID_EFFECT",
      "Ausgeschiedene Spieler dürfen nicht mehr handeln.",
    );
  const effect = state.effects.find((item) => item.id === effectId);
  if (
    !effect ||
    effect.ownerPlayerId !== playerId ||
    effect.kind !== "give-card" ||
    effect.phase !== "selecting" ||
    (effect.expiresAt !== undefined && effect.expiresAt <= now) ||
    !state.players.some(
      (item) => item.playerId === targetPlayerId && !item.eliminated,
    )
  )
    return rejected(
      "INVALID_EFFECT",
      "Dieser König wartet nicht auf diesen Empfänger.",
    );
  const next = structuredClone(state);
  const result = giveAdditionalCard(next, targetPlayerId, random);
  if (!result.ok)
    return { ok: true, state: restartAfterExhaustion(next, random) };
  result.state.effects = result.state.effects.filter(
    (item) => item.id !== effectId,
  );
  result.state.lastAction = {
    id: `${effectId}:give:${targetPlayerId}`,
    kind: "add-card",
    actorPlayerId: playerId,
    targetPlayerId,
  };
  settleProvisionalEnd(result.state);
  return result;
}

export function reactWithPosition(
  state: RoundState,
  playerId: string,
  windowId: string,
  target: PositionTarget,
  random: RandomSource,
  now = Date.now(),
  revealDurationMs = 2_500,
): RoundResult {
  if (state.players.find((player) => player.playerId === playerId)?.eliminated)
    return rejected(
      "REACTION_NOT_ALLOWED",
      "Ausgeschiedene Spieler dürfen nicht mehr reagieren.",
    );
  if (state.phase !== "playing" && state.phase !== "final-reaction")
    return rejected(
      "REACTION_NOT_ALLOWED",
      "Neue Reaktionen sind derzeit gesperrt.",
    );
  if (
    state.phase === "final-reaction" &&
    (state.finalReactionDeadline === null ||
      state.finalReactionExpired ||
      now >= state.finalReactionDeadline)
  )
    return rejected(
      "REACTION_NOT_ALLOWED",
      "Die Kabu-Abschlussfrist ist abgelaufen.",
    );
  const window = state.reactionWindow;
  if (!window || window.id !== windowId)
    return rejected(
      "INVALID_REACTION_WINDOW",
      "Dieses Reaktionsfenster ist nicht mehr offen.",
    );
  if (hasPendingAction(state, playerId))
    return rejected("ACTION_REQUIRED", "Schließe zuerst den Ausgleich ab.");
  if (state.drawnCard?.playerId === playerId)
    return rejected(
      "REACTION_NOT_ALLOWED",
      "Lege oder tausche zuerst deine bereits gezogene Karte.",
    );
  if (
    state.effects.some(
      (effect) =>
        effect.ownerPlayerId === playerId &&
        (effect.phase !== "selecting" || effect.targets.length > 0),
    )
  )
    return rejected(
      "REACTION_NOT_ALLOWED",
      "Schließe zuerst die bereits begonnene Ansicht oder Entscheidung ab.",
    );
  const invalid = validFreshTarget(state, target);
  if (invalid) return invalid;
  const { position } = locatePosition(state, target);
  const selectedCard = position!.cardId!;
  if (
    state.publicReveals.some(
      (reveal) =>
        reveal.expiresAt > now &&
        reveal.cardId === selectedCard &&
        reveal.target.positionId === target.positionId &&
        reveal.target.occupancyVersion === target.occupancyVersion,
    )
  )
    return rejected(
      "REACTION_NOT_ALLOWED",
      "Diese Karte ist noch öffentlich aufgedeckt.",
    );
  const next = structuredClone(state);
  if (
    window.status === "consumed" ||
    cardFor(selectedCard).rank !== window.rank
  ) {
    next.publicReveals = next.publicReveals.filter(
      (item) => item.expiresAt > now,
    );
    const revealId = nextId(next, "reveal");
    next.publicReveals.push({
      id: revealId,
      target,
      cardId: selectedCard,
      expiresAt: now + revealDurationMs,
      reason: window.status === "consumed" ? "too-late" : "wrong-card",
    });
    const penalty = giveAdditionalCard(next, playerId, random);
    if (!penalty.ok)
      return { ok: true, state: restartAfterExhaustion(next, random) };
    penalty.state.lastAction = {
      id: `${revealId}:penalty`,
      kind: "penalty",
      actorPlayerId: playerId,
      source: target,
    };
    return penalty;
  }

  const nextPosition = locatePosition(next, target).position!;
  nextPosition.cardId = null;
  nextPosition.occupancyVersion += 1;
  next.discardPile.push({
    cardId: selectedCard,
    origin: "reaction",
    abilityEligible: false,
  });
  next.reactionWindow = { ...window, status: "consumed" };
  next.lastAction = {
    id: `${windowId}:reaction:${target.positionId}:${target.occupancyVersion}`,
    kind: "reaction",
    actorPlayerId: playerId,
    source: target,
  };
  if (target.playerId !== playerId) {
    next.pendingTransfers.push({
      id: nextId(next, "transfer"),
      reactingPlayerId: playerId,
      recipientPlayerId: target.playerId,
      recipientPositionId: target.positionId,
    });
  } else settleProvisionalEnd(next);
  return { ok: true, state: next };
}

export function completeTransfer(
  state: RoundState,
  playerId: string,
  transferId: string,
  target: PositionTarget,
): RoundResult {
  if (state.players.find((player) => player.playerId === playerId)?.eliminated)
    return rejected(
      "ACTION_REQUIRED",
      "Ausgeschiedene Spieler dürfen nicht mehr handeln.",
    );
  const transfer = state.pendingTransfers.find(
    (item) => item.id === transferId,
  );
  if (!transfer || transfer.reactingPlayerId !== playerId)
    return rejected(
      "ACTION_REQUIRED",
      "Dieser Ausgleich ist nicht mehr offen.",
    );
  if (target.playerId !== playerId)
    return rejected("INVALID_POSITION", "Wähle eine eigene Ausgleichskarte.");
  const invalid = validFreshTarget(state, target, true);
  if (invalid) return invalid;
  const recipient = state.players
    .find((item) => item.playerId === transfer.recipientPlayerId)!
    .positions.find((item) => item.id === transfer.recipientPositionId);
  if (!recipient || recipient.cardId)
    return rejected(
      "STALE_POSITION",
      "Die reservierte Empfängerposition ist nicht mehr frei.",
    );
  const next = structuredClone(state);
  const source = locatePosition(next, target).position!;
  const destination = next.players
    .find((item) => item.playerId === transfer.recipientPlayerId)!
    .positions.find((item) => item.id === transfer.recipientPositionId)!;
  destination.cardId = source.cardId;
  destination.occupancyVersion += 1;
  source.cardId = null;
  source.occupancyVersion += 1;
  next.lastAction = {
    id: `${transferId}:complete`,
    kind: "transfer",
    actorPlayerId: playerId,
    source: target,
    target: {
      playerId: transfer.recipientPlayerId,
      positionId: transfer.recipientPositionId,
      occupancyVersion: destination.occupancyVersion,
    },
  };
  next.pendingTransfers = next.pendingTransfers.filter(
    (item) => item.id !== transferId,
  );
  settleProvisionalEnd(next);
  return { ok: true, state: next };
}

/** Development-only fixture builder. The server exposes it only when explicitly
 * enabled; it never adds diagnostic card values to a projection. */
export function loadDevelopmentScenario(
  state: RoundState,
  scenario: DevelopmentScenario,
): RoundState {
  const next = createRound({
    players: state.players.map(({ playerId, seat }) => ({ playerId, seat })),
    random: { integer: () => 0 },
    roundNumber: state.number,
    deckOrder: createDeck().map((card) => card.id),
    roundCount: state.roundCount,
    completedRounds: state.completedRounds,
    totalScores: state.totalScores,
  });
  for (const player of next.players) player.initialViewOpen = false;
  next.phase = "playing";
  const first = next.players[0]!.playerId;
  const second = next.players[1]!.playerId;

  const allSlots = () => [
    ...next.drawPile.map((_, index) => ({
      get: () => next.drawPile[index]!,
      set: (card: CardId) => {
        next.drawPile[index] = card;
      },
    })),
    ...next.players.flatMap((player) =>
      player.positions.flatMap((position) =>
        position.cardId
          ? [
              {
                get: () => position.cardId!,
                set: (card: CardId) => {
                  position.cardId = card;
                },
              },
            ]
          : [],
      ),
    ),
  ];
  const place = (
    wanted: CardId,
    destination: ReturnType<typeof allSlots>[number],
  ) => {
    const source = allSlots().find((slot) => slot.get() === wanted)!;
    const old = destination.get();
    source.set(old);
    destination.set(wanted);
  };
  const at = (playerId: string, index: number, wanted: CardId) => {
    const position = next.players.find(
      (player) => player.playerId === playerId,
    )!.positions[index]!;
    place(wanted, {
      get: () => position.cardId!,
      set: (card) => {
        position.cardId = card;
      },
    });
  };
  const onTop = (wanted: CardId) =>
    place(wanted, {
      get: () => next.drawPile.at(-1)!,
      set: (card) => {
        next.drawPile[next.drawPile.length - 1] = card;
      },
    });
  const reference = (wanted: CardId) => {
    onTop(wanted);
    const card = next.drawPile.pop()!;
    next.discardPile.push({
      cardId: card,
      origin: "swapped",
      abilityEligible: false,
    });
    openReactionWindow(next, card);
  };
  const keepCards = (playerId: string, count: number) => {
    const player = next.players.find((item) => item.playerId === playerId)!;
    for (const position of player.positions.slice(count)) {
      if (position.cardId) next.drawPile.unshift(position.cardId);
      position.cardId = null;
      position.occupancyVersion += 1;
    }
  };

  switch (scenario) {
    case "ability-2":
      onTop(cardId("hearts", "2"));
      break;
    case "ability-own-look":
      onTop(cardId("hearts", "5"));
      at(first, 0, cardId("clubs", "5"));
      break;
    case "ability-opponent-look":
      onTop(cardId("hearts", "9"));
      at(second, 0, cardId("clubs", "9"));
      break;
    case "ability-black-queen":
      onTop(cardId("spades", "queen"));
      break;
    case "ability-red-king":
      onTop(cardId("hearts", "king"));
      break;
    case "ability-black-king":
      onTop(cardId("clubs", "king"));
      break;
    case "reaction-own":
      reference(cardId("hearts", "5"));
      at(first, 0, cardId("clubs", "5"));
      at(second, 0, cardId("spades", "5"));
      break;
    case "reaction-wrong":
      reference(cardId("hearts", "9"));
      at(first, 0, cardId("clubs", "3"));
      at(first, 1, cardId("clubs", "4"));
      at(first, 2, cardId("clubs", "9"));
      break;
    case "reaction-two-wrong":
      reference(cardId("hearts", "9"));
      at(first, 0, cardId("clubs", "3"));
      at(second, 0, cardId("clubs", "4"));
      break;
    case "reaction-foreign":
      reference(cardId("hearts", "queen"));
      at(second, 0, cardId("clubs", "queen"));
      break;
    case "reaction-during-insight":
      onTop(cardId("hearts", "5"));
      at(first, 0, cardId("clubs", "5"));
      break;
    case "m5-zero-own":
      reference(cardId("hearts", "5"));
      at(first, 0, cardId("clubs", "5"));
      keepCards(first, 1);
      break;
    case "m5-foreign-last":
      reference(cardId("hearts", "queen"));
      at(second, 0, cardId("clubs", "queen"));
      keepCards(first, 1);
      break;
    case "m5-red-king-rescue":
      reference(cardId("hearts", "king"));
      at(second, 0, cardId("clubs", "king"));
      keepCards(second, 1);
      next.effects.push({
        id: nextId(next, "effect"),
        ownerPlayerId: first,
        kind: "give-card",
        phase: "selecting",
        targets: [],
      });
      next.activePlayerId = second;
      break;
    case "m5-kabu":
      at(first, 0, cardId("hearts", "king"));
      break;
    case "m5-kabu-tie":
      at(first, 0, cardId("hearts", "4"));
      at(second, 0, cardId("diamonds", "4"));
      keepCards(first, 1);
      keepCards(second, 1);
      onTop(cardId("hearts", "ace"));
      break;
    case "m5-kabu-early-zero":
      if (next.players.length !== 3)
        throw new Error("This scenario requires three players");
      at(second, 0, cardId("clubs", "ace"));
      keepCards(second, 1);
      onTop(cardId("hearts", "ace"));
      break;
    case "m5-short-game":
      reference(cardId("hearts", "5"));
      at(first, 0, cardId("clubs", "5"));
      keepCards(first, 1);
      break;
    case "m6-grown-field": {
      const player = next.players[0]!;
      for (let index = 0; index < 4; index += 1) {
        const position = nextAdditionalPosition(player);
        const card = next.drawPile.pop()!;
        const existing = player.positions.find(
          (item) => item.id === position.id,
        );
        if (existing) {
          existing.cardId = card;
          existing.occupancyVersion += 1;
        } else {
          player.positions.push({
            ...position,
            cardId: card,
            occupancyVersion: 1,
          });
        }
      }
      reference(cardId("hearts", "5"));
      break;
    }
    case "m6-four-player-grown-fields": {
      if (next.players.length !== 4)
        throw new Error("This scenario requires four players");
      for (const player of next.players) {
        for (let index = 0; index < 4; index += 1) {
          const position = nextAdditionalPosition(player);
          const card = next.drawPile.pop()!;
          const existing = player.positions.find(
            (item) => item.id === position.id,
          );
          if (existing) {
            existing.cardId = card;
            existing.occupancyVersion += 1;
          } else {
            player.positions.push({
              ...position,
              cardId: card,
              occupancyVersion: 1,
            });
          }
        }
      }
      reference(cardId("hearts", "5"));
      break;
    }
  }
  return next;
}

function publicCard(id: CardId): PublicCard {
  const { suit, rank, value } = cardFor(id);
  return { suit, rank, value };
}
export function projectRound(
  state: RoundState,
  playerId: string,
  now = Date.now(),
  publicRevealNow = now,
): RoundView {
  const recipient = state.players.find(
    (player) => player.playerId === playerId,
  );
  if (!recipient) throw new Error("Player is not part of this round");
  const canSeeInitial =
    state.phase === "initial-view" && recipient.initialViewOpen;
  const canSeeAll =
    state.phase === "round-result" || state.phase === "game-over";
  const top = state.discardPile.at(-1);
  const privateEffect = state.effects.find(
    (effect) =>
      effect.ownerPlayerId === playerId &&
      (effect.phase === "viewing" || effect.phase === "deciding") &&
      effect.expiresAt !== undefined &&
      effect.expiresAt > now,
  );
  const visibleReveals = state.publicReveals.filter((reveal) => {
    const position = locatePosition(state, reveal.target).position;
    return (
      reveal.expiresAt > publicRevealNow &&
      position?.cardId === reveal.cardId &&
      position.occupancyVersion === reveal.target.occupancyVersion
    );
  });
  const pendingTransfer = state.pendingTransfers.find(
    (transfer) => transfer.reactingPlayerId === playerId,
  );
  return {
    id: state.id,
    number: state.number,
    phase: state.phase,
    startingPlayerId: state.startingPlayerId,
    activePlayerId: state.activePlayerId,
    drawPileCount: state.drawPile.length,
    ...(top
      ? { discardTop: { ...publicCard(top.cardId), origin: top.origin } }
      : {}),
    turn: { ...state.turn },
    reactionWindow: state.reactionWindow ? { ...state.reactionWindow } : null,
    effects: state.effects.map((effect) => ({
      id: effect.id,
      ownerPlayerId: effect.ownerPlayerId,
      kind: effect.kind,
      phase: effect.phase,
      targets: effect.targets.map((target) => ({ ...target })),
      ...(effect.activated ? { activated: true } : {}),
      ...(effect.expiresAt === undefined
        ? {}
        : { expiresAt: effect.expiresAt }),
    })),
    ...(pendingTransfer
      ? {
          pendingTransfer: {
            id: pendingTransfer.id,
            recipientPlayerId: pendingTransfer.recipientPlayerId,
            recipientPositionId: pendingTransfer.recipientPositionId,
          },
        }
      : {}),
    publicReveals: visibleReveals.map((reveal) => ({
      id: reveal.id,
      target: { ...reveal.target },
      card: publicCard(reveal.cardId),
      expiresAt: reveal.expiresAt,
      reason: reveal.reason ?? "wrong-card",
    })),
    ...(state.lastAction
      ? { lastAction: structuredClone(state.lastAction) }
      : {}),
    restartCount: state.restartCount,
    ...(state.lastRestartReason
      ? { lastRestartReason: state.lastRestartReason }
      : {}),
    roundCount: state.roundCount,
    kabuCallerId: state.kabuCallerId,
    pendingFinalTurns: [...state.pendingFinalTurns],
    finalReactionDeadline: state.finalReactionDeadline,
    endReason: state.endReason,
    completedRounds: state.completedRounds.map((round) => ({
      roundNumber: round.roundNumber,
      endReason: round.endReason,
      kabuCallerId: round.kabuCallerId,
      scores: round.scores.map((score) => ({
        playerId: score.playerId,
        cardPoints: score.cardPoints,
        kabuPenalty: score.kabuPenalty,
        roundPoints: score.roundPoints,
      })),
    })),
    totalScores: { ...state.totalScores },
    nextRoundReady: [...state.nextRoundReady],
    winners: [...state.winners],
    players: state.players.map((player) => ({
      playerId: player.playerId,
      seat: player.seat,
      initialViewClosed: !player.initialViewOpen,
      eliminated: player.eliminated,
      ...(player.finalScore === undefined
        ? {}
        : { finalScore: player.finalScore }),
      positions: player.positions.map((position) => ({
        id: position.id,
        row: position.row,
        column: position.column,
        occupied: position.cardId !== null,
        occupancyVersion: position.occupancyVersion,
        ...(heldBy(state, position.id) ? { held: true } : {}),
        ...(visibleReveals.some(
          (reveal) => reveal.target.positionId === position.id,
        ) && position.cardId
          ? { card: publicCard(position.cardId) }
          : {}),
        ...(canSeeInitial &&
        player.playerId === playerId &&
        position.row === "near" &&
        position.cardId
          ? { card: publicCard(position.cardId) }
          : {}),
        ...(canSeeAll && position.cardId
          ? { card: publicCard(position.cardId) }
          : {}),
      })),
    })),
    you: {
      initialViewOpen: canSeeInitial,
      ...(state.drawnCard?.playerId === playerId
        ? { drawnCard: publicCard(state.drawnCard.cardId) }
        : {}),
      ...(privateEffect
        ? {
            privateEffect: {
              effectId: privateEffect.id,
              expiresAt: privateEffect.expiresAt!,
              cards: privateEffect.targets.flatMap((target) => {
                const card = locatePosition(state, target).position?.cardId;
                return card
                  ? [{ target: { ...target }, card: publicCard(card) }]
                  : [];
              }),
            },
          }
        : {}),
    },
  };
}

export function stateInvariantErrors(state: RoundState): string[] {
  const locations = [
    ...state.drawPile,
    ...state.discardPile.map((entry) => entry.cardId),
    ...state.removedCards,
    ...state.players.flatMap((player) =>
      player.positions.flatMap((position) =>
        position.cardId ? [position.cardId] : [],
      ),
    ),
    ...(state.drawnCard ? [state.drawnCard.cardId] : []),
  ];
  const canonical = new Set(createDeck().map((card) => card.id));
  const errors: string[] = [];
  if (locations.length !== 52)
    errors.push(`Expected 52 card locations, got ${locations.length}`);
  if (new Set(locations).size !== locations.length)
    errors.push("A card occurs at multiple locations");
  if (locations.some((id) => !canonical.has(id)))
    errors.push("An unknown card exists");
  if (state.drawnCard && state.drawnCard.playerId !== state.activePlayerId)
    errors.push("Only the active player may own the drawn card");
  if (
    state.players.some(
      (player) =>
        player.eliminated &&
        (player.positions.some((position) => position.cardId) ||
          player.finalScore === undefined),
    )
  )
    errors.push("An eliminated player still has cards or no final score");
  if (
    state.phase !== "game-over" &&
    state.players.find((player) => player.playerId === state.activePlayerId)
      ?.eliminated
  )
    errors.push("An eliminated player is active");
  for (const effect of state.effects)
    for (const target of effect.targets) {
      const position = locatePosition(state, target).position;
      if (
        !position?.cardId ||
        position.occupancyVersion !== target.occupancyVersion
      )
        errors.push(`Effect ${effect.id} holds a stale target`);
    }
  const held = state.effects.flatMap((effect) =>
    effect.targets.map((target) => target.positionId),
  );
  if (new Set(held).size !== held.length)
    errors.push("A position is held more than once");
  return errors;
}
