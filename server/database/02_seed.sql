-- =====================================================================
-- PetCare database: 02_seed.sql
-- Copies the current frontend mock data into MySQL (run 01_schema.sql first).
-- Dates are relative to today (CURDATE() = today in Philippine time), exactly like
-- daysFromToday() in sampleData.js, so "today's appointments" always exist.
-- The rows are inserted parents first, so the foreign keys are satisfied.
-- No users are inserted: password hashes are created later by the Express code.
-- =====================================================================
USE petcare;
SET time_zone = '+08:00';

-- Frontend id "CUS-001" is database id 1, "PET-013" is 13, "APT-014" is 14, "TRX-005" is 5.
-- AUTO_INCREMENT continues after the highest id, so the next customer becomes 11, the next pet 14, etc.

INSERT INTO customers (id, first_name, last_name, contact_number, email, address, date_registered) VALUES
  (1, 'Maria', 'Santos', '0917 123 4567', 'maria.santos@example.com', '12 Mabini St., Quezon City', CURDATE() - INTERVAL 400 DAY),
  (2, 'Jose', 'Reyes', '0918 234 5678', 'jose.reyes@example.com', '45 Rizal Ave., Makati', CURDATE() - INTERVAL 320 DAY),
  (3, 'Carla', 'Mendoza', '0919 345 6789', NULL, '8 Katipunan Rd., Marikina', CURDATE() - INTERVAL 250 DAY),
  (4, 'Angela', 'Cruz', '0920 456 7890', 'angela.cruz@example.com', NULL, CURDATE() - INTERVAL 180 DAY),
  (5, 'Paolo', 'Dela Cruz', '0921 567 8901', 'paolo.delacruz@example.com', '17 Aguinaldo St., Pasig', CURDATE() - INTERVAL 120 DAY),
  (6, 'Bea', 'Villanueva', '0922 678 9012', NULL, NULL, CURDATE() - INTERVAL 60 DAY),
  (7, 'Miguel', 'Ramos', '0923 789 0123', 'miguel.ramos@example.com', '3 Bonifacio Ln., Taguig', CURDATE() - INTERVAL 12 DAY),
  (8, 'Rafael', 'Bautista', '0924 890 1234', NULL, NULL, CURDATE() - INTERVAL 5 DAY),
  (9, 'Lorna', 'Aquino', '0925 901 2345', 'lorna.aquino@example.com', '22 Luna St., Mandaluyong', CURDATE() - INTERVAL 3 DAY),
  (10, 'Dennis', 'Uy', '0926 012 3456', NULL, NULL, CURDATE() - INTERVAL 1 DAY);

INSERT INTO services (id, name, description, price, duration_minutes, is_active) VALUES
  (1, 'Full Groom', 'Bath, blow-dry, haircut, nail trim and ear cleaning', 650, 120, 1),
  (2, 'Basic Bath', 'Bath, blow-dry and brush-out', 350, 60, 1),
  (3, 'De-shedding', 'Bath plus de-shedding treatment and thorough brushing', 500, 75, 1),
  (4, 'Nail Trim', 'Nail clipping and filing', 150, 20, 1),
  (5, 'Flea & Tick Care', 'Medicated bath for fleas and ticks', 450, 45, 1),
  (6, 'Teeth Brushing', 'Teeth cleaning and fresh-breath treatment', 200, 20, 1),
  (7, 'Medicated Bath', 'Bath with vet-prescribed shampoo', 550, 60, 0);

