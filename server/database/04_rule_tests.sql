-- =====================================================================
-- PetCare database: 04_rule_tests.sql
-- Each statement below SHOULD FAIL with an error. That proves the database protects your rules.
-- Run ONE statement at a time (put the cursor on it and press Ctrl+Enter).
-- Run "START TRANSACTION;" first and "ROLLBACK;" last, so nothing is saved even if one unexpectedly works.
-- =====================================================================
USE petcare;
START TRANSACTION;

-- A. Delete a customer who owns pets.                         EXPECT error 1451 (foreign key)
DELETE FROM customers WHERE id = 1;

-- B. Delete a pet that has appointments.                      EXPECT error 1451
DELETE FROM pets WHERE id = 1;

-- C. Delete a service that has appointments.                  EXPECT error 1451
DELETE FROM services WHERE id = 1;

-- D. Delete an appointment that has a transaction.            EXPECT error 1451
DELETE FROM appointments WHERE id = 1;

-- E. Duplicate service name (upper/lower case does not matter). EXPECT error 1062
INSERT INTO services (name, price, duration_minutes) VALUES ('full groom', 100, 30);

-- F. A second transaction for the same appointment.           EXPECT error 1062
INSERT INTO transactions (appointment_id, service_name, amount, status)
VALUES (1, 'Full Groom', 650, 'Pending');

-- G. Paid transaction without a payment method / paid date.   EXPECT error 3819 (check constraint)
INSERT INTO transactions (appointment_id, service_name, amount, status)
VALUES (3, 'Full Groom', 650, 'Paid');

-- H. Pending transaction that already has a paid date.        EXPECT error 3819
INSERT INTO transactions (appointment_id, service_name, amount, status, paid_date)
VALUES (3, 'Full Groom', 650, 'Pending', CURDATE());

-- I. Appointment whose customer is NOT the pet's owner (pet 1 belongs to customer 1). EXPECT error 1644
INSERT INTO appointments (pet_id, customer_id, service_id, price, duration_minutes, appointment_date, start_time)
VALUES (1, 2, 1, 650, 120, CURDATE() + INTERVAL 5 DAY, '09:00:00');

-- J. Move an appointment to a pet owned by someone else.      EXPECT error 1644
UPDATE appointments SET pet_id = 2 WHERE id = 5;

-- K. Negative price.                                          EXPECT error 3819
UPDATE services SET price = -5 WHERE id = 1;

-- L. Appointment for a pet that does not exist.               EXPECT error 1644 (or 1452)
INSERT INTO appointments (pet_id, customer_id, service_id, price, duration_minutes, appointment_date, start_time)
VALUES (999, 1, 1, 650, 120, CURDATE() + INTERVAL 5 DAY, '09:00:00');

-- M. Invalid status word.                                     EXPECT error 1265 (data truncated)
UPDATE appointments SET status = 'Finished' WHERE id = 5;

ROLLBACK;