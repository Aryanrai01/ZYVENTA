/** Who is attempting a status change. SYSTEM = background jobs, webhooks, reconciliation. */
export const TRANSITION_ACTORS = ['CUSTOMER', 'SELLER', 'ADMIN', 'SYSTEM'] as const;
export type TransitionActor = (typeof TRANSITION_ACTORS)[number];

export type TransitionRules<S extends string> = Readonly<
  Record<S, Readonly<Partial<Record<S, readonly TransitionActor[]>>>>
>;

export interface StateMachine<S extends string> {
  /** True if `actor` may move a record from `from` to `to`. */
  canTransition(from: S, to: S, actor: TransitionActor): boolean;
  /** Statuses reachable from `from` for `actor` (drives dashboard action buttons). */
  nextStatuses(from: S, actor: TransitionActor): S[];
  isTerminal(status: S): boolean;
}

/**
 * Table-driven state machine. Any transition not listed is rejected — there are no implicit
 * edges, so a new status cannot be reached until someone deliberately adds a rule for it.
 */
export function createStateMachine<S extends string>(rules: TransitionRules<S>): StateMachine<S> {
  return {
    canTransition(from, to, actor) {
      return rules[from][to]?.includes(actor) ?? false;
    },
    nextStatuses(from, actor) {
      return (Object.keys(rules[from]) as S[]).filter((to) => rules[from][to]?.includes(actor));
    },
    isTerminal(status) {
      return Object.keys(rules[status]).length === 0;
    },
  };
}
