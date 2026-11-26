-- =====================================================================
-- PetCare database: 03_verify.sql
-- Read-only checks. Run each SELECT (or the whole file) and compare with "EXPECT".
-- =====================================================================
USE petcare;
SET time_zone = '+08:00';

-- 1. Version and time zone. EXPECT: version 8.0.16 or higher; time_zone +08:00
SELECT VERSION() AS mysql_version, @@session.time_zone AS time_zone, CURDATE() AS today, NOW() AS now_ph;

-- 2. Tables. EXPECT: appointments, customers, pets, services, transactions, users
SHOW TABLES;

-- 3. Row counts. EXPECT: users 0, customers 10, pets 13, services 7, appointments 14, transactions 5
SELECT 'users' AS table_name, COUNT(*) AS row_count FROM users
UNION ALL SELECT 'customers', COUNT(*) FROM customers
UNION ALL SELECT 'pets', COUNT(*) FROM pets
UNION ALL SELECT 'services', COUNT(*) FROM services
UNION ALL SELECT 'appointments', COUNT(*) FROM appointments
UNION ALL SELECT 'transactions', COUNT(*) FROM transactions;

-- 4. Constraints. EXPECT: 6 FOREIGN KEY, 8 CHECK and 4 UNIQUE rows (users.email, services.name, customers.user_id, transactions.appointment_id)
SELECT TABLE_NAME, CONSTRAINT_NAME, CONSTRAINT_TYPE
FROM information_schema.TABLE_CONSTRAINTS
WHERE TABLE_SCHEMA = 'petcare' AND CONSTRAINT_TYPE IN ('FOREIGN KEY', 'CHECK', 'UNIQUE')
ORDER BY CONSTRAINT_TYPE, TABLE_NAME;

-- 5. Frontend-style ids built from the numbers. EXPECT: CUS-001 ... CUS-010
SELECT id, CONCAT('CUS-', LPAD(id, 3, '0')) AS frontend_id, first_name, last_name FROM customers;

-- 6. Appointments the way the app shows them (joins). EXPECT: 14 rows, pet/owner/service names filled in
SELECT CONCAT('APT-', LPAD(a.id, 3, '0')) AS appointment,
       p.name AS pet, p.species, CONCAT(c.first_name, ' ', c.last_name) AS owner,
       s.name AS service, a.price, a.duration_minutes,
       a.appointment_date, a.start_time, a.status
FROM appointments a
JOIN pets p ON p.id = a.pet_id
JOIN customers c ON c.id = a.customer_id
JOIN services s ON s.id = a.service_id
ORDER BY a.appointment_date DESC, a.start_time;

-- 7. Transactions with their appointment. EXPECT: 5 rows; TRX-004 Refunded (Card), TRX-005 Pending (no method)
SELECT CONCAT('TRX-', LPAD(t.id, 3, '0')) AS transaction_id,
       CONCAT('APT-', LPAD(t.appointment_id, 3, '0')) AS appointment,
       t.service_name, t.amount, t.payment_method, t.status, t.transaction_date, t.paid_date,
       p.name AS pet
FROM transactions t
JOIN appointments a ON a.id = t.appointment_id
JOIN pets p ON p.id = a.pet_id
ORDER BY t.transaction_date DESC, t.id DESC;

-- 8. Revenue = Paid only. EXPECT: total_paid 1800, paid_today 1150
SELECT SUM(amount) AS total_paid,
       SUM(CASE WHEN paid_date = CURDATE() THEN amount ELSE 0 END) AS paid_today
FROM transactions WHERE status = 'Paid';

-- 9. Owner check. EXPECT: 0 rows (every appointment's customer_id is its pet's owner)
SELECT a.id FROM appointments a JOIN pets p ON p.id = a.pet_id WHERE a.customer_id <> p.customer_id;

-- 10. Duration check against the services. EXPECT: 0 rows
SELECT a.id FROM appointments a JOIN services s ON s.id = a.service_id WHERE a.duration_minutes <> s.duration_minutes;

-- 11. Overlap check (cancelled ignored). EXPECT: 0 rows
SELECT a.id AS appointment_a, b.id AS appointment_b
FROM appointments a
JOIN appointments b ON a.id < b.id AND a.appointment_date = b.appointment_date
WHERE a.status <> 'Cancelled' AND b.status <> 'Cancelled'
  AND a.start_time < ADDTIME(b.start_time, SEC_TO_TIME(b.duration_minutes * 60))
  AND b.start_time < ADDTIME(a.start_time, SEC_TO_TIME(a.duration_minutes * 60));

-- 12. Completed appointment <-> transaction. EXPECT: both queries return 0 rows
SELECT a.id FROM appointments a LEFT JOIN transactions t ON t.appointment_id = a.id
WHERE a.status = 'Completed' AND t.id IS NULL;
SELECT t.id FROM transactions t JOIN appointments a ON a.id = t.appointment_id WHERE a.status <> 'Completed';

-- 13. Popular services like the Dashboard (not cancelled). EXPECT total 12 (the 12 non-cancelled appointments)
SELECT s.name, COUNT(*) AS bookings
FROM appointments a JOIN services s ON s.id = a.service_id
WHERE a.status <> 'Cancelled'
GROUP BY s.id, s.name ORDER BY bookings DESC, s.name;