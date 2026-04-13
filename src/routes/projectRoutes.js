const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const {
    getProjects,
    getProjectStats,
    createProject,
    updateProject,
    deleteProject,
    getProjectById,
} = require('../controllers/projectController');
router.use(verifyToken);

router.get('/', getProjects);
router.get('/without-tasks', getProjects);
router.get('/:id', getProjectById);
router.get('/:id/stats', getProjectStats);
router.post('/', createProject);
router.put('/:id', updateProject);
router.delete('/:id', deleteProject);

module.exports = router;