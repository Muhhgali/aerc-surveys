export const residentAuthChannels = ["whatsapp", "email", "invite", "mock"] as const;
export type ResidentAuthChannel = (typeof residentAuthChannels)[number];

export const otpGenericError = "Не удалось отправить или проверить код. Попробуйте ещё раз.";

export const otpLimits = {
  codeTtlMs: 10 * 60_000,
  maxAttempts: 5,
  resendCooldownMs: 60_000,
  hourlySendLimit: 5,
} as const;
