-- =====================================================================
-- PetCare database: 01_schema.sql   (MySQL 8.0.16 or later)
-- Creates the database and the 6 tables, with all constraints and indexes.
-- WARNING: Section 1 deletes any existing PetCare tables, so running this
-- file again RESETS the database to empty.
-- =====================================================================

-- ---------------------------------------------------------------------
-- SECTION 0: Database and time zone
-- ---------------------------------------------------------------------
CREATE DATABASE IF NOT EXISTS petcare
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

USE petcare;

-- Use Philippine time (UTC+8) for CURDATE(), NOW() and the created_at defaults.
-- This setting lasts only for the current connection; the Express server must set it too.
SET time_zone = '+08:00';

-- ---------------------------------------------------------------------
-- SECTION 1: Remove old tables (children first, parents last)
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_appointments_owner_insert;
DROP TRIGGER IF EXISTS trg_appointments_owner_update;
DROP TABLE IF EXISTS transactions;
DROP TABLE IF EXISTS appointments;
DROP TABLE IF EXISTS pets;
DROP TABLE IF EXISTS services;
DROP TABLE IF EXISTS customers;
DROP TABLE IF EXISTS users;

-- ---------------------------------------------------------------------
-- SECTION 2: Tables with no parents: users and services
-- ---------------------------------------------------------------------

