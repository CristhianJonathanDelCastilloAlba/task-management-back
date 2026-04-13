const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const {
    getMyNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    deleteAllRead
} = require('../controllers/notificationController');

router.use(verifyToken);
router.get('/my-notifications', getMyNotifications);
router.put('/:id/read', markAsRead);
router.put('/mark-all-read', markAllAsRead);
router.delete('/:id', deleteNotification);
router.delete('/', deleteAllRead);

module.exports = router;