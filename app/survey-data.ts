export type Answer = "За" | "Против" | "Воздержусь";

export type SurveyQuestion = {
  id?: string;
  short: string;
  text: string;
};

export type Survey = {
  id: string;
  backendId?: string;
  protocol: string;
  title: string;
  subtitle: string;
  deadline: string;
  deadlineShort: string;
  duration: string;
  status: "active" | "soon" | "complete";
  questions: SurveyQuestion[];
};

export type ArchivedSheet = {
  id: string;
  protocol: string;
  title: string;
  date: string;
  time: string;
  documentId: string;
  address: string;
  account: string;
  apartment: string;
  questions: SurveyQuestion[];
  answers: (Answer | null)[];
};

// The owner survey catalogue is served by /api/surveys from PostgreSQL.
// Demo archive sheets remain as historical examples; submitted votes are listed from /api/documents.
export const archivedSheets: ArchivedSheet[] = [
  {
    id: "8",
    protocol: "8",
    title: "Выбор сервисной компании",
    date: "12.06.2026",
    time: "16:45",
    documentId: "AERC-VOTE-2026-00000852",
    address: "г. Астана, ул. Геодезическая, д. 12",
    account: "1911",
    apartment: "52",
    questions: [
      { short: "Сервисная компания", text: "Утвердить ТОО «Қала Сервис» в качестве сервисной организации дома." },
      { short: "Срок договора", text: "Заключить договор обслуживания сроком на один год." },
      { short: "Тариф", text: "Утвердить предложенный ежемесячный тариф на обслуживание общего имущества." },
    ],
    answers: ["За", "За", "Воздержусь"],
  },
  {
    id: "5",
    protocol: "5",
    title: "Подготовка дома к отопительному сезону",
    date: "18.03.2026",
    time: "11:20",
    documentId: "AERC-VOTE-2026-00000552",
    address: "г. Астана, ул. Геодезическая, д. 12",
    account: "1911",
    apartment: "52",
    questions: [
      { short: "Промывка системы", text: "Провести гидропневматическую промывку системы отопления дома." },
      { short: "Тепловой узел", text: "Выполнить диагностику и настройку общедомового теплового узла." },
      { short: "Утепление", text: "Устранить выявленные теплопотери в подвальных и технических помещениях." },
      { short: "Акт готовности", text: "Поручить управляющей организации получить акт готовности до начала сезона." },
    ],
    answers: ["За", "За", "Против", "За"],
  },
];

export const defaultAnswers = (survey: Survey): (Answer | null)[] =>
  survey.questions.map(() => null);
