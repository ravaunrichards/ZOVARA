CREATE OR REPLACE FUNCTION zovara_reject_wallet_ledger_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('zovara.allow_wallet_ledger_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'wallet_ledger is append-only; insert a compensating entry instead of modifying historical records.'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER wallet_ledger_append_only
BEFORE UPDATE OR DELETE ON wallet_ledger
FOR EACH ROW EXECUTE FUNCTION zovara_reject_wallet_ledger_mutation();
