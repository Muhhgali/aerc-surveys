import { DEMO_ADMIN_LOGIN, DEMO_ADMIN_PASSWORD } from "../src/domain/demo-fixtures";

const origin = process.env.DEMO_BASE_URL ?? "https://aerc-surveys.vercel.app";

const wanted = [
  {
    protocolNumber: "14",
    titleRu: "Смета на ремонт кровли",
    titleKk: "Шатырды жөндеу сметасы",
    descriptionRu: "ОСИ-КСК предлагает утвердить смету и сроки работ по кровле.",
    descriptionKk: "ОСИ-КСК шатыр жұмыстарының сметасы мен мерзімін бекітуді ұсынады.",
    questions: [
      ["Утвердить смету текущего ремонта кровли на 2026 год.", "2026 жылға шатырды ағымдағы жөндеу сметасы бекітілсін."],
      ["Согласовать выполнение работ в летний период.", "Жұмыстарды жазғы кезеңде орындау келісілсін."],
      ["Поручить ОСИ ежемесячно публиковать отчёт о расходовании средств.", "ОСИ-ға қаражат жұмсалуы туралы ай сайын есеп жариялау тапсырылсын."],
    ],
  },
  {
    protocolNumber: "21",
    titleRu: "Правила парковки во дворе",
    titleKk: "Ауладағы тұрақ ережелері",
    descriptionRu: "КСК «Геодезическая-12» направляет опрос по порядку парковки.",
    descriptionKk: "«Геодезическая-12» КСК тұрақ тәртібі бойынша сауалнама жібереді.",
    questions: [
      ["Утвердить схему парковочных мест на придомовой территории.", "Үй маңындағы тұрақ орындарының схемасы бекітілсін."],
      ["Запретить стоянку во втором ряду у подъездов.", "Кіреберістер жанында екінші қатарда тұраққа тыйым салынсын."],
      ["Ввести дежурство по контролю парковки в выходные.", "Демалыс күндері тұрақты бақылау кезекшілігі енгізілсін."],
    ],
  },
  {
    protocolNumber: "33",
    titleRu: "Выбор подрядчика по уборке",
    titleKk: "Жинау мердігерін таңдау",
    descriptionRu: "Управляющая компания предлагает выбрать подрядчика клининга.",
    descriptionKk: "Басқарушы компания клиринг мердігерін таңдауды ұсынады.",
    questions: [
      ["Утвердить ТОО «Таза Аула» подрядчиком уборки мест общего пользования.", "«Таза Аула» ЖШС ортақ пайдалану орындарын жинау мердігері болып бекітілсін."],
      ["Согласовать график уборки два раза в сутки.", "Тәулігіне екі рет жинау кестесі келісілсін."],
      ["Утвердить предложенный тариф на 2026 год.", "2026 жылға ұсынылған тариф бекітілсін."],
    ],
  },
] as const;

const cameraSurvey = {
  protocolNumber: "41",
  titleRu: "Установка системы видеонаблюдения в многоквартирном жилом доме",
  titleKk: "Көпқабатты тұрғын үйде бейнебақылау жүйесін орнату",
  descriptionRu: "ОСИ-КСК проводит письменный опрос собственников по установке видеонаблюдения.",
  descriptionKk: "ОСИ-КСК бейнебақылау орнату бойынша меншік иелерінің жазбаша сауалнамасын өткізеді.",
  questions: [
    ["Поддерживаете ли вы установку видеонаблюдения?", "Бейнебақылау орнатуды қолдайсыз ба?"],
    ["Согласны ли вы с установкой камер во входных группах и возле лифтов?", "Кіреберістер мен лифт маңына камера орнатуға келісесіз бе?"],
    ["Поддерживаете ли вы финансирование установки за счёт целевого взноса?", "Орнатуды нысаналы жарна есебінен қаржыландыруды қолдайсыз ба?"],
  ],
  signatories: [
    ["meeting_chairman", "Касымов Ерлан Болатович"],
    ["secretary", "Нурланова Айгуль Сериковна"],
    ["responsible_person", "Жумабаев Арман Кайратович"],
    ["council_member", "Сатпаев Нурлан Темирович"],
    ["council_member", "Ибраева Дина Маратовна"],
    ["council_member", "Оспанов Бауыржан Серикович"],
  ],
  policy: [
    ["meeting_chairman", 1],
    ["secretary", 1],
    ["responsible_person", 1],
    ["council_member", 3],
  ],
} as const;

function cookieHeader(response: Response) {
  const setter = response.headers.getSetCookie?.() ?? [];
  if (setter.length) return setter.map((entry) => entry.split(";", 1)[0]).join("; ");
  const fallback = response.headers.get("set-cookie");
  return fallback ? fallback.split(";", 1)[0] : "";
}

async function json(response: Response) {
  const text = await response.text();
  try { return JSON.parse(text) as Record<string, unknown>; } catch { return { raw: text.slice(0, 400) }; }
}

async function main() {
  const headers = (cookie: string) => ({ origin, cookie, "content-type": "application/json" });
  const login = await fetch(`${origin}/api/dev/admin-session`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ method: "password", login: DEMO_ADMIN_LOGIN, password: DEMO_ADMIN_PASSWORD }),
  });
  if (!login.ok) throw new Error(`admin login ${login.status} ${JSON.stringify(await json(login))}`);
  const loginBody = await json(login);
  const adminUserId = String((loginBody.user as { id?: string } | undefined)?.id ?? "");
  if (!adminUserId) throw new Error("admin login did not return a user id");
  let cookie = cookieHeader(login);

  const list = await fetch(`${origin}/api/admin/surveys?page=1&pageSize=100`, { headers: { cookie, origin } });
  if (!list.ok) throw new Error(`list ${list.status} ${JSON.stringify(await json(list))}`);
  const body = await list.json() as { items: { id: string; protocolNumber: string; status: string; titleRu: string }[] };
  const existing = new Map(body.items.map((item) => [item.protocolNumber, item]));
  console.info("admin-surveys", body.items.map((item) => `${item.protocolNumber}:${item.status}`).join(", ") || "(none)");

  const references = await fetch(`${origin}/api/admin/references`, { headers: { cookie, origin } });
  if (!references.ok) throw new Error(`references ${references.status} ${JSON.stringify(await json(references))}`);
  const refBody = await references.json() as { accounts: { id: string; accountNumber: string }[] };
  const account = refBody.accounts.find((item) => item.accountNumber === "1911");
  if (!account) throw new Error("personal account 1911 is missing");

  const startsAt = new Date(Date.now() - 60_000).toISOString();
  const closesAt = new Date("2026-12-31T23:59:59+05:00").toISOString();

  for (const survey of wanted) {
    const already = existing.get(survey.protocolNumber);
    if (already?.status === "active") {
      console.info("skip-active", survey.protocolNumber);
      continue;
    }
    let id = already?.id;
    if (!id) {
      const created = await fetch(`${origin}/api/admin/surveys`, {
        method: "POST",
        headers: headers(cookie),
        body: JSON.stringify({
          protocolNumber: survey.protocolNumber,
          titleRu: survey.titleRu,
          titleKk: survey.titleKk,
          descriptionRu: survey.descriptionRu,
          descriptionKk: survey.descriptionKk,
          startsAt,
          closesAt,
          meetingForm: "electronic",
        }),
      });
      if (created.status !== 201) throw new Error(`create ${survey.protocolNumber} ${created.status} ${JSON.stringify(await json(created))}`);
      id = (await created.json() as { id: string }).id;
      console.info("created", survey.protocolNumber);
    } else {
      console.info("reuse-draft", survey.protocolNumber);
    }

    const details = await fetch(`${origin}/api/admin/surveys/${id}`, { headers: { cookie, origin } });
    const detail = await details.json() as { questions?: { id: string }[] };
    if (!detail.questions?.length) {
      for (const [textRu, textKk] of survey.questions) {
        const question = await fetch(`${origin}/api/admin/surveys/${id}/questions`, {
          method: "POST",
          headers: headers(cookie),
          body: JSON.stringify({ textRu, textKk, required: true }),
        });
        if (![200, 201].includes(question.status)) throw new Error(`question ${survey.protocolNumber} ${question.status} ${JSON.stringify(await json(question))}`);
      }
    }

    const targets = await fetch(`${origin}/api/admin/surveys/${id}/targets`, {
      method: "PUT",
      headers: headers(cookie),
      body: JSON.stringify({ targets: [{ type: "personal_account", personalAccountId: account.id }] }),
    });
    if (!targets.ok) throw new Error(`targets ${survey.protocolNumber} ${targets.status} ${JSON.stringify(await json(targets))}`);

    const published = await fetch(`${origin}/api/admin/surveys/${id}/publish`, { method: "POST", headers: headers(cookie) });
    if (!published.ok) throw new Error(`publish ${survey.protocolNumber} ${published.status} ${JSON.stringify(await json(published))}`);
    console.info("published", survey.protocolNumber);
  }

  const alreadyCamera = existing.get(cameraSurvey.protocolNumber);
  if (alreadyCamera?.status === "active" && alreadyCamera.titleRu.includes("видеонаблюдения")) {
    console.info("skip-active", cameraSurvey.protocolNumber);
  } else {
    let id = alreadyCamera?.status === "draft" ? alreadyCamera.id : undefined;
    if (!id) {
      const created = await fetch(`${origin}/api/admin/surveys`, {
        method: "POST",
        headers: headers(cookie),
        body: JSON.stringify({
          protocolNumber: alreadyCamera ? `41-${Date.now().toString().slice(-6)}` : cameraSurvey.protocolNumber,
          titleRu: cameraSurvey.titleRu,
          titleKk: cameraSurvey.titleKk,
          descriptionRu: cameraSurvey.descriptionRu,
          descriptionKk: cameraSurvey.descriptionKk,
          startsAt,
          closesAt,
          meetingForm: "electronic",
        }),
      });
      if (created.status !== 201) throw new Error(`create ${cameraSurvey.protocolNumber} ${created.status} ${JSON.stringify(await json(created))}`);
      id = (await created.json() as { id: string }).id;
      console.info("created", cameraSurvey.protocolNumber, id);
    }
    const details = await fetch(`${origin}/api/admin/surveys/${id}`, { headers: { cookie, origin } });
    const detail = await details.json() as { questions?: { id: string }[] };
    if (!detail.questions?.length) {
      for (const [textRu, textKk] of cameraSurvey.questions) {
        const question = await fetch(`${origin}/api/admin/surveys/${id}/questions`, {
          method: "POST",
          headers: headers(cookie),
          body: JSON.stringify({ textRu, textKk, required: true }),
        });
        if (![200, 201].includes(question.status)) throw new Error(`camera question ${question.status} ${JSON.stringify(await json(question))}`);
      }
    }
    const targets = await fetch(`${origin}/api/admin/surveys/${id}/targets`, {
      method: "PUT",
      headers: headers(cookie),
      body: JSON.stringify({ targets: [{ type: "personal_account", personalAccountId: account.id }] }),
    });
    if (!targets.ok) throw new Error(`camera targets ${targets.status} ${JSON.stringify(await json(targets))}`);
    const signatories = await fetch(`${origin}/api/admin/surveys/${id}/signatories`, {
      method: "PUT",
      headers: headers(cookie),
      body: JSON.stringify({
        signatories: cameraSurvey.signatories.map(([roleKey, displayName]) => ({ userId: adminUserId, roleKey, displayName })),
      }),
    });
    if (!signatories.ok) throw new Error(`camera signatories ${signatories.status} ${JSON.stringify(await json(signatories))}`);
    const policy = await fetch(`${origin}/api/admin/surveys/${id}/signature-policy`, {
      method: "PUT",
      headers: headers(cookie),
      body: JSON.stringify({
        policy: cameraSurvey.policy.map(([roleKey, minRequired]) => ({ roleKey, minRequired })),
      }),
    });
    if (!policy.ok) throw new Error(`camera policy ${policy.status} ${JSON.stringify(await json(policy))}`);
    const published = await fetch(`${origin}/api/admin/surveys/${id}/publish`, { method: "POST", headers: headers(cookie) });
    if (!published.ok) throw new Error(`camera publish ${published.status} ${JSON.stringify(await json(published))}`);
    console.info("published", cameraSurvey.protocolNumber, id);
  }

  await fetch(`${origin}/api/session`, { method: "DELETE", headers: headers(cookie) });
  const ownerLogin = await fetch(`${origin}/api/dev/session`, { method: "POST", headers: { origin } });
  if (!ownerLogin.ok) throw new Error(`owner login ${ownerLogin.status} ${JSON.stringify(await json(ownerLogin))}`);
  cookie = cookieHeader(ownerLogin);
  const catalogue = await fetch(`${origin}/api/surveys`, { headers: { cookie } });
  if (!catalogue.ok) throw new Error(`catalogue ${catalogue.status} ${JSON.stringify(await json(catalogue))}`);
  const catalogueBody = await catalogue.json() as { surveys: { protocol: string; title: string; status: string }[] };
  console.info("owner-catalogue", catalogueBody.surveys.map((item) => `${item.protocol}:${item.status}:${item.title}`));
  console.info("owner-count", catalogueBody.surveys.length);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "ensure demo surveys failed");
  process.exit(1);
});
