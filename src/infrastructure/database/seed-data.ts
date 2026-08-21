import {
  DEMO_ADMIN_LOGIN, DEMO_ADMIN_PASSWORD, DEMO_CHAIRMAN_LOGIN, DEMO_CHAIRMAN_PASSWORD,
  DEMO_OWNER_FULL_NAME, DEMO_OWNER_PHONE,
} from "@/src/domain/demo-fixtures";
import { hashPassword } from "@/src/infrastructure/auth/password-hasher";
import type { DatabaseClient } from "@/src/infrastructure/database/client";
import type postgres from "postgres";

type Tx = postgres.TransactionSql;

export const seedIds = {
  voterUser: "00000000-0000-4000-8000-000000000001",
  representativeUser: "00000000-0000-4000-8000-000000000002",
  chairmanUser: "00000000-0000-4000-8000-000000000003",
  organization: "00000000-0000-4000-8000-000000000101",
  organizationKsk: "00000000-0000-4000-8000-000000000102",
  organizationService: "00000000-0000-4000-8000-000000000103",
  organizationChairman: "00000000-0000-4000-8000-000000000104",
  property: "00000000-0000-4000-8000-000000000201",
  property1912: "00000000-0000-4000-8000-000000000202",
  property2048: "00000000-0000-4000-8000-000000000203",
  personalAccount: "00000000-0000-4000-8000-000000000301",
  personalAccount1912: "00000000-0000-4000-8000-000000000302",
  personalAccount2048: "00000000-0000-4000-8000-000000000303",
  survey12: "00000000-0000-4000-8000-000000000012",
  survey41: "00000000-0000-4000-8000-000000000041",
  participant: "00000000-0000-4000-8000-000000000401",
  participant41: "00000000-0000-4000-8000-000000000441",
  questions: [1, 2, 3, 4, 5, 6].map((number) => `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`),
} as const;

/** E2E-only voting fixtures. Development and hosted demo seed no surveys — the chairman creates them. */
export const seededSurveyIds = [seedIds.survey12, seedIds.survey41] as const;
export const seededUserIds = [seedIds.voterUser, seedIds.representativeUser, seedIds.chairmanUser] as const;
export const seededOrganizationIds = [
  seedIds.organization, seedIds.organizationKsk, seedIds.organizationService, seedIds.organizationChairman,
] as const;

const protocol12Questions = [
  "Утвердить план текущего ремонта подъездов многоквартирного жилого дома на 2026 год.",
  "Утвердить установку дополнительных камер видеонаблюдения в подъездах и на придомовой территории.",
  "Утвердить замену осветительных приборов в местах общего пользования на энергоэффективные LED-светильники.",
  "Утвердить проведение работ по благоустройству придомовой территории.",
  "Утвердить проведение профилактического обслуживания инженерных сетей многоквартирного жилого дома.",
  "Утвердить предложенный порядок информирования собственников о выполненных работах и расходовании средств.",
];

function questionId(protocol: string, position: number): string {
  return `00000000-0000-4000-8000-00000000${protocol}${String(position).padStart(2, "0")}`;
}

async function purgeOperationalData(transaction: Tx): Promise<void> {
  await transaction`
    truncate table official_signatures, survey_result_snapshots, survey_eligibility_snapshots, otp_challenges,
      invitations, vote_contact_details, survey_signatories, survey_signature_policies, survey_versions,
      document_versions, documents, signature_requests, visual_signatures, binary_assets, vote_autosaves,
      vote_answers, votes, vote_sessions, auth_sessions, survey_questions, survey_targets, survey_participants
    restart identity cascade
  `;
  await transaction`update surveys set status = 'draft'`;
  await transaction`delete from surveys`;
  await transaction`truncate table audit_logs restart identity`;
}

