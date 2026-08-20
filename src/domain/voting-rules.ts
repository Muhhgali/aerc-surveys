export const votingRuleTypes = [
  "percentage_of_all_eligible",
  "percentage_of_participants",
  "two_thirds_of_all",
  "two_thirds_of_participants",
  "custom_percentage",
] as const;

export type VotingRuleType = (typeof votingRuleTypes)[number];

export interface VotingRule {
  type: VotingRuleType;
  /** Percent of the chosen denominator that must vote FOR. Ignored for two_thirds_*. */
  thresholdPercent: number;
}

export const defaultVotingRule: VotingRule = { type: "percentage_of_all_eligible", thresholdPercent: 51 };

export interface QuestionTally {
  for: number;
  against: number;
  abstain: number;
  eligible: number;
  participated: number;
}

export interface QuestionDecision {
  accepted: boolean;
  requiredFor: number;
  denominator: number;
  thresholdPercent: number;
  explanationRu: string;
}

export function parseVotingRule(value: unknown): VotingRule {
  if (!value || typeof value !== "object") return { ...defaultVotingRule };
  const record = value as Record<string, unknown>;
  const type = votingRuleTypes.includes(record.type as VotingRuleType) ? (record.type as VotingRuleType) : defaultVotingRule.type;
  const raw = Number(record.thresholdPercent);
  const thresholdPercent = Number.isFinite(raw) && raw > 0 && raw <= 100 ? raw : defaultVotingRule.thresholdPercent;
  if (type === "two_thirds_of_all" || type === "two_thirds_of_participants") return { type, thresholdPercent: 200 / 3 };
  return { type, thresholdPercent };
}

export function decorateChoiceCounts(counts: { for: number; against: number; abstain: number }) {
  const total = counts.for + counts.against + counts.abstain;
  const percent = (value: number) => (total === 0 ? 0 : Math.round((value * 10000) / total) / 100);
  return {
    ...counts,
    total,
    percentFor: percent(counts.for),
    percentAgainst: percent(counts.against),
    percentAbstain: percent(counts.abstain),
  };
}

export function formatChoiceTallyLine(counts: { for: number; against: number; abstain: number }): string {
  const decorated = decorateChoiceCounts(counts);
  return `За ${decorated.for} (${decorated.percentFor}%)   Против ${decorated.against} (${decorated.percentAgainst}%)   Воздержался ${decorated.abstain} (${decorated.percentAbstain}%)`;
}

export function evaluateQuestionDecision(rule: VotingRule, tally: QuestionTally): QuestionDecision {
  const parsed = parseVotingRule(rule);
  const usesParticipants = parsed.type === "percentage_of_participants" || parsed.type === "two_thirds_of_participants";
  const denominator = usesParticipants ? tally.participated : tally.eligible;
  const thresholdPercent = parsed.type.startsWith("two_thirds") ? 200 / 3 : parsed.thresholdPercent;
  const requiredFor = denominator <= 0 ? Number.POSITIVE_INFINITY : Math.ceil((denominator * thresholdPercent) / 100);
  const accepted = denominator > 0 && tally.for >= requiredFor;
  const percentLabel = Number.isInteger(thresholdPercent) ? String(thresholdPercent) : thresholdPercent.toFixed(2);
  const basis = usesParticipants ? "проголосовавших" : "всех eligible собственников";
  return {
    accepted,
    requiredFor: Number.isFinite(requiredFor) ? requiredFor : 0,
    denominator,
    thresholdPercent,
    explanationRu: denominator <= 0
      ? "Нет базы для расчёта: eligible или число проголосовавших равно нулю."
      : `Нужно ЗА ≥ ${percentLabel}% от ${basis} (${denominator}): минимум ${requiredFor} голосов «за». Получено ${tally.for}. Решение: ${accepted ? "ПРИНЯТО" : "НЕ ПРИНЯТО"}.`,
  };
}
