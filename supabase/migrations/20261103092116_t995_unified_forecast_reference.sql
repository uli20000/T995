-- T995 only: retain the existing admin RPC, authentication and grants.
-- Add the Power BI self-delivery TC needed by the unified forecast/report model.
-- No source data, RLS policies or role grants are changed.
CREATE OR REPLACE FUNCTION t995_private.t995_get_operations_reference(p_month date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare first_day date; next_month date; prior_first date; prior_next date;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required'; end if;
  if p_month is null then raise exception 'Report month required'; end if;
  first_day:=date_trunc('month',p_month)::date;
  next_month:=(first_day+interval '1 month')::date;
  prior_first:=(first_day-interval '1 year')::date;
  prior_next:=(prior_first+interval '1 month')::date;
  return jsonb_build_object(
    'mapping',coalesce((select jsonb_agg(to_jsonb(a) order by a.area_code,a.restaurant_name) from
      (select restaurant_name,area_code from public.tc_restaurant_area_map where is_active) a),'[]'::jsonb),
    'history',coalesce((select jsonb_agg(to_jsonb(h) order by h.record_date,h.restaurant_name) from
      (select record_date,restaurant_name,area_code,prior_year_tc,total_tc,tc_ex_third_party,period_code
       from public.staffing_tc_history where period_code='full_day' and
       ((record_date>=first_day and record_date<next_month) or (record_date>=prior_first and record_date<prior_next))) h),'[]'::jsonb)
  );
end $function$;