async function seedTestSurveyFixtures(transaction: Tx): Promise<void> {
  await transaction`
    insert into surveys (id, organization_id, protocol_number, title_ru, description_ru, status, starts_at, closes_at, published_at)
    values (${seedIds.survey12}, ${seedIds.organization}, '12', 'Собрание собственников дома',
            'ОСИ-КСК проводит голосование по текущему содержанию дома.', 'draft',
            '2026-08-01T00:00:00+05:00', '2026-12-31T23:59:59+05:00', '2026-08-01T00:00:00+05:00')
  `;
  for (let index = 0; index < protocol12Questions.length; index += 1) {
    await transaction`
      insert into survey_questions (id, survey_id, position, text_ru, required, status)
      values (${seedIds.questions[index]}, ${seedIds.survey12}, ${index + 1}, ${protocol12Questions[index]}, true, 'active')
    `;
  }
  await transaction`
    insert into survey_targets (survey_id, target_type, personal_account_id)
    values (${seedIds.survey12}, 'personal_account', ${seedIds.personalAccount})
  `;
  await transaction`
    insert into survey_participants (id, survey_id, user_id, property_id, personal_account_id, status, verified_source, verified_at, eligibility_metadata)
    values (${seedIds.participant}, ${seedIds.survey12}, ${seedIds.voterUser}, ${seedIds.property}, ${seedIds.personalAccount},
            'eligible', 'mock', now(), ${transaction.json({ verified: true, developmentSeed: true })})
  `;
  await transaction`update surveys set status='active', updated_at=now() where id=${seedIds.survey12}`;

  await transaction`
    insert into surveys (id, organization_id, protocol_number, title_ru, title_kk, description_ru, description_kk, status, starts_at, closes_at, published_at, meeting_form, document_language)
    values (${seedIds.survey41}, ${seedIds.organization}, '41',
            'Установка системы видеонаблюдения в многоквартирном жилом доме',
            'Көпқабатты тұрғын үйде бейнебақылау жүйесін орнату',
            'ОСИ-КСК проводит письменный опрос собственников по установке видеонаблюдения.',
            'ОСИ-КСК бейнебақылау орнату бойынша меншік иелерінің жазбаша сауалнамасын өткізеді.',
            'draft', now() - interval '1 hour', now() + interval '30 days', now(), 'electronic', 'ru')
  `;
  const cameraQuestions = [
    ["Поддерживаете ли вы установку видеонаблюдения?", "Бейнебақылау орнатуды қолдайсыз ба?"],
    ["Согласны ли вы с установкой камер во входных группах и возле лифтов?", "Кіреберістер мен лифт маңына камера орнатуға келісесіз бе?"],
    ["Поддерживаете ли вы финансирование установки за счёт целевого взноса?", "Орнатуды нысаналы жарна есебінен қаржыландыруды қолдайсыз ба?"],
  ] as const;
  for (let index = 0; index < cameraQuestions.length; index += 1) {
    const id = questionId("41", index + 1);
    await transaction`
      insert into survey_questions (id, survey_id, position, text_ru, text_kk, required, status)
      values (${id}, ${seedIds.survey41}, ${index + 1}, ${cameraQuestions[index][0]}, ${cameraQuestions[index][1]}, true, 'active')
    `;
  }
  await transaction`
    insert into survey_targets (survey_id, target_type, personal_account_id)
    values (${seedIds.survey41}, 'personal_account', ${seedIds.personalAccount})
  `;
  await transaction`
    insert into survey_participants (id, survey_id, user_id, property_id, personal_account_id, status, verified_source, verified_at, eligibility_metadata)
    values (${seedIds.participant41}, ${seedIds.survey41}, ${seedIds.voterUser}, ${seedIds.property}, ${seedIds.personalAccount},
            'eligible', 'mock', now(), ${transaction.json({ verified: true, developmentSeed: true })})
  `;
  const cameraSignatories = [
    ["meeting_chairman", "Касымов Ерлан Болатович"],
    ["secretary", "Нурланова Айгуль Сериковна"],
    ["responsible_person", "Жумабаев Арман Кайратович"],
    ["council_member", "Сатпаев Нурлан Темирович"],
    ["council_member", "Ибраева Дина Маратовна"],
    ["council_member", "Оспанов Бауыржан Серикович"],
  ] as const;
  for (const [roleKey, displayName] of cameraSignatories) {
    await transaction`
      insert into survey_signatories (survey_id, user_id, role_key, display_name)
      values (${seedIds.survey41}, ${seedIds.representativeUser}, ${roleKey}, ${displayName})
    `;
  }
  for (const [roleKey, minRequired] of [["meeting_chairman", 1], ["secretary", 1], ["responsible_person", 1], ["council_member", 3]] as const) {
    await transaction`insert into survey_signature_policies (survey_id, role_key, min_required) values (${seedIds.survey41}, ${roleKey}, ${minRequired})`;
  }
  await transaction`update surveys set status='active', updated_at=now() where id=${seedIds.survey41}`;
}

