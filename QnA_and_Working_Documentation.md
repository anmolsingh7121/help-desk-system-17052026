# Help Desk System - Documentation & Q&A

This document serves as a comprehensive guide to the internal workings of the IT Help Desk Ticket Management System, along with common questions and answers for stakeholders, reviewers, or technical recruiters.

## How It Works (The Working Model)

### 1. Architecture Overview
The application follows a classic 3-tier architecture:
- **Presentation Layer**: A single `index.html` file containing HTML structure, custom CSS for styling, and Vanilla JavaScript for dynamic DOM manipulation and API communication.
- **Application Layer**: A Node.js/Express backend that exposes a RESTful API. It handles routing, business logic validation, and database communication.
- **Data Layer**: A MySQL database utilizing relational tables (`users`, `tickets`, `ticket_logs`) and stored procedures to handle complex data operations closely tied to the data itself.

### 2. The Incident Lifecycle
1. **Creation**: A user submits a ticket via the frontend modal. The backend validates the input and inserts a row into the `tickets` table. 
2. **SLA Assignment**: Immediately after insertion, the backend calls the `set_sla_deadline` stored procedure. This procedure looks at the priority (P1 = 1 hr, P2 = 4 hr, P3 = 8 hr, P4 = 24 hr) and sets the `sla_deadline` timestamp relative to the current time.
3. **Tracking & Logs**: An entry is added to `ticket_logs` noting the creation. Every subsequent change (status update, assignment) writes a new log entry.
4. **Resolution**: Support agents process the ticket, updating its status. Setting it to "Resolved" stamps the `resolved_at` field.

### 3. Automated SLA Escalation
The system strictly enforces SLAs:
- **Background Cron**: In `server.js`, a `setInterval` runs every 5 minutes, invoking the `escalate_breached_tickets` stored procedure.
- **The Procedure**: It identifies tickets where `sla_deadline < NOW()` and status is 'Open' or 'In Progress'. 
- **The Action**: It changes the status to 'Escalated', bumps the `support_tier` (e.g., L1 to L2), and writes an automated log entry attributed to the "System".
- **Manual Trigger**: The dashboard provides a "Run SLA Escalation" button to trigger this process on demand for demonstration or testing purposes.

---

## Technical Q&A

### Q1: Why use Vanilla JS/CSS instead of React/Tailwind?
**A:** Using pure vanilla technologies demonstrates a deep, fundamental understanding of the DOM, CSS styling principles (like Flexbox, Grid, CSS Variables), and asynchronous JavaScript (Fetch API, Promises) without relying on abstractions. It guarantees an extremely lightweight frontend with zero build-step overhead.

### Q2: Why handle SLA logic inside MySQL Stored Procedures instead of Node.js?
**A:** Stored procedures ensure data integrity at the database level. If another application, microservice, or even a direct database admin inserts a ticket or runs an escalation, the rules remain strictly enforced without duplicating logic in multiple codebases. It also reduces data transfer overhead between the DB and the Node server when bulk updating breached tickets.

### Q3: How does the connection pooling work?
**A:** The backend uses `mysql2/promise` to create a connection pool. Instead of opening and closing a new connection for every single HTTP request (which is highly resource-intensive), the pool maintains a set of active connections (up to 10 in this config). When a request comes in, it borrows a connection, executes the query, and returns it to the pool.

### Q4: How is the Activity Log maintained?
**A:** The `ticket_logs` table has a foreign key to `tickets(id)`. Whenever a `POST` or `PATCH` request modifies a ticket, a secondary `INSERT` statement is executed within the controller to document the action, the user who performed it, and a descriptive note. When a ticket is fetched via `GET /api/tickets/:id`, a `JOIN` retrieves the full chronological history.

### Q5: What happens to the logs if a ticket is deleted?
**A:** The schema uses `ON DELETE CASCADE` for the `ticket_logs` foreign key constraint. If a ticket is ever purged from the database, all associated logs are automatically cleaned up by MySQL, preventing orphaned data.

### Q6: How does the UI determine if a ticket has breached its SLA?
**A:** The backend computes this dynamically during the `SELECT` query:
`(t.sla_deadline < NOW() AND t.status IN ('Open', 'In Progress')) AS sla_breached`. 
This boolean flag is passed to the frontend, which then applies a specific CSS class (`.sla-breached`) to tint the table row red and alert the agent.

### Q7: Can a ticket go from L1 directly to L3?
**A:** Manually, an admin could potentially update the database directly, but through the provided escalation logic (both manual and automated), tier promotion is strictly sequential: L1 → L2 → L3. Once at L3, it remains there even if breached again.
