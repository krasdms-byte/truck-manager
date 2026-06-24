import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { app } from 'electron'

let db: Database.Database

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.')
  return db
}

export async function initDatabase(): Promise<void> {
  const userDataPath = app.getPath('userData')
  const dbDir = path.join(app.getPath('documents'), 'TruckManager')
  const dbPath = path.join(dbDir, 'trucks.db')

  // Создаём папку если нет
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true })
    fs.mkdirSync(path.join(dbDir, 'backups'), { recursive: true })
    fs.mkdirSync(path.join(dbDir, 'exports'),  { recursive: true })
  }

  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')  // Лучшая производительность
  db.pragma('foreign_keys = ON')   // Соблюдать FK constraints

  // Создаём схему
  db.exec(SCHEMA_SQL)
  // Миграции — безопасно добавляем колонки если их нет
  // Дефолтные данные справочников
  try { db.exec(`-- Дефолтные категории расходов
INSERT OR IGNORE INTO dict_categories (name, type, sort_order) VALUES
  ('ТО', 'expense', 1), ('ГСМ', 'expense', 2), ('Запчасть', 'expense', 3),
  ('Шины', 'expense', 4), ('Страховка', 'expense', 5), ('Штраф', 'expense', 6),
  ('Прочее', 'expense', 99);

-- Дефолтные единицы измерения
INSERT OR IGNORE INTO dict_units (name, sort_order) VALUES
  ('шт', 1), ('л', 2), ('кг', 3), ('м', 4), ('компл', 5), ('км', 6);`) } catch {}

  try { db.exec(`CREATE TABLE IF NOT EXISTS salary_overrides (id INTEGER PRIMARY KEY AUTOINCREMENT, employee_id INTEGER NOT NULL, month TEXT NOT NULL, amount REAL NOT NULL, comment TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(employee_id, month))`) } catch {}

  try { db.exec('ALTER TABLE parts ADD COLUMN supplier TEXT') } catch {}
  try { db.exec('ALTER TABLE parts ADD COLUMN last_received_date TEXT') } catch {}

  try { db.exec('ALTER TABLE trips ADD COLUMN project_id INTEGER REFERENCES projects(id)') } catch {}
  try { db.exec("ALTER TABLE trucks ADD COLUMN vehicle_type TEXT NOT NULL DEFAULT 'Самосвал'") } catch {}
  try { db.exec('ALTER TABLE expenses ADD COLUMN organization_id INTEGER REFERENCES organizations(id)') } catch {}
  try { db.exec("ALTER TABLE expenses ADD COLUMN pay_status TEXT NOT NULL DEFAULT 'paid' CHECK(pay_status IN('paid','debt'))") } catch {}
  try { db.exec("ALTER TABLE expenses ADD COLUMN debt_closed_at TEXT") } catch {}
  try { db.exec("ALTER TABLE expenses ADD COLUMN debt_closed_income_id INTEGER REFERENCES income(id)") } catch {}
  try { db.exec('ALTER TABLE income ADD COLUMN project_id INTEGER REFERENCES projects(id)') } catch {}

  // Таблицы модуля Проживание/Питание
  try { db.exec(`CREATE TABLE IF NOT EXISTS project_accommodation (
    project_id           INTEGER PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    accommodation_cost   REAL    NOT NULL DEFAULT 0,
    meal_cost            REAL    NOT NULL DEFAULT 0,
    accommodation_org_id INTEGER REFERENCES organizations(id),
    meal_org_id          INTEGER REFERENCES organizations(id),
    end_date             TEXT
  )`) } catch {}

  try { db.exec(`CREATE TABLE IF NOT EXISTS project_worker_dates (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    start_date  TEXT    NOT NULL,
    end_date    TEXT,
    UNIQUE(project_id, employee_id)
  )`) } catch {}

  try { db.exec(`CREATE TABLE IF NOT EXISTS accommodation_debts (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id     INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    period_month   TEXT    NOT NULL,
    type           TEXT    NOT NULL CHECK(type IN('accommodation','meal')),
    amount         REAL    NOT NULL DEFAULT 0,
    actual_amount  REAL,
    days_count     INTEGER NOT NULL DEFAULT 0,
    workers_count  INTEGER NOT NULL DEFAULT 0,
    closed_at      TEXT,
    closed_amount  REAL,
    income_id      INTEGER REFERENCES income(id),
    UNIQUE(project_id, period_month, type)
  )`) } catch {}

  try { db.exec("ALTER TABLE accommodation_debts ADD COLUMN actual_amount REAL") } catch {}
  try { db.exec("ALTER TABLE projects ADD COLUMN client_org_id INTEGER REFERENCES organizations(id)") } catch {}
  try { db.exec(`CREATE TABLE IF NOT EXISTS project_rate_grid (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    km_from    REAL    NOT NULL,
    km_to      REAL    NOT NULL,
    rate       REAL    NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  )`) } catch {}
  console.log(`📂 DB path: ${dbPath}`)
}

