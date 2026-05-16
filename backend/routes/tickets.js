const express = require('express');
const router = express.Router();
const ticketController = require('../controllers/ticketController');

router.get('/', ticketController.getTickets);
router.get('/stats', ticketController.getTicketStats);
router.post('/sla/run-escalation', ticketController.runSLAEscalation);
router.get('/:id', ticketController.getTicketById);
router.post('/', ticketController.createTicket);
router.patch('/:id', ticketController.updateTicket);
router.post('/:id/escalate', ticketController.escalateTicket);

module.exports = router;