-- Login accounts for admin, staff and customers.
CREATE TABLE users (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  email          VARCHAR(255) NOT NULL,
  password_hash  VARCHAR(255) NOT NULL,                 -- a bcrypt hash, never the real password
  role           ENUM('admin', 'staff', 'customer') NOT NULL,
  full_name      VARCHAR(100) NULL,                     -- for admin/staff; customers use their customer record
  is_active      TINYINT(1) NOT NULL DEFAULT 1,         -- 0 = account switched off (we deactivate, not delete)
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  CONSTRAINT chk_users_is_active CHECK (is_active IN (0, 1))
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

-- The grooming service catalog.
CREATE TABLE services (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name             VARCHAR(50) NOT NULL,
  description      VARCHAR(200) NOT NULL DEFAULT '',
  price            DECIMAL(10, 2) NOT NULL,
  duration_minutes SMALLINT UNSIGNED NOT NULL,
  is_active        TINYINT(1) NOT NULL DEFAULT 1,       -- 1 = can be booked, 0 = inactive
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_services_name (name),                   -- same rule as the frontend (not case-sensitive)
  CONSTRAINT chk_services_price    CHECK (price >= 0 AND price <= 100000),
  CONSTRAINT chk_services_duration CHECK (duration_minutes BETWEEN 1 AND 600),
  CONSTRAINT chk_services_is_active CHECK (is_active IN (0, 1))
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------------
-- SECTION 3: customers and pets
-- ---------------------------------------------------------------------

-- Customer profiles. A walk-in customer has no login account (user_id is NULL).
CREATE TABLE customers (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id         INT UNSIGNED NULL,
  first_name      VARCHAR(50) NOT NULL,
  last_name       VARCHAR(50) NOT NULL,
  contact_number  VARCHAR(30) NOT NULL,                 -- stored exactly as typed
  email           VARCHAR(255) NULL,                    -- contact email, separate from users.email
  address         VARCHAR(200) NULL,
  date_registered DATE NOT NULL DEFAULT (CURRENT_DATE),
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_customers_user (user_id),               -- one account <-> at most one profile
  KEY idx_customers_name (last_name, first_name),
  CONSTRAINT fk_customers_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

-- Pets. Every pet belongs to exactly one customer.
CREATE TABLE pets (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  customer_id INT UNSIGNED NOT NULL,
  name        VARCHAR(50) NOT NULL,
  species     ENUM('Dog', 'Cat', 'Other') NOT NULL,
  breed       VARCHAR(50) NOT NULL,
  birth_date  DATE NULL,
  sex         ENUM('Male', 'Female') NOT NULL,
  notes       VARCHAR(300) NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_pets_customer (customer_id),
  CONSTRAINT fk_pets_customer
    FOREIGN KEY (customer_id) REFERENCES customers (id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------------
-- SECTION 4: appointments and transactions
-- ---------------------------------------------------------------------

-- Appointments. price and duration_minutes are SNAPSHOTS copied from the service when booked.
-- customer_id is the pet's owner at booking time (finished appointments keep the old owner).
CREATE TABLE appointments (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  pet_id           INT UNSIGNED NOT NULL,
  customer_id      INT UNSIGNED NOT NULL,
  service_id       INT UNSIGNED NOT NULL,
  price            DECIMAL(10, 2) NOT NULL,
  duration_minutes SMALLINT UNSIGNED NOT NULL,
  appointment_date DATE NOT NULL,
  start_time       TIME NOT NULL,
  notes            VARCHAR(300) NULL,
  status           ENUM('Pending', 'Confirmed', 'In Progress', 'Completed', 'Cancelled')
                   NOT NULL DEFAULT 'Pending',
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_appointments_schedule (appointment_date, start_time),
  KEY idx_appointments_pet (pet_id),
  KEY idx_appointments_customer (customer_id),
  KEY idx_appointments_service (service_id),
  KEY idx_appointments_status (status),
  CONSTRAINT fk_appointments_pet
    FOREIGN KEY (pet_id) REFERENCES pets (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_appointments_customer
    FOREIGN KEY (customer_id) REFERENCES customers (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_appointments_service
    FOREIGN KEY (service_id) REFERENCES services (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT chk_appointments_price    CHECK (price >= 0),
  CONSTRAINT chk_appointments_duration CHECK (duration_minutes BETWEEN 1 AND 600)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

-- Payments. One appointment has at most one transaction (UNIQUE appointment_id).
-- service_name and amount are SNAPSHOTS: they never change if the service is renamed or re-priced.
CREATE TABLE transactions (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  appointment_id   INT UNSIGNED NOT NULL,
  service_name     VARCHAR(50) NOT NULL,
  amount           DECIMAL(10, 2) NOT NULL,
  payment_method   ENUM('Cash', 'GCash', 'Card') NULL,      -- NULL while Pending
  status           ENUM('Pending', 'Paid', 'Refunded') NOT NULL DEFAULT 'Pending',
  transaction_date DATE NOT NULL DEFAULT (CURRENT_DATE),    -- the day it was created
  paid_date        DATE NULL,                               -- NULL while Pending
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_transactions_appointment (appointment_id),
  KEY idx_transactions_status_paid (status, paid_date),
  CONSTRAINT fk_transactions_appointment
    FOREIGN KEY (appointment_id) REFERENCES appointments (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT chk_transactions_amount CHECK (amount >= 0),
  -- Pending: no method and no paid date. Paid or Refunded: both must be filled in.
  CONSTRAINT chk_transactions_payment CHECK (
    (status = 'Pending' AND payment_method IS NULL AND paid_date IS NULL)
    OR
    (status IN ('Paid', 'Refunded') AND payment_method IS NOT NULL AND paid_date IS NOT NULL)
  )
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------------
-- SECTION 5: Safety-net triggers for "appointment owner = pet owner"
-- A trigger is a small rule the database runs by itself before an INSERT or UPDATE.
-- (The Express/business code will also set customer_id from the pet. These stop mistakes
-- even if some other code forgets.)
-- ---------------------------------------------------------------------
DELIMITER $$

CREATE TRIGGER trg_appointments_owner_insert
BEFORE INSERT ON appointments
FOR EACH ROW
BEGIN
  DECLARE pet_owner INT UNSIGNED;
  SELECT customer_id INTO pet_owner FROM pets WHERE id = NEW.pet_id;
  IF pet_owner IS NULL OR pet_owner <> NEW.customer_id THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'appointments.customer_id must be the owner of the selected pet';
  END IF;
END$$

-- On UPDATE the check only runs when the pet or the owner is being changed, so finished
-- appointments can keep their old owner after the pet gets a new owner.
CREATE TRIGGER trg_appointments_owner_update
BEFORE UPDATE ON appointments
FOR EACH ROW
BEGIN
  DECLARE pet_owner INT UNSIGNED;
  IF NEW.pet_id <> OLD.pet_id OR NEW.customer_id <> OLD.customer_id THEN
    SELECT customer_id INTO pet_owner FROM pets WHERE id = NEW.pet_id;
    IF pet_owner IS NULL OR pet_owner <> NEW.customer_id THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'appointments.customer_id must be the owner of the selected pet';
    END IF;
  END IF;
END$$

DELIMITER ;