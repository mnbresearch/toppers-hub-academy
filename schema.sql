-- ============================================================================
-- TOPPERS HUB ACADEMY — Database Schema & Row Level Security (RLS)
-- Run this script in the Supabase SQL Editor (Step 2 of README.md).
-- Safe to re-run (idempotent: uses IF NOT EXISTS).
-- ============================================================================

-- 1. EXTENSIONS
create extension if not exists "pgcrypto";

-- 2. TEACHERS TABLE
create table if not exists public.teachers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null default 'Teacher',
  subject text,
  phone text,
  email text,
  notes text,
  user_id uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);

-- 3. STUDENTS TABLE
create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  monthly_fee numeric not null default 0 check (monthly_fee >= 0),
  grade text,
  plan_name text not null default 'Monthly',
  status text not null default 'Active' check (status in ('Active', 'Paused', 'Left')),
  join_date date not null default current_date,
  next_due_date date,
  teacher_id uuid references public.teachers(id) on delete set null,
  co_teacher_id uuid references public.teachers(id) on delete set null,
  co_teacher_fee numeric not null default 0 check (co_teacher_fee >= 0),
  phone text,
  guardian_name text,
  guardian_phone text,
  email text,
  notes text,
  user_id uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);

-- Ensure guardian_name column exists if migrating from older schema version
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='students' and column_name='guardian_name') then
    alter table public.students add column guardian_name text;
  end if;
end $$;

-- 4. PAYMENTS TABLE
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  amount numeric not null default 0 check (amount >= 0),
  paid_on date not null default current_date,
  method text not null default 'Cash',
  for_month text,
  note text,
  user_id uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);

-- 5. ATTENDANCE TABLE
create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  date date not null default current_date,
  status text not null check (status in ('Present', 'Late', 'Absent')),
  user_id uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  constraint unique_student_attendance_date unique (student_id, date)
);

-- 6. PERFORMANCE INDEXES
create index if not exists idx_students_due_date on public.students(next_due_date) where status = 'Active';
create index if not exists idx_students_teacher on public.students(teacher_id);
create index if not exists idx_students_co_teacher on public.students(co_teacher_id);
create index if not exists idx_payments_student on public.payments(student_id);
create index if not exists idx_payments_paid_on on public.payments(paid_on desc);
create index if not exists idx_payments_created_at on public.payments(created_at desc);
create index if not exists idx_attendance_student_date on public.attendance(student_id, date);

-- 7. ROW LEVEL SECURITY (RLS)
alter table public.teachers enable row level security;
alter table public.students enable row level security;
alter table public.payments enable row level security;
alter table public.attendance enable row level security;

-- Policies for teachers
drop policy if exists "Teachers ownership policy" on public.teachers;
create policy "Teachers ownership policy"
  on public.teachers for all
  using (auth.uid() = user_id or user_id is null)
  with check (auth.uid() = user_id or user_id is null);

-- Policies for students
drop policy if exists "Students ownership policy" on public.students;
create policy "Students ownership policy"
  on public.students for all
  using (auth.uid() = user_id or user_id is null)
  with check (auth.uid() = user_id or user_id is null);

-- Policies for payments
drop policy if exists "Payments ownership policy" on public.payments;
create policy "Payments ownership policy"
  on public.payments for all
  using (auth.uid() = user_id or user_id is null)
  with check (auth.uid() = user_id or user_id is null);

-- Policies for attendance
drop policy if exists "Attendance ownership policy" on public.attendance;
create policy "Attendance ownership policy"
  on public.attendance for all
  using (auth.uid() = user_id or user_id is null)
  with check (auth.uid() = user_id or user_id is null);
