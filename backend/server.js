const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();
const ticketsRouter = require('./routes/tickets');
const pool = require('./db/connection');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../frontend')));

app.use('/api/tickets', ticketsRouter);

// Automatic SLA escalation every 5 minutes
setInterval(async () => {
    try {
        console.log('Running automatic SLA escalation procedure...');
        const ticketController = require('./controllers/ticketController');
        await ticketController.processSLAEscalations();
        console.log('SLA escalation finished.');
    } catch (error) {
        console.error('Error running automatic SLA escalation:', error);
    }
}, 5 * 60 * 1000);

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
