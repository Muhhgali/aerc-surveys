export const voteStates = ["draft", "ready_to_sign", "signing", "signed", "submitted", "voided"] as const;
export type VoteState = (typeof voteStates)[number];

const transitions: Readonly<Record<VoteState, readonly VoteState[]>> = {
  draft: ["ready_to_sign", "voided"],
  ready_to_sign: ["signing", "voided"],
  signing: ["ready_to_sign", "signed", "voided"],
  signed: ["submitted", "voided"],
  submitted: [],
  voided: [],
};

export function canTransitionVote(from: VoteState, to: VoteState): boolean {
  return transitions[from].includes(to);
}

export function assertVoteTransition(from: VoteState, to: VoteState): void {
  if (!canTransitionVote(from, to)) throw new InvalidVoteTransitionError(from, to);
}

export function answersAreMutable(state: VoteState): boolean {
  return state === "draft";
}

export class InvalidVoteTransitionError extends Error {
  constructor(readonly from: VoteState, readonly to: VoteState) {
    super(`Invalid vote transition: ${from} -> ${to}`);
    this.name = "InvalidVoteTransitionError";
  }
}
