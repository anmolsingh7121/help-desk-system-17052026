CREATE DATABASE IF NOT EXISTS helpdesk_db;
USE helpdesk_db;

-- Users Table
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    role ENUM('requester', 'l1_agent', 'l2_agent', 'l3_agent', 'admin') NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tickets Table
CREATE TABLE IF NOT EXISTS tickets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ticket_number VARCHAR(20) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    category ENUM('Hardware', 'Software', 'Network', 'Access', 'Other') NOT NULL,
    priority ENUM('P1', 'P2', 'P3', 'P4') NOT NULL,
    status ENUM('Open', 'In Progress', 'Escalated', 'Resolved', 'Closed') DEFAULT 'Open',
    support_tier ENUM('L1', 'L2', 'L3') DEFAULT 'L1',
    requester_id INT NOT NULL,
    assigned_to INT NULL,
    sla_deadline DATETIME NOT NULL,
    resolved_at DATETIME NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (requester_id) REFERENCES users(id),
    FOREIGN KEY (assigned_to) REFERENCES users(id)
);

-- Ticket Logs Table
CREATE TABLE IF NOT EXISTS ticket_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ticket_id INT NOT NULL,
    action VARCHAR(255) NOT NULL,
    performed_by INT NOT NULL,
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
    FOREIGN KEY (performed_by) REFERENCES users(id)
);

-- Stored Procedures

-- 1. set_sla_deadline
DELIMITER //
CREATE PROCEDURE IF NOT EXISTS set_sla_deadline(IN p_ticket_id INT, IN p_priority VARCHAR(2))
BEGIN
    DECLARE v_hours INT;
    
    IF p_priority = 'P1' THEN SET v_hours = 1;
    ELSEIF p_priority = 'P2' THEN SET v_hours = 4;
    ELSEIF p_priority = 'P3' THEN SET v_hours = 8;
    ELSEIF p_priority = 'P4' THEN SET v_hours = 24;
    ELSE SET v_hours = 24;
    END IF;
    
    UPDATE tickets 
    SET sla_deadline = DATE_ADD(CURRENT_TIMESTAMP, INTERVAL v_hours HOUR)
    WHERE id = p_ticket_id;
END //
DELIMITER ;

-- 2. escalate_breached_tickets
DELIMITER //
CREATE PROCEDURE IF NOT EXISTS escalate_breached_tickets()
BEGIN
    -- Temporary table to hold breached ticket IDs to add logs later
    CREATE TEMPORARY TABLE IF NOT EXISTS breached_tickets AS
    SELECT id, support_tier FROM tickets 
    WHERE sla_deadline < CURRENT_TIMESTAMP 
    AND status IN ('Open', 'In Progress');

    -- Insert logs for escalations (Assuming user ID 1 is Admin/System)
    INSERT INTO ticket_logs (ticket_id, action, performed_by, note)
    SELECT id, 'System Escalation', 1, CONCAT('SLA Breached. Automatically escalated to next tier from ', support_tier)
    FROM breached_tickets;

    -- Update tickets
    UPDATE tickets
    SET status = 'Escalated',
        support_tier = CASE 
            WHEN support_tier = 'L1' THEN 'L2'
            WHEN support_tier = 'L2' THEN 'L3'
            ELSE 'L3'
        END
    WHERE id IN (SELECT id FROM breached_tickets);
    
    DROP TEMPORARY TABLE IF EXISTS breached_tickets;
END //
DELIMITER ;

-- Seed Data (Ignore duplicates on multiple runs)
INSERT IGNORE INTO users (id, name, email, role) VALUES 
(1, 'System Admin', 'admin@helpdesk.local', 'admin'),
(2, 'Alice L1', 'alice@helpdesk.local', 'l1_agent'),
(3, 'Bob L2', 'bob@helpdesk.local', 'l2_agent'),
(4, 'Charlie L3', 'charlie@helpdesk.local', 'l3_agent'),
(5, 'Dave Requester', 'dave@helpdesk.local', 'requester');

INSERT IGNORE INTO tickets (id, ticket_number, title, description, category, priority, status, support_tier, requester_id, assigned_to, sla_deadline) VALUES
(1, 'INC0001001', 'Laptop will not turn on', 'Pressing power button does nothing. Need help ASAP.', 'Hardware', 'P1', 'Open', 'L1', 5, NULL, DATE_ADD(NOW(), INTERVAL 1 HOUR)),
(2, 'INC0001002', 'Cannot access VPN', 'Getting error 403 when trying to connect to the corporate VPN.', 'Network', 'P2', 'In Progress', 'L1', 5, 2, DATE_ADD(NOW(), INTERVAL 4 HOUR)),
(3, 'INC0001003', 'Word keeps crashing', 'MS Word closes unexpectedly after 5 minutes of use.', 'Software', 'P3', 'Escalated', 'L2', 5, 3, DATE_SUB(NOW(), INTERVAL 1 HOUR)),
(4, 'INC0001004', 'Need access to Jira', 'Please grant me access to the engineering Jira project.', 'Access', 'P4', 'Resolved', 'L1', 5, 2, DATE_ADD(NOW(), INTERVAL 24 HOUR)),
(5, 'INC0001005', 'Monitor is flickering', 'Secondary monitor keeps blinking on and off.', 'Hardware', 'P2', 'Open', 'L1', 5, NULL, DATE_ADD(NOW(), INTERVAL 4 HOUR));

INSERT IGNORE INTO ticket_logs (id, ticket_id, action, performed_by, note) VALUES
(1, 1, 'Created', 5, 'Ticket submitted via portal'),
(2, 2, 'Created', 5, 'Ticket submitted via portal'),
(3, 2, 'Status Changed', 2, 'Assigned to Alice and moved to In Progress'),
(4, 3, 'Created', 5, 'Ticket submitted via portal'),
(5, 3, 'Escalated', 3, 'Moved to L2 due to complexity'),
(6, 4, 'Created', 5, 'Ticket submitted via portal'),
(7, 4, 'Resolved', 2, 'Access granted'),
(8, 5, 'Created', 5, 'Ticket submitted via portal');