INSERT INTO pets (id, customer_id, name, species, breed, birth_date, sex, notes) VALUES
  (1, 1, 'Mochi', 'Dog', 'Shih Tzu', CURDATE() - INTERVAL 1200 DAY, 'Male', NULL),
  (2, 2, 'Cooper', 'Dog', 'Golden Retriever', CURDATE() - INTERVAL 2000 DAY, 'Male', 'Loves water, dislikes the dryer'),
  (3, 3, 'Coco', 'Dog', 'Poodle', CURDATE() - INTERVAL 1500 DAY, 'Female', NULL),
  (4, 4, 'Luna', 'Cat', 'Persian', CURDATE() - INTERVAL 900 DAY, 'Female', 'Gets nervous around dryers'),
  (5, 5, 'Biscuit', 'Dog', 'Corgi', CURDATE() - INTERVAL 700 DAY, 'Male', NULL),
  (6, 6, 'Nala', 'Dog', 'Pomeranian', CURDATE() - INTERVAL 500 DAY, 'Female', NULL),
  (7, 7, 'Max', 'Dog', 'Aspin', CURDATE() - INTERVAL 2600 DAY, 'Male', 'Sensitive skin'),
  (8, 8, 'Rocky', 'Dog', 'Siberian Husky', CURDATE() - INTERVAL 1100 DAY, 'Male', 'Heavy shedder'),
  (9, 1, 'Daisy', 'Dog', 'Shih Tzu', CURDATE() - INTERVAL 800 DAY, 'Female', NULL),
  (10, 4, 'Peanut', 'Dog', 'Dachshund', CURDATE() - INTERVAL 1300 DAY, 'Male', NULL),
  (11, 9, 'Bruno', 'Dog', 'Aspin', CURDATE() - INTERVAL 400 DAY, 'Male', NULL),
  (12, 7, 'Snowball', 'Other', 'Holland Lop Rabbit', CURDATE() - INTERVAL 300 DAY, 'Female', NULL),
  (13, 9, 'Mimi', 'Cat', 'Puspin', CURDATE() - INTERVAL 600 DAY, 'Female', NULL);

INSERT INTO appointments (id, pet_id, customer_id, service_id, price, duration_minutes, appointment_date, start_time, notes, status) VALUES
  (1, 1, 1, 1, 650, 120, CURDATE(), '08:30:00', NULL, 'Completed'),
  (2, 2, 2, 3, 500, 75, CURDATE(), '10:30:00', 'Heavy shedding, needs extra brushing', 'Completed'),
  (3, 3, 3, 1, 650, 120, CURDATE(), '10:00:00', 'Owner called to cancel', 'Cancelled'),
  (4, 4, 4, 2, 350, 60, CURDATE(), '12:00:00', 'Gets nervous around dryers', 'In Progress'),
  (5, 5, 5, 1, 650, 120, CURDATE(), '13:00:00', NULL, 'Confirmed'),
  (6, 6, 6, 4, 150, 20, CURDATE(), '15:00:00', NULL, 'Pending'),
  (7, 7, 7, 5, 450, 45, CURDATE(), '16:00:00', 'Owner noticed scratching for a week', 'Pending'),
  (8, 8, 8, 3, 500, 75, CURDATE() + INTERVAL 1 DAY, '09:00:00', NULL, 'Pending'),
  (9, 9, 1, 6, 200, 20, CURDATE() + INTERVAL 1 DAY, '10:30:00', NULL, 'Confirmed'),
  (10, 10, 4, 2, 350, 60, CURDATE() + INTERVAL 2 DAY, '13:30:00', NULL, 'Pending'),
  (11, 8, 8, 1, 650, 120, CURDATE() - INTERVAL 1 DAY, '14:00:00', NULL, 'Completed'),
  (12, 9, 1, 2, 350, 60, CURDATE() - INTERVAL 2 DAY, '11:00:00', NULL, 'Completed'),
  (13, 2, 2, 4, 150, 20, CURDATE() - INTERVAL 3 DAY, '15:30:00', 'Customer asked to reschedule', 'Cancelled'),
  (14, 5, 5, 2, 350, 60, CURDATE() - INTERVAL 5 DAY, '10:00:00', NULL, 'Completed');

INSERT INTO transactions (id, appointment_id, service_name, amount, payment_method, status, transaction_date, paid_date) VALUES
  (1, 1, 'Full Groom', 650, 'Cash', 'Paid', CURDATE(), CURDATE()),
  (2, 2, 'De-shedding', 500, 'GCash', 'Paid', CURDATE(), CURDATE()),
  (3, 11, 'Full Groom', 650, 'Cash', 'Paid', CURDATE() - INTERVAL 1 DAY, CURDATE() - INTERVAL 1 DAY),
  (4, 12, 'Basic Bath', 350, 'Card', 'Refunded', CURDATE() - INTERVAL 2 DAY, CURDATE() - INTERVAL 2 DAY),
  (5, 14, 'Basic Bath', 350, NULL, 'Pending', CURDATE() - INTERVAL 5 DAY, NULL);

-- Where the numbers came from: ids and values are copied from src/data/mock/sampleData.js.
-- Empty strings in the mock data ("") became NULL. Each transaction's service_name is the name
-- saved on its appointment (the sample transactions had no serviceName of their own).