const pool = require('../db/connection');

// GET /api/tickets - list all tickets with filters
exports.getTickets = async (req, res) => {
    try {
        const { status, priority, category } = req.query;
        let query = `
            SELECT t.*, 
                   u1.name AS requester_name, 
                   u2.name AS assigned_to_name,
                   (t.sla_deadline < NOW() AND t.status IN ('Open', 'In Progress')) AS sla_breached,
                   TIMESTAMPDIFF(MINUTE, NOW(), t.sla_deadline) AS sla_minutes_remaining
            FROM tickets t
            LEFT JOIN users u1 ON t.requester_id = u1.id
            LEFT JOIN users u2 ON t.assigned_to = u2.id
            WHERE 1=1
        `;
        const params = [];
        
        if (status) {
            query += ' AND t.status = ?';
            params.push(status);
        }
        if (priority) {
            query += ' AND t.priority = ?';
            params.push(priority);
        }
        if (category) {
            query += ' AND t.category = ?';
            params.push(category);
        }

        query += ' ORDER BY t.created_at DESC';

        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Database error' });
    }
};

// GET /api/tickets/stats - dashboard aggregates
exports.getTicketStats = async (req, res) => {
    try {
        const statsQuery = `
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'Open' THEN 1 ELSE 0 END) as open_tickets,
                SUM(CASE WHEN status = 'In Progress' THEN 1 ELSE 0 END) as in_progress,
                SUM(CASE WHEN status = 'Escalated' THEN 1 ELSE 0 END) as escalated,
                SUM(CASE WHEN status = 'Resolved' THEN 1 ELSE 0 END) as resolved,
                SUM(CASE WHEN status = 'Closed' THEN 1 ELSE 0 END) as closed,
                SUM(CASE WHEN sla_deadline < NOW() AND status IN ('Open', 'In Progress') THEN 1 ELSE 0 END) as sla_breached
            FROM tickets
        `;
        
        const priorityQuery = `
            SELECT priority, COUNT(*) as count 
            FROM tickets GROUP BY priority
        `;

        const categoryQuery = `
            SELECT category, COUNT(*) as count 
            FROM tickets GROUP BY category
        `;

        const [[stats]] = await pool.query(statsQuery);
        const [priorityStats] = await pool.query(priorityQuery);
        const [categoryStats] = await pool.query(categoryQuery);

        res.json({
            ...stats,
            by_priority: priorityStats,
            by_category: categoryStats
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Database error' });
    }
};

// GET /api/tickets/:id - single ticket detail with logs
exports.getTicketById = async (req, res) => {
    try {
        const { id } = req.params;
        const [ticketRows] = await pool.query(`
            SELECT t.*, 
                   u1.name AS requester_name, 
                   u2.name AS assigned_to_name,
                   (t.sla_deadline < NOW() AND t.status IN ('Open', 'In Progress')) AS sla_breached,
                   TIMESTAMPDIFF(MINUTE, NOW(), t.sla_deadline) AS sla_minutes_remaining
            FROM tickets t
            LEFT JOIN users u1 ON t.requester_id = u1.id
            LEFT JOIN users u2 ON t.assigned_to = u2.id
            WHERE t.id = ?
        `, [id]);

        if (ticketRows.length === 0) {
            return res.status(404).json({ error: 'Ticket not found' });
        }

        const [logs] = await pool.query(`
            SELECT l.*, u.name AS performed_by_name
            FROM ticket_logs l
            LEFT JOIN users u ON l.performed_by = u.id
            WHERE l.ticket_id = ?
            ORDER BY l.created_at ASC
        `, [id]);

        res.json({ ticket: ticketRows[0], logs });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Database error' });
    }
};

// POST /api/tickets - create ticket
exports.createTicket = async (req, res) => {
    try {
        const { title, description, category, priority } = req.body;
        
        // Basic validation
        if (!title || title.length < 5) return res.status(400).json({ error: 'Title must be at least 5 characters' });
        if (!description || description.length < 10) return res.status(400).json({ error: 'Description must be at least 10 characters' });
        
        const validCategories = ['Hardware', 'Software', 'Network', 'Access', 'Other'];
        const validPriorities = ['P1', 'P2', 'P3', 'P4'];
        
        if (!validCategories.includes(category)) return res.status(400).json({ error: 'Invalid category' });
        if (!validPriorities.includes(priority)) return res.status(400).json({ error: 'Invalid priority' });

        // Calculate SLA deadline natively
        const slaHours = { 'P1': 1, 'P2': 4, 'P3': 8, 'P4': 24 }[priority] || 24;

        // Auto-generate ticket number (INC + padding)
        const [lastTicket] = await pool.query('SELECT id FROM tickets ORDER BY id DESC LIMIT 1');
        const nextId = lastTicket.length ? lastTicket[0].id + 1 : 1;
        const ticket_number = 'INC' + String(nextId + 1000).padStart(7, '0');

        const requester_id = 4; // Default to requester user for demo
        
        const [result] = await pool.query(`
            INSERT INTO tickets (ticket_number, title, description, category, priority, requester_id, sla_deadline)
            VALUES (?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR))
        `, [ticket_number, title, description, category, priority, requester_id, slaHours]);

        const ticket_id = result.insertId;

        // Insert log
        await pool.query('INSERT INTO ticket_logs (ticket_id, action, performed_by, note) VALUES (?, ?, ?, ?)', 
            [ticket_id, 'Created', requester_id, 'Ticket created via portal']);

        res.status(201).json({ message: 'Ticket created successfully', ticket_id, ticket_number });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Database error' });
    }
};

// PATCH /api/tickets/:id - update status and/or assigned_to
exports.updateTicket = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, assigned_to } = req.body;

        const updates = [];
        const params = [];
        let logNote = 'Updated: ';

        if (status) {
            updates.push('status = ?');
            params.push(status);
            logNote += `Status set to ${status}. `;
            if (status === 'Resolved') {
                updates.push('resolved_at = NOW()');
            }
        }
        if (assigned_to !== undefined) {
            updates.push('assigned_to = ?');
            params.push(assigned_to);
            logNote += `Assigned to user ID ${assigned_to}. `;
        }

        if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

        params.push(id);
        await pool.query(`UPDATE tickets SET ${updates.join(', ')} WHERE id = ?`, params);

        // Insert log (assuming performed by admin/agent ID 1 for now)
        await pool.query('INSERT INTO ticket_logs (ticket_id, action, performed_by, note) VALUES (?, ?, ?, ?)', 
            [id, 'Status/Assignee Update', 1, logNote]);

        res.json({ message: 'Ticket updated successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Database error' });
    }
};

// POST /api/tickets/:id/escalate - manually escalate
exports.escalateTicket = async (req, res) => {
    try {
        const { id } = req.params;
        
        // Get current tier
        const [rows] = await pool.query('SELECT support_tier FROM tickets WHERE id = ?', [id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Ticket not found' });
        
        let newTier = 'L3';
        if (rows[0].support_tier === 'L1') newTier = 'L2';
        else if (rows[0].support_tier === 'L2') newTier = 'L3';

        await pool.query('UPDATE tickets SET status = ?, support_tier = ? WHERE id = ?', ['Escalated', newTier, id]);

        await pool.query('INSERT INTO ticket_logs (ticket_id, action, performed_by, note) VALUES (?, ?, ?, ?)', 
            [id, 'Manual Escalation', 1, `Escalated manually to ${newTier}`]);

        res.json({ message: 'Ticket escalated successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Database error' });
    }
};

// POST /api/tickets/sla/run-escalation - manually run SLA escalation procedure
exports.runSLAEscalation = async (req, res) => {
    try {
        await exports.processSLAEscalations();
        res.json({ message: 'SLA escalation processed successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Database error' });
    }
};

// Helper function to process escalations
exports.processSLAEscalations = async () => {
    try {
        // 1. Find breached tickets
        const [breached] = await pool.query(`
            SELECT id, support_tier FROM tickets 
            WHERE sla_deadline < NOW() 
            AND status IN ('Open', 'In Progress')
        `);

        if (breached.length === 0) return;

        // 2. Process each ticket
        for (const ticket of breached) {
            const newTier = ticket.support_tier === 'L1' ? 'L2' : 'L3';
            
            await pool.query(`
                UPDATE tickets 
                SET status = 'Escalated', support_tier = ? 
                WHERE id = ?
            `, [newTier, ticket.id]);

            await pool.query(`
                INSERT INTO ticket_logs (ticket_id, action, performed_by, note) 
                VALUES (?, 'System Escalation', 1, ?)
            `, [ticket.id, \`SLA Breached. Automatically escalated to next tier from \${ticket.support_tier}\`]);
        }
    } catch (error) {
        console.error('Error processing SLA escalations in backend:', error);
        throw error;
    }
};
