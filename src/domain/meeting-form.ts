export const meetingForms = ["in_person", "absentee", "mixed", "electronic"] as const;
export type MeetingForm = (typeof meetingForms)[number];

export const meetingFormLabels: Record<MeetingForm, { ru: string; kk: string }> = {
  in_person: { ru: "Очное", kk: "Күндізгі" },
  absentee: { ru: "Заочное", kk: "Сырттай" },
  mixed: { ru: "Смешанное", kk: "Аралас" },
  electronic: { ru: "Электронное", kk: "Электрондық" },
};

export const documentLanguages = ["ru", "kk", "bilingual"] as const;
export type DocumentLanguage = (typeof documentLanguages)[number];
