const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const {
    getModules,
    getModuleById,
    getModuleStats,
    createModule,
    updateModule,
    deleteModule,
    reorderModules,
} = require('../controllers/moduleController');

router.use(verifyToken);

router.get('/', getModules);
router.get('/:id', getModuleById);
router.get('/:id/stats', getModuleStats);
router.post('/', createModule);
router.put('/:id', updateModule);
router.delete('/:id', deleteModule);
router.post('/:project_id/reorder', reorderModules);

module.exports = router;