const express = require('express');
const path = require('path');
const multer = require('multer');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'));
    }
    cb(null, true);
  }
});

const region = process.env.AWS_REGION || 'us-east-1';
const bucketName = process.env.S3_BUCKET_NAME || 'hardwaresamplefiles3bucket';

const s3Client = new S3Client({
  region,
  credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    : undefined
});

router.post('/avatar', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Image file is required' });
    }

    const extension = path.extname(req.file.originalname) || '.jpg';
    const key = `avatars/${Date.now()}-${Math.random().toString(36).slice(2)}${extension}`;

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
      ACL: 'public-read'
    });

    await s3Client.send(command);

    const publicUrl = `https://${bucketName}.s3.${region}.amazonaws.com/${key}`;

    res.json({
      url: publicUrl,
      key,
      bucket: bucketName
    });
  } catch (error) {
    console.error('Avatar upload error:', error);
    res.status(500).json({
      error: 'Failed to upload image to S3',
      details: error.message
    });
  }
});

module.exports = router;
