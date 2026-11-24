-- Minimal stand-in for the production schema pieces that prepare_account_deletion touches.
-- Used only by work/account-deletion/check.ps1 in a throwaway PostgreSQL container.
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE TYPE public.order_status AS ENUM ('new','accepted','preparing','ready','completed','cancelled');
CREATE TABLE public.staff (user_id uuid PRIMARY KEY REFERENCES auth.users(id));
CREATE TABLE public.reward_progress (customer_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE);
CREATE TABLE public.bonus_accounts (customer_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, balance integer NOT NULL DEFAULT 0);
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES auth.users(id),
  status public.order_status NOT NULL,
  customer_name text, customer_phone text, comment text, request_fingerprint jsonb,
  total numeric(10,2) NOT NULL DEFAULT 100
);
-- Same rule as the real bonus/reward triggers: customer_id is immutable.
CREATE FUNCTION public.forbid_customer_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.customer_id IS DISTINCT FROM OLD.customer_id THEN RAISE EXCEPTION 'BONUS_FIELDS_IMMUTABLE'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER orders_immutable BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.forbid_customer_change();
