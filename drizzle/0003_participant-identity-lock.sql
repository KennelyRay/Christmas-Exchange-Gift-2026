-- The last name now decides who can draw whom, so it is locked along with the rest of a person's identity.
CREATE OR REPLACE FUNCTION protect_participant_identity() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE'
     OR NEW.first_name IS DISTINCT FROM OLD.first_name
     OR NEW.last_name IS DISTINCT FROM OLD.last_name
     OR NEW.last_name_key IS DISTINCT FROM OLD.last_name_key
     OR NEW.name_key IS DISTINCT FROM OLD.name_key
     OR NEW.exchange_id IS DISTINCT FROM OLD.exchange_id THEN
    RAISE EXCEPTION 'Changing who a participant is, or removing them, is not allowed'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$;
