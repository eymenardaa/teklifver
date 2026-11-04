const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const { pipeline } = require('stream');
const mongoose = require('mongoose');

// Görseller veritabanında (GridFS) saklanır. Ücretsiz sunucularda disk her yeniden başlatmada
// silindiği için dosyaya yazmak görsellerin kaybolmasına yol açardı.
const MAX_IMAGES = 5;

const CONTENT_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp'
};

const bucket = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' });

const newFileName = extension => `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${extension.toLowerCase()}`;

async function removeByName(name) {
  const files = await bucket().find({ filename: name }).toArray();
  await Promise.all(files.map(file => bucket().delete(file._id)));
}

const storage = {
  _handleFile(req, file, cb) {
    const filename = newFileName(path.extname(file.originalname));
    const target = bucket().openUploadStream(filename);
    pipeline(file.stream, target, err => (err ? cb(err) : cb(null, { filename, size: target.length })));
  },
  _removeFile(req, file, cb) {
    removeByName(file.filename).then(() => cb(null), cb);
  }
};

const fileFilter = (req, file, cb) => {
  const allowedTypes = /^(jpeg|jpg|png|gif|webp)$/;
  const extension = path.extname(file.originalname).slice(1).toLowerCase();
  const subtype = file.mimetype.split('/')[1] || '';

  if (allowedTypes.test(extension) && allowedTypes.test(subtype)) return cb(null, true);
  cb(new Error('Yalnızca JPG, PNG, GIF veya WEBP yükleyebilirsiniz.'));
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }
});

// Yükleme hatasını sunucu hatası yapmak yerine req.uploadError ile rotaya iletir,
// böylece kullanıcı formda anlaşılır bir mesaj görür.
const withFriendlyErrors = handler => (req, res, next) => {
  handler(req, res, err => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') req.uploadError = 'Her görsel en fazla 5 MB olabilir.';
      else if (err.code === 'LIMIT_UNEXPECTED_FILE') req.uploadError = `En fazla ${MAX_IMAGES} görsel yükleyebilirsiniz.`;
      else req.uploadError = err.message;
    }
    next();
  });
};

const uploadImages = withFriendlyErrors(upload.array('images', MAX_IMAGES));
const uploadLogo = withFriendlyErrors(upload.single('logo'));

// "/uploads/..." görsellerini siler; örnek fotoğraflara dokunmaz.
function deleteImages(imagePaths) {
  for (const imagePath of imagePaths) {
    if (!String(imagePath).startsWith('/uploads/')) continue;
    removeByName(path.basename(imagePath)).catch(err => console.error('Görsel silinemedi:', err.message));
  }
}

// Yeniden yayınlanan talep eskisiyle aynı dosyayı paylaşmasın diye kopyalar.
async function copyImages(imagePaths) {
  const copies = [];
  for (const imagePath of imagePaths) {
    if (!String(imagePath).startsWith('/uploads/')) {
      copies.push(imagePath);
      continue;
    }
    const name = newFileName(path.extname(imagePath));
    try {
      await new Promise((resolve, reject) => {
        pipeline(
          bucket().openDownloadStreamByName(path.basename(imagePath)),
          bucket().openUploadStream(name),
          err => (err ? reject(err) : resolve())
        );
      });
      copies.push('/uploads/' + name);
    } catch {
      // Dosya bulunamadıysa bu görsel atlanır.
    }
  }
  return copies;
}

// GET /uploads/:name — tür dosya içeriğinden değil, izin verilen uzantıdan belirlenir.
async function serveImage(req, res, next) {
  try {
    const name = path.basename(req.params.name);
    const contentType = CONTENT_TYPES[path.extname(name).toLowerCase()];
    if (!contentType) return next();

    const [file] = await bucket().find({ filename: name }).limit(1).toArray();
    if (!file) return next();

    res.set({
      'Content-Type': contentType,
      'Content-Length': String(file.length),
      'Cache-Control': 'public, max-age=604800, immutable'
    });
    if (req.method === 'HEAD') return res.end();
    pipeline(bucket().openDownloadStream(file._id), res, err => {
      if (err && !res.headersSent) next(err);
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { uploadImages, uploadLogo, deleteImages, copyImages, serveImage, MAX_IMAGES };
