/**
 * Survey targeting and owner catalogue queries.
 *
 * Eligibility is resolved from the local property read model (`property_holdings`,
 * `properties`, `personal_accounts`, `organization_members`) and never from participants
 * of previously published surveys. Statements are plain parameterised SQL so the same
 * query runs in production PostgreSQL and in migration tests.
 *
 * Limitation until the Астана-ЕРЦ billing contract exists: `property_holdings` is filled by
 * development/preview fixtures, so a `building` target only reaches owners whose holding is
 * already known locally. There is no separate building registry.
 */

/** $1 = survey id. Idempotent: repeated publishes cannot duplicate participants. */
export const materializeSurveyParticipantsSql = `
insert into survey_participants (
  survey_id, user_id, property_id, personal_account_id, organization_id,
  status, verified_source, verified_at, eligibility_metadata
)
select distinct on (holding.user_id, holding.property_id)
  $1::uuid, holding.user_id, holding.property_id, account.id, holding.organization_id,
  'eligible'::participant_status, 'local_property_read_model', now(),
  '{"materializedAtPublish": true}'::jsonb
from property_holdings holding
join users owner on owner.id = holding.user_id and owner.status = 'active'
join properties property on property.id = holding.property_id and property.status = 'active'
left join personal_accounts account
  on account.id = holding.personal_account_id and account.status = 'active'
where holding.status = 'active'
  and exists (
    select 1 from survey_targets target
    where target.survey_id = $1::uuid and (
      (target.target_type = 'personal_account' and target.personal_account_id = account.id)
      or (target.target_type = 'property' and target.property_id = holding.property_id)
      or (
        target.target_type = 'building'
        and target.city = property.city
        and target.street = property.street
        and target.building = property.building
      )
      or (
        target.target_type = 'organization' and exists (
          select 1 from organization_members membership
          join organizations organization
            on organization.id = membership.organization_id and organization.status = 'active'
          where membership.organization_id = target.organization_id
            and membership.user_id = holding.user_id
        )
      )
    )
  )
order by holding.user_id, holding.property_id, account.id nulls last, holding.created_at
on conflict (survey_id, user_id, property_id) do nothing
`;

/** $1 = user id. Only surveys the identity is eligible for, and only open lifecycle states. */
export const availableSurveysSql = `
select s.id, s.protocol_number as protocol, s.title_ru as title, s.description_ru as subtitle,
  s.starts_at as "startsAt", s.closes_at as "closesAt", s.status,
  json_agg(
    json_build_object('id', q.id, 'position', q.position, 'text', q.text_ru, 'textKk', q.text_kk)
    order by q.position
  ) as questions
from surveys s
join survey_participants sp
  on sp.survey_id = s.id and sp.user_id = $1::uuid and sp.status = 'eligible'
join survey_questions q on q.survey_id = s.id and q.status = 'active'
where s.status in ('active', 'scheduled')
group by s.id
order by s.starts_at, s.created_at
`;
