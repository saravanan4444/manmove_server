const express    = require('express');
const router     = express.Router();
const multer     = require('multer');
const cloudinary = require('cloudinary').v2;
const { authenticate } = require('../config/authMiddleware');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

function uploadToCloudinary(buffer, filename) {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream({ public_id: filename, resource_type: 'auto' }, (err, result) => {
            if (err) return reject(err);
            resolve(result.secure_url);
        });
        stream.end(buffer);
    });
}

router.post('/uploadimage', authenticate, upload.single('image'), async (req, res) => {
    if (!req.file) return res.status(200).json({ status: 400, message: 'No file' });
    try {
        const url = await uploadToCloudinary(req.file.buffer, 'inv-' + Date.now());
        res.status(200).json({ status: 200, url });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

router.post('/testFormData', authenticate, async (req, res) => {
    try {
        const imgdata = req.body.data.replace(/^data:image\/\w+;base64,/, '');
        const url = await uploadToCloudinary(Buffer.from(imgdata, 'base64'), req.query.type + '-' + Date.now());
        res.status(200).json({ status: 200, type: req.query.type, data: url });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

router.post('/savefile', authenticate, upload.single('file'), async (req, res) => {
    const buffer = req.file?.buffer;
    if (!buffer) return res.status(200).json({ status: 400, message: 'No file data' });
    try {
        const url = await uploadToCloudinary(buffer, (req.query.date || Date.now()) + '.jpg');
        res.status(200).json({ status: 200, url, message: 'Successfully Uploaded' });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

// Deprecated stubs
router.get('/image/:pic', (req, res) => res.status(410).json({ status: 410, message: 'Images served via Cloudinary URLs' }));
router.get('/answer/:pdf', (req, res) => res.status(410).json({ status: 410, message: 'Files served via Cloudinary URLs' }));

module.exports = router;
