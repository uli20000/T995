create or replace function public.normalize_staffing_numeric_values()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_table_name = 'staffing_tc_history' then
    if new.prior_year_tc < 0 then
      new.prior_year_tc := 0;
    end if;
    new.total_tc := greatest(coalesce(new.total_tc, 0), 0);
    if new.tc_ex_third_party < 0 then
      new.tc_ex_third_party := 0;
    end if;
  elsif tg_table_name = 'staffing_daily_actuals' then
    new.actual_work_hours := greatest(coalesce(new.actual_work_hours, 0), 0);
    new.actual_tplh := greatest(coalesce(new.actual_tplh, 0), 0);
    new.third_party_usage_pct := greatest(coalesce(new.third_party_usage_pct, 0), 0);
  end if;
  return new;
end;
$$;