export async function seedDevelopmentData(sql: DatabaseClient): Promise<void> {
  const [demoAdminPasswordHash, chairmanPasswordHash] = await Promise.all([
    hashPassword(DEMO_ADMIN_PASSWORD),
    hashPassword(DEMO_CHAIRMAN_PASSWORD),
  ]);
  await sql.begin(async (transaction) => {
    await purgeOperationalData(transaction);
    await transaction`
      delete from user_credentials
      where login in (${DEMO_ADMIN_LOGIN}, ${DEMO_CHAIRMAN_LOGIN})
        and user_id not in (${seedIds.representativeUser}, ${seedIds.chairmanUser})
    `;
    await transaction`
      delete from organizations
      where bin = '333333333333' and id <> ${seedIds.organizationChairman}
    `;
    await transaction`
      insert into users (id, display_name, email, phone, type, status)
      values (${seedIds.voterUser}, ${DEMO_OWNER_FULL_NAME}, null, ${DEMO_OWNER_PHONE}, 'individual', 'active'),
             (${seedIds.representativeUser}, 'Представитель ОСИ-КСК', ${DEMO_ADMIN_LOGIN}, null, 'organization_representative', 'active'),
             (${seedIds.chairmanUser}, 'Касымов Ерлан Болатович', ${DEMO_CHAIRMAN_LOGIN}, null, 'organization_representative', 'active')
      on conflict (id) do update set display_name = excluded.display_name, email = excluded.email, phone = excluded.phone, updated_at = now()
    `;
    await transaction`
      insert into external_identities (user_id, provider, provider_subject, verified_at, metadata)
      values (${seedIds.voterUser}, 'mock', 'mock-subject-1911', now(), ${transaction.json({ developmentSeed: true })}),
             (${seedIds.representativeUser}, 'mock', 'mock-admin', now(), ${transaction.json({ developmentSeed: true, administrative: true })})
      on conflict (provider, provider_subject) do update set user_id = excluded.user_id, verified_at = excluded.verified_at
    `;
    await transaction`
      insert into organizations (id, bin, legal_name, display_name, type, status)
      values
        (${seedIds.organization}, '000000000000', 'ТОО «ОСИ-КСК»', 'ОСИ-КСК', 'osi', 'active'),
        (${seedIds.organizationKsk}, '111111111111', 'КСК «Геодезическая-12»', 'КСК «Геодезическая-12»', 'ksk', 'active'),
        (${seedIds.organizationService}, '222222222222', 'ТОО «Үй Сервис»', 'Үй Сервис', 'management_company', 'active'),
        (${seedIds.organizationChairman}, '333333333333', 'ОСИ «ЖК Геодезическая, 12»', 'ОСИ «ЖК Геодезическая, 12»', 'osi', 'active')
      on conflict (id) do update set legal_name = excluded.legal_name, display_name = excluded.display_name, bin = excluded.bin, updated_at = now()
    `;
    await transaction`
      insert into organization_members (user_id, organization_id, role, verified_source, verified_at)
      values
        (${seedIds.representativeUser}, ${seedIds.organization}, 'administrator', 'development_seed', now()),
        (${seedIds.representativeUser}, ${seedIds.organizationKsk}, 'administrator', 'development_seed', now()),
        (${seedIds.representativeUser}, ${seedIds.organizationService}, 'administrator', 'development_seed', now()),
        (${seedIds.chairmanUser}, ${seedIds.organizationChairman}, 'administrator', 'development_seed', now())
      on conflict (user_id, organization_id) do update set role = excluded.role, verified_at = excluded.verified_at
    `;
    await transaction`
      insert into platform_access_controls (user_id)
      values (${seedIds.representativeUser}), (${seedIds.chairmanUser})
      on conflict (user_id) do update set disabled_at = null, disabled_by_user_id = null, updated_at = now()
    `;
    await transaction`
      insert into user_platform_roles (user_id, role_id, assigned_by_user_id)
      select ${seedIds.representativeUser}, id, ${seedIds.representativeUser}
      from platform_roles where role_key = 'super_admin'
      on conflict (user_id, role_id) do nothing
    `;
    await transaction`delete from organization_access_grants where user_id in (${seedIds.representativeUser}, ${seedIds.chairmanUser})`;
    await transaction`
      insert into organization_access_grants (user_id, organization_id, role_key, permissions)
      values
        (${seedIds.representativeUser}, ${seedIds.organization}, 'chairman', ${transaction.json([])}),
        (${seedIds.chairmanUser}, ${seedIds.organizationChairman}, 'chairman', ${transaction.json([])})
    `;
    await transaction`
      insert into user_credentials (user_id, login, password_hash, must_change_password)
      values
        (${seedIds.representativeUser}, ${DEMO_ADMIN_LOGIN}, ${demoAdminPasswordHash}, false),
        (${seedIds.chairmanUser}, ${DEMO_CHAIRMAN_LOGIN}, ${chairmanPasswordHash}, false)
      on conflict (user_id) do update set login = excluded.login, password_hash = excluded.password_hash,
        must_change_password = false, failed_attempts = 0, locked_until = null, updated_at = now()
    `;
    await transaction`
      insert into properties (id, city, street, building, premise, property_type, external_property_id, source, status)
      values
        (${seedIds.property}, 'Астана', 'Геодезическая', '12', '52', 'apartment', 'mock-property-geodezicheskaya-12-52', 'mock', 'active'),
        (${seedIds.property1912}, 'Астана', 'Геодезическая', '12', '18', 'apartment', 'mock-property-geodezicheskaya-12-18', 'mock', 'active'),
        (${seedIds.property2048}, 'Астана', 'Сарайшык', '5', '11', 'apartment', 'mock-property-sarayshyk-5-11', 'mock', 'active')
      on conflict (id) do update set status = 'active', updated_at = now()
    `;
    await transaction`
      insert into personal_accounts (id, external_account_id, account_number, property_id, source, status, last_verified_at)
      values
        (${seedIds.personalAccount}, 'mock-account-1911', '1911', ${seedIds.property}, 'mock', 'active', now()),
        (${seedIds.personalAccount1912}, 'mock-account-1912', '1912', ${seedIds.property1912}, 'mock', 'active', now()),
        (${seedIds.personalAccount2048}, 'mock-account-2048', '2048', ${seedIds.property2048}, 'mock', 'active', now())
      on conflict (id) do update set status = 'active', last_verified_at = now(), updated_at = now()
    `;
    for (const holding of [
      { propertyId: seedIds.property, accountId: seedIds.personalAccount },
      { propertyId: seedIds.property1912, accountId: seedIds.personalAccount1912 },
      { propertyId: seedIds.property2048, accountId: seedIds.personalAccount2048 },
    ] as const) {
      await transaction`
        insert into property_holdings (user_id, property_id, personal_account_id, source, status, verified_at)
        select ${seedIds.voterUser}, ${holding.propertyId}, ${holding.accountId}, 'mock', 'active', now()
        where not exists (
          select 1 from property_holdings
          where user_id = ${seedIds.voterUser} and property_id = ${holding.propertyId}
            and personal_account_id = ${holding.accountId}
        )
      `;
    }

    if (process.env.APP_ENV === "test") await seedTestSurveyFixtures(transaction);
    await transaction`truncate table audit_logs restart identity`;
  });
}
