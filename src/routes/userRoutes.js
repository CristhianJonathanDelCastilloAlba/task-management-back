const express = require('express');
const router = express.Router();
const {
    getUsers,
    createUser,
    updateUser,
    deleteUser
} = require('../controllers/userController');
const { verifyToken, authorize } = require('../middleware/auth');

router.use(verifyToken);
router.get('/', getUsers);
router.post('/', authorize('admin'), createUser);
router.put('/:id', authorize('admin'), updateUser);
router.delete('/:id', authorize('admin'), deleteUser);

module.exports = router;