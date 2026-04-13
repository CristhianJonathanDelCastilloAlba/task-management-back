const multer = require('multer');
const path = require('path');

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp|svg/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
        return cb(null, true);
    } else {
        cb(new Error('Solo se permiten imágenes'));
    }
};

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024,
        files: 10
    },
    fileFilter: fileFilter
});

const singleUpload = upload.single('image');
const multipleUpload = upload.array('images', 10);
const fieldsUpload = upload.fields([
    { name: 'images', maxCount: 10 },
    { name: 'image', maxCount: 1 }
]);

module.exports = {
    singleUpload,
    multipleUpload,
    fieldsUpload
};