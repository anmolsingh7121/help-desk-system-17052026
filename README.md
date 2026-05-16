# IT Help Desk Ticket Management System

A full-stack, ServiceNow-style ITSM (IT Service Management) application built with Node.js, Express, MySQL, and vanilla JavaScript/CSS. 

## Features
- **Ticket Management**: Create, update, and track IT support tickets.
- **SLA Management**: Automated SLA deadline calculation based on priority (P1-P4).
- **Auto-Escalation**: Background interval and manual triggers to escalate breached tickets.
- **Role-Based Views**: (Data model supports Requester, L1, L2, L3 Agents).
- **Activity Log**: Full audit trail of ticket lifecycle events.

## Setup Instructions

1. **Database Setup**
   - Ensure MySQL is installed and running.
   - Run the schema file: `mysql -u root -p < backend/db/schema.sql`
   - This creates the `helpdesk_db` database, tables, stored procedures, and seed data.

2. **Environment Configuration**
   - Copy `.env.example` to `.env`.
   - Update your MySQL credentials inside `.env`.

3. **Install Dependencies**
   - Run `npm install` in the project root.

4. **Start the Application**
   - Run `npm start` (or `npm run dev` for nodemon).
   - The backend server will start on `http://localhost:3000`.
   - A background process will automatically run SLA escalations every 5 minutes.

5. **Access the Frontend**
   - Simply open `frontend/index.html` in any web browser. (No build step required).

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tickets` | List all tickets (supports `?status=`, `?priority=`, `?category=` filters). Includes SLA breached flags. |
| GET | `/api/tickets/stats` | Dashboard aggregates (total, open, breached counts, breakdowns by priority/category). |
| GET | `/api/tickets/:id` | Single ticket detail with full activity logs. |
| POST | `/api/tickets` | Create a new ticket. Triggers `set_sla_deadline` stored procedure. |
| PATCH | `/api/tickets/:id` | Update status and/or assigned_to. Logs the change. |
| POST | `/api/tickets/:id/escalate` | Manually escalate a ticket (L1 → L2 → L3). |
| POST | `/api/tickets/sla/run-escalation` | Manually trigger the `escalate_breached_tickets` stored procedure. |

## Resume Bullet Points (ITSM / Developer Focus)

- Engineered a ServiceNow-style IT Service Management (ITSM) platform using Node.js and MySQL, facilitating end-to-end incident lifecycle management from creation to resolution.
- Designed and implemented an automated Service Level Agreement (SLA) engine using MySQL Stored Procedures, dynamically calculating deadlines based on priority (P1-P4) metrics.
- Developed an automated escalation workflow that continuously monitors for SLA breaches, automatically promoting unresolved incidents through L1/L2/L3 support tiers.
- Built a responsive, single-page application dashboard using vanilla JavaScript and CSS, delivering real-time ticket analytics, SLA tracking, and activity audit logs without external UI frameworks.
- Architected a robust relational database schema incorporating full audit trailing (ticket_logs) to ensure compliance and traceability for all status transitions and assignment changes.
