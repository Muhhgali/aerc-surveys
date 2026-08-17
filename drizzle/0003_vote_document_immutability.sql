CREATE OR REPLACE FUNCTION enforce_vote_state_transition() RETURNS trigger AS $$
BEGIN
  IF OLD.status IN ('submitted', 'voided') THEN RAISE EXCEPTION 'vote in terminal state cannot be updated' USING ERRCODE = '23514'; END IF;
  IF OLD.status <> NEW.status AND NOT ((OLD.status = 'draft' AND NEW.status IN ('ready_to_sign','voided')) OR (OLD.status = 'ready_to_sign' AND NEW.status IN ('signing','voided')) OR (OLD.status = 'signing' AND NEW.status IN ('ready_to_sign','signed','voided')) OR (OLD.status = 'signed' AND NEW.status IN ('submitted','voided'))) THEN RAISE EXCEPTION 'invalid vote state transition: % -> %', OLD.status, NEW.status USING ERRCODE = '23514'; END IF;
  IF OLD.status <> 'draft' AND (OLD.survey_id IS DISTINCT FROM NEW.survey_id OR OLD.participant_id IS DISTINCT FROM NEW.participant_id OR OLD.user_id IS DISTINCT FROM NEW.user_id OR OLD.property_id IS DISTINCT FROM NEW.property_id OR OLD.canonical_payload IS DISTINCT FROM NEW.canonical_payload OR OLD.canonical_sha256 IS DISTINCT FROM NEW.canonical_sha256) THEN RAISE EXCEPTION 'canonical vote fields are immutable' USING ERRCODE = '23514'; END IF;
  NEW.state_version := OLD.state_version + 1; NEW.updated_at := now(); RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER votes_state_transition_guard BEFORE UPDATE ON votes FOR EACH ROW EXECUTE FUNCTION enforce_vote_state_transition();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_vote_answers_mutable() RETURNS trigger AS $$
DECLARE current_status vote_status;
BEGIN
  SELECT status INTO current_status FROM votes WHERE id = COALESCE(NEW.vote_id, OLD.vote_id) FOR UPDATE;
  IF current_status <> 'draft' THEN RAISE EXCEPTION 'answers and visual signature are immutable after canonical lock' USING ERRCODE = '23514'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER vote_answers_immutability_guard BEFORE INSERT OR UPDATE OR DELETE ON vote_answers FOR EACH ROW EXECUTE FUNCTION enforce_vote_answers_mutable();
--> statement-breakpoint
CREATE TRIGGER visual_signatures_immutability_guard BEFORE INSERT OR UPDATE OR DELETE ON visual_signatures FOR EACH ROW EXECUTE FUNCTION enforce_vote_answers_mutable();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION reject_immutable_record_change() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'immutable record cannot be changed or deleted' USING ERRCODE = '23514'; END; $$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER document_versions_immutable_guard BEFORE UPDATE OR DELETE ON document_versions FOR EACH ROW EXECUTE FUNCTION reject_immutable_record_change();
--> statement-breakpoint
CREATE TRIGGER binary_assets_immutable_guard BEFORE UPDATE OR DELETE ON binary_assets FOR EACH ROW EXECUTE FUNCTION reject_immutable_record_change();