// ─── СХЕМА БАЗЫ ДАННЫХ ────────────────────────────────────────────────────────
const SCHEMA_SQL = `
-- ═══════════════════════════════════════════════════════
-- ТАБЛИЦА: users (пользователи системы)
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS users (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  username     TEXT    NOT NULL UNIQUE,
  password_hash TEXT   NOT NULL,
  display_name TEXT    NOT NULL,
  role         TEXT    NOT NULL DEFAULT 'admin' CHECK (role IN ('admin','operator')),
  active       INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Создаём admin по умолчанию (пароль: admin123 — менять при первом входе!)
INSERT OR IGNORE INTO users (username, password_hash, display_name, role)
VALUES ('admin', '$2a$10$defaulthashwillbereplacedonFirstRun', 'Администратор', 'admin');

-- ═══════════════════════════════════════════════════════
-- ТАБЛИЦА: trucks (самосвалы)
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS trucks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  plate      TEXT    NOT NULL UNIQUE,
  model      TEXT,
  year       INTEGER,
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ═══════════════════════════════════════════════════════
-- ТАБЛИЦА: employees (сотрудники)
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS employees (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name     TEXT    NOT NULL,
  role          TEXT    NOT NULL CHECK (role IN ('driver','mechanic')),
  truck_id      INTEGER REFERENCES trucks(id),     -- основной самосвал
  salary_type   TEXT    NOT NULL DEFAULT 'formula' CHECK (salary_type IN ('formula','fixed')),
  salary_gross  REAL    NOT NULL DEFAULT 180000,   -- для formula: оклад до налогов
  salary_fixed  REAL,                              -- для fixed: фикс. сумма механика
  tax_rate      REAL    NOT NULL DEFAULT 0.06,     -- 6% налог
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ═══════════════════════════════════════════════════════
-- ТАБЛИЦА: income (поступления / оплаты от клиентов)
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS income (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  date           TEXT    NOT NULL,
  from_who       TEXT    NOT NULL,
  account_number TEXT,
  period_from    TEXT,
  period_to      TEXT,
  amount         REAL    NOT NULL CHECK (amount > 0),
  comment        TEXT,
  deleted_at     TEXT,                             -- soft delete
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ═══════════════════════════════════════════════════════
-- ТАБЛИЦА: trips (рейсы самосвалов)
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS trips (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  date             TEXT    NOT NULL,
  truck_id         INTEGER NOT NULL REFERENCES trucks(id),
  driver_id        INTEGER NOT NULL REFERENCES employees(id),
  shift_type       TEXT    NOT NULL CHECK (shift_type IN ('day','night')),
  pricing_mode     TEXT    NOT NULL CHECK (pricing_mode IN ('per_trip','per_ton_km')),
  trips_count      INTEGER NOT NULL DEFAULT 1,
  price_per_trip   REAL,                           -- если per_trip
  tons             REAL,                           -- если per_ton_km
  distance_km      REAL,                           -- если per_ton_km
  price_per_ton_km REAL,                           -- если per_ton_km
  amount           REAL    NOT NULL,               -- авто-расчёт, хранить для отчётов
  comment          TEXT,
  deleted_at       TEXT,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ═══════════════════════════════════════════════════════
-- ТАБЛИЦА: shifts (журнал смен водителей)
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS shifts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  date        TEXT    NOT NULL,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  truck_id    INTEGER REFERENCES trucks(id),       -- фактический самосвал в этот день
  shift_type  TEXT    CHECK (shift_type IN ('day','night')),
  worked      INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (date, employee_id)                       -- один сотрудник — одна запись в день
);

-- ═══════════════════════════════════════════════════════
-- ТАБЛИЦА: payments (выплаты зарплаты)
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS payments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  date        TEXT    NOT NULL,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  amount      REAL    NOT NULL CHECK (amount > 0),
  month       TEXT    NOT NULL,                    -- YYYY-MM
  comment     TEXT,
  deleted_at  TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ═══════════════════════════════════════════════════════
-- ТАБЛИЦА: parts (склад запчастей)
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS parts (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT    NOT NULL,
  unit           TEXT    NOT NULL DEFAULT 'шт',
  qty_in_stock   REAL    NOT NULL DEFAULT 0,
  price_per_unit REAL    NOT NULL DEFAULT 0,
  category       TEXT    NOT NULL DEFAULT 'запчасть',
  deleted_at     TEXT,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ═══════════════════════════════════════════════════════
-- ТАБЛИЦА: expenses (расходы на технику)
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS expenses (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  date           TEXT    NOT NULL,
  truck_id       INTEGER NOT NULL REFERENCES trucks(id),
  category       TEXT    NOT NULL,
  part_id        INTEGER REFERENCES parts(id),     -- если со склада
  name           TEXT    NOT NULL,
  unit           TEXT,
  qty            REAL    NOT NULL DEFAULT 1,
  price_per_unit REAL    NOT NULL,
  amount         REAL    NOT NULL,                 -- qty × price_per_unit
  comment        TEXT,
  deleted_at     TEXT,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ═══════════════════════════════════════════════════════
-- ТАБЛИЦА: audit_log (история всех изменений)
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name  TEXT    NOT NULL,
  record_id   INTEGER NOT NULL,
  action      TEXT    NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
  old_data    TEXT,                                -- JSON
  new_data    TEXT,                                -- JSON
  changed_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  user_name   TEXT    NOT NULL DEFAULT 'admin'
);


-- ═══════════════════════════════════════════════════════
-- ТАБЛИЦА: projects (проекты / клиенты)
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS projects (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  name                 TEXT    NOT NULL,
  client_name          TEXT,
  description          TEXT,
  status               TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','done')),
  default_pricing_mode TEXT    DEFAULT 'per_trip' CHECK (default_pricing_mode IN ('per_trip','per_ton_km')),
  default_price_per_trip    REAL,
  default_price_per_ton_km  REAL,
  deleted_at           TEXT,
  created_at           TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_trips_project ON trips(project_id);



-- ═══════════════════════════════════════════════════════
-- ТАБЛИЦА: salary_overrides (ручная корректировка ЗП за месяц)
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS salary_overrides (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  month       TEXT    NOT NULL,
  amount      REAL    NOT NULL,
  comment     TEXT    NOT NULL,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(employee_id, month)
);


-- ═══════════════════════════════════════════════════════
-- ТАБЛИЦА: parts_receipts (история поступлений на склад)
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS parts_receipts (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  part_id        INTEGER NOT NULL REFERENCES parts(id),
  date           TEXT    NOT NULL,
  qty            REAL    NOT NULL,
  price_per_unit REAL    NOT NULL,
  supplier       TEXT,
  comment        TEXT,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_parts_receipts_part ON parts_receipts(part_id);

-- ═══════════════════════════════════════════════════════
-- СПРАВОЧНИКИ
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS dict_categories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE,
  type       TEXT NOT NULL DEFAULT 'expense',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dict_units (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dict_items (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT    NOT NULL,
  category       TEXT,
  unit           TEXT,
  price_per_unit REAL,
  deleted_at     TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);


-- ═══════════════════════════════════════════════════════
-- ТАБЛИЦА: organizations (справочник организаций)
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS organizations (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  inn        TEXT,
  type       TEXT    NOT NULL DEFAULT 'both' CHECK (type IN ('supplier','client','both')),
  comment    TEXT,
  deleted_at TEXT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_organizations_inn ON organizations(inn);

-- ═══════════════════════════════════════════════════════
-- ИНДЕКСЫ для быстрых запросов
-- ═══════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_trips_date       ON trips(date);
CREATE INDEX IF NOT EXISTS idx_trips_truck      ON trips(truck_id);
CREATE INDEX IF NOT EXISTS idx_trips_driver     ON trips(driver_id);
CREATE INDEX IF NOT EXISTS idx_income_date      ON income(date);
CREATE INDEX IF NOT EXISTS idx_expenses_date    ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_expenses_truck   ON expenses(truck_id);
CREATE INDEX IF NOT EXISTS idx_shifts_date      ON shifts(date);
CREATE INDEX IF NOT EXISTS idx_shifts_employee  ON shifts(employee_id);
CREATE INDEX IF NOT EXISTS idx_payments_employee ON payments(employee_id);
CREATE INDEX IF NOT EXISTS idx_payments_month   ON payments(month);
CREATE INDEX IF NOT EXISTS idx_audit_table      ON audit_log(table_name, record_id);

-- ═══════════════════════════════════════════════════════
-- ТРИГГЕРЫ: audit_log — автоматически пишем историю
-- ═══════════════════════════════════════════════════════

-- INCOME: UPDATE
CREATE TRIGGER IF NOT EXISTS trg_income_update
AFTER UPDATE ON income BEGIN
  INSERT INTO audit_log (table_name, record_id, action, old_data, new_data)
  VALUES ('income', OLD.id, 'UPDATE',
    json_object('date',OLD.date,'from_who',OLD.from_who,'amount',OLD.amount,'comment',OLD.comment),
    json_object('date',NEW.date,'from_who',NEW.from_who,'amount',NEW.amount,'comment',NEW.comment)
  );
END;

-- INCOME: DELETE (soft delete через updated_at + deleted_at)
CREATE TRIGGER IF NOT EXISTS trg_income_delete
AFTER UPDATE OF deleted_at ON income WHEN NEW.deleted_at IS NOT NULL BEGIN
  INSERT INTO audit_log (table_name, record_id, action, old_data)
  VALUES ('income', OLD.id, 'DELETE',
    json_object('date',OLD.date,'from_who',OLD.from_who,'amount',OLD.amount)
  );
END;

-- TRIPS: UPDATE
CREATE TRIGGER IF NOT EXISTS trg_trips_update
AFTER UPDATE ON trips BEGIN
  INSERT INTO audit_log (table_name, record_id, action, old_data, new_data)
  VALUES ('trips', OLD.id, 'UPDATE',
    json_object('date',OLD.date,'truck_id',OLD.truck_id,'driver_id',OLD.driver_id,
                'amount',OLD.amount,'pricing_mode',OLD.pricing_mode),
    json_object('date',NEW.date,'truck_id',NEW.truck_id,'driver_id',NEW.driver_id,
                'amount',NEW.amount,'pricing_mode',NEW.pricing_mode)
  );
END;

-- TRIPS: DELETE
CREATE TRIGGER IF NOT EXISTS trg_trips_delete
AFTER UPDATE OF deleted_at ON trips WHEN NEW.deleted_at IS NOT NULL BEGIN
  INSERT INTO audit_log (table_name, record_id, action, old_data)
  VALUES ('trips', OLD.id, 'DELETE',
    json_object('date',OLD.date,'truck_id',OLD.truck_id,'driver_id',OLD.driver_id,'amount',OLD.amount)
  );
END;

-- EXPENSES: UPDATE
CREATE TRIGGER IF NOT EXISTS trg_expenses_update
AFTER UPDATE ON expenses BEGIN
  INSERT INTO audit_log (table_name, record_id, action, old_data, new_data)
  VALUES ('expenses', OLD.id, 'UPDATE',
    json_object('date',OLD.date,'truck_id',OLD.truck_id,'name',OLD.name,'amount',OLD.amount),
    json_object('date',NEW.date,'truck_id',NEW.truck_id,'name',NEW.name,'amount',NEW.amount)
  );
END;

-- EXPENSES: DELETE
CREATE TRIGGER IF NOT EXISTS trg_expenses_delete
AFTER UPDATE OF deleted_at ON expenses WHEN NEW.deleted_at IS NOT NULL BEGIN
  INSERT INTO audit_log (table_name, record_id, action, old_data)
  VALUES ('expenses', OLD.id, 'DELETE',
    json_object('date',OLD.date,'truck_id',OLD.truck_id,'name',OLD.name,'amount',OLD.amount)
  );
END;

-- PAYMENTS: UPDATE
CREATE TRIGGER IF NOT EXISTS trg_payments_update
AFTER UPDATE ON payments BEGIN
  INSERT INTO audit_log (table_name, record_id, action, old_data, new_data)
  VALUES ('payments', OLD.id, 'UPDATE',
    json_object('date',OLD.date,'employee_id',OLD.employee_id,'amount',OLD.amount,'month',OLD.month),
    json_object('date',NEW.date,'employee_id',NEW.employee_id,'amount',NEW.amount,'month',NEW.month)
  );
END;

-- PARTS: UPDATE (изменение остатка склада)
CREATE TRIGGER IF NOT EXISTS trg_parts_update
AFTER UPDATE ON parts BEGIN
  INSERT INTO audit_log (table_name, record_id, action, old_data, new_data)
  VALUES ('parts', OLD.id, 'UPDATE',
    json_object('name',OLD.name,'qty_in_stock',OLD.qty_in_stock,'price_per_unit',OLD.price_per_unit),
    json_object('name',NEW.name,'qty_in_stock',NEW.qty_in_stock,'price_per_unit',NEW.price_per_unit)
  );
END;
`
