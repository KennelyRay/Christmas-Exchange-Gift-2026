-- Locked wishlists and the public audit log are enforced by the database itself,
-- so no application bug or manual query can quietly rewrite them.
CREATE FUNCTION forbid_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% on % is not allowed: this record is permanently locked', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER wishlist_items_locked
  BEFORE UPDATE OR DELETE ON wishlist_items
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
--> statement-breakpoint
CREATE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
--> statement-breakpoint
-- A participant's code can be reissued, but who they are can never change.
CREATE FUNCTION protect_participant_identity() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE'
     OR NEW.display_name IS DISTINCT FROM OLD.display_name
     OR NEW.name_key IS DISTINCT FROM OLD.name_key
     OR NEW.exchange_id IS DISTINCT FROM OLD.exchange_id THEN
    RAISE EXCEPTION 'Changing who a participant is, or removing them, is not allowed'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER participants_identity_locked
  BEFORE UPDATE OR DELETE ON participants
  FOR EACH ROW EXECUTE FUNCTION protect_participant_identity();
