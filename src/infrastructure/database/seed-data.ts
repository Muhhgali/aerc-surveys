import type { DatabaseClient } from "@/src/infrastructure/database/client";

export const seedIds = {
  voterUser: "00000000-0000-4000-8000-000000000001",
  representativeUser: "00000000-0000-4000-8000-000000000002",
  organization: "00000000-0000-4000-8000-000000000101",
  property: "00000000-0000-4000-8000-000000000201",
  personalAccount: "00000000-0000-4000-8000-000000000301",
  survey12: "00000000-0000-4000-8000-000000000012",
  participant: "00000000-0000-4000-8000-000000000401",
  authSession: "00000000-0000-4000-8000-000000000501",
  questions: [1, 2, 3, 4, 5, 6].map((number) => `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`),
} as const;

const questions = [
  "Утвердить план текущего ремонта подъездов многоквартирного жилого дома на 2026 год.",
  "Утвердить установку дополнительных камер видеонаблюдения в подъездах и на придомовой территории.",
  "Утвердить замену осветительных приборов в местах общего пользования на энергоэффективные LED-светильники.",
  "Утвердить проведение работ по благоустройству придомовой территории.",
  "Утвердить проведение профилактического обслуживания инженерных сетей многоквартирного жилого дома.",
  "Утвердить предложенный порядок информирования собственников о выполненных работах и расходовании средств.",
];

export async function seedDevelopmentData(sql: DatabaseClient): Promise<void> {
  await sql.begin(async (transaction) => {
    await transaction`
      insert into users (id, display_name, type, status)
      values (${seedIds.voterUser}, 'Демо собственник', 'individual', 'active'),
             (${seedIds.representativeUser}, 'Демо представитель ОСИ-КСК', 'organization_representative', 'active')
      on conflict (id) do update set display_name = excluded.display_name, updated_at = now()
    `;
    await transaction`
      insert into external_identities (user_id, provider, provider_subject, verified_at, metadata)
      values (${seedIds.voterUser}, 'mock', 'mock-subject-1911', now(), ${transaction.json({ developmentSeed: true })}),
             (${seedIds.representativeUser}, 'admin', 'development-admin', now(), ${transaction.json({ developmentSeed: true })})
      on conflict (provider, provider_subject) do update set user_id = excluded.user_id, verified_at = excluded.verified_at
    `;
    await transaction`
      insert into organizations (id, bin, legal_name, display_name, type, status)
      values (${seedIds.organization}, '000000000000', 'ТОО «ОСИ-КСК»', 'ОСИ-КСК', 'osi', 'active')
      on conflict (id) do update set legal_name = excluded.legal_name, display_name = excluded.display_name, updated_at = now()
    `;
    await transaction`
      insert into organization_members (user_id, organization_id, role, verified_source, verified_at)
      values (${seedIds.representativeUser}, ${seedIds.organization}, 'administrator', 'development_seed', now())
      on conflict (user_id, organization_id) do update set role = excluded.role, verified_at = excluded.verified_at
    `;
    await transaction`
      insert into properties (id, city, street, building, premise, property_type, external_property_id, source, status)
      values (${seedIds.property}, 'Астана', 'Геодезическая', '12', '52', 'apartment', 'mock-property-geodezicheskaya-12-52', 'mock', 'active')
      on conflict (id) do update set status = 'active', updated_at = now()
    `;
    await transaction`
      insert into personal_accounts (id, external_account_id, account_number, property_id, source, status, last_verified_at)
      values (${seedIds.personalAccount}, 'mock-account-1911', '1911', ${seedIds.property}, 'mock', 'active', now())
      on conflict (id) do update set status = 'active', last_verified_at = now(), updated_at = now()
    `;
    await transaction`
      insert into surveys (id, organization_id, protocol_number, title_ru, status, starts_at, closes_at, published_at)
      values (${seedIds.survey12}, ${seedIds.organization}, '12', 'Собрание собственников дома', 'active',
              '2026-08-01T00:00:00+05:00', '2026-08-25T23:59:59+05:00', '2026-08-01T00:00:00+05:00')
      on conflict (id) do update set title_ru = excluded.title_ru, status = excluded.status, updated_at = now()
    `;
    for (let index = 0; index < questions.length; index += 1) {
      await transaction`
        insert into survey_questions (id, survey_id, position, text_ru, required, status)
        values (${seedIds.questions[index]}, ${seedIds.survey12}, ${index + 1}, ${questions[index]}, true, 'active')
        on conflict (id) do update set position = excluded.position, text_ru = excluded.text_ru, updated_at = now()
      `;
    }
    await transaction`
      insert into survey_targets (survey_id, target_type, city, street, building)
      select ${seedIds.survey12}, 'building', 'Астана', 'Геодезическая', '12'
      where not exists (
        select 1 from survey_targets where survey_id = ${seedIds.survey12} and target_type = 'building'
          and city = 'Астана' and street = 'Геодезическая' and building = '12'
      )
    `;
    await transaction`
      insert into survey_participants (id, survey_id, user_id, property_id, personal_account_id, status, verified_source, verified_at, eligibility_metadata)
      values (${seedIds.participant}, ${seedIds.survey12}, ${seedIds.voterUser}, ${seedIds.property}, ${seedIds.personalAccount},
              'eligible', 'mock', now(), ${transaction.json({ verified: true, developmentSeed: true })})
      on conflict (id) do update set status = 'eligible', verified_at = now(), updated_at = now()
    `;
    await transaction`
      insert into auth_sessions (id, user_id, assurance_level, expires_at)
      values (${seedIds.authSession}, ${seedIds.voterUser}, 'demo', '2099-01-01T00:00:00Z')
      on conflict (id) do update set user_id = excluded.user_id, expires_at = excluded.expires_at, revoked_at = null
    `;
  });
}
