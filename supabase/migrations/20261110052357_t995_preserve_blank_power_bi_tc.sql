alter table public.staffing_tc_history
  alter column prior_year_tc drop not null,
  alter column prior_year_tc drop default,
  alter column tc_ex_third_party drop not null,
  alter column tc_ex_third_party drop default;

create function public.t995_keep_existing_optional_tc()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.prior_year_tc := coalesce(new.prior_year_tc, old.prior_year_tc);
  new.tc_ex_third_party := coalesce(new.tc_ex_third_party, old.tc_ex_third_party);
  new.prior_year_date := coalesce(new.prior_year_date, old.prior_year_date);
  return new;
end;
$$;

revoke all on function public.t995_keep_existing_optional_tc() from public, anon, authenticated;

create trigger t995_keep_existing_optional_tc
before update on public.staffing_tc_history
for each row execute function public.t995_keep_existing_optional_tc();
