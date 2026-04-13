const express = require('express');
const router = express.Router();
const {
    multipleUpload,
    singleUpload,
} = require('../middleware/upload'); 

const {
    getTasks,
    createTask,
    updateTask,
    addComment,
    editComment,
    deleteTask,
    uploadTaskImage,
    getTasksWithoutProject,
    getTasksByProject,
    uploadTaskImages,
    deleteTaskImages,
} = require('../controllers/taskController');
const { verifyToken } = require('../middleware/auth');

const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

router.use(verifyToken);
router.get('/', getTasks);
router.post('/', multipleUpload, createTask);
router.put('/:id', multipleUpload, updateTask);
router.delete('/:id', deleteTask);
router.post('/:id/comments', upload.any(), addComment);
router.get('/tasks/without-project', getTasksWithoutProject);
router.get('/project/:project_id', getTasksByProject);
router.post('/:id/images', multipleUpload, uploadTaskImages);
router.delete('/:id/images', deleteTaskImages);
router.put('/:taskId/comments/:commentId', multipleUpload, editComment);

module.exports = router;