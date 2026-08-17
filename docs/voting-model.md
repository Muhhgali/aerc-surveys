# Voting model Stage 2.5 + integrated Stage 3

Stage 2.5 start/resume/autosave guarantees remain unchanged. Final submit is now extended by the canonical/signing/document flow described in `docs/vote-document-lifecycle.md`; the older direct-submit description below is retained only as Stage 2.5 history.

## Start or resume

`POST /api/surveys/:surveyId/votes` принимает только `accountReference` и idempotency key. User берётся из server session, property и eligibility разрешаются через `PropertyProvider` и persistence. Передача `propertyId`, `userId`, `participantId`, answers или completed flag отклоняется strict schema.

Repository блокирует participant row, поэтому два конкурентных запроса не создают два active workflows:

1. submitted vote → вернуть completed state;
2. незавершённый vote → связать с текущей auth session и вернуть его (`VOTE_RESUMED`);
3. иначе → создать `vote_session` и draft vote (`VOTE_STARTED`).

## Autosave и restore

`PUT /api/votes/:voteId/answers` принимает question ID, domain choice (`for`, `against`, `abstain`) и idempotency key. Сервер проверяет ownership, draft state, active survey и принадлежность active question этому survey. Answer upsert и запись idempotency payload hash выполняются транзакционно.

Повтор того же key и payload возвращает прежний результат. Тот же key с другим payload возвращает 409. UI показывает `Сохранение…`, `Сохранено` или `Ошибка сохранения`; при ошибке локальный optimistic value откатывается.

`GET /api/surveys/:surveyId/votes` восстанавливает draft и ответы из PostgreSQL. Поэтому refresh, закрытие браузера и новая authentication не создают новый vote при сохранённой eligibility.

## Final submit

`POST /api/votes/:voteId/submit` принимает только idempotency key. В одной transaction сервер:

1. блокирует vote;
2. проверяет ownership по current user;
3. проверяет active survey и time window;
4. проверяет eligible participant и согласованные survey/property references;
5. сравнивает все шесть required questions Protocol №12 с шестью valid answers;
6. переводит vote и vote session в submitted state;
7. пишет audit.

Повторный submit возвращает уже сохранённый результат. Frontend не может объявить vote complete. После submitted autosave запрещён.

Canvas остаётся только визуальным UX placeholder: asset не загружается и не создаёт signing state. Signing, canonical snapshot, immutable PDF и verification относятся к Stage 3.
