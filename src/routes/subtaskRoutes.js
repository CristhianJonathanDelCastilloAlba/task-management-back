const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

const {
    getSubtasksByTask,
    createSubtask,
    updateSubtask,
    deleteSubtask
} = require('../controllers/subtaskController');

router.use(verifyToken);

router.get('/task/:taskId', getSubtasksByTask);
router.post('/task/:taskId', upload.any(), createSubtask);
router.patch('/:subtaskId', upload.any(), updateSubtask);
router.delete('/:subtaskId', deleteSubtask);

module.exports = router;