const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const { pipeline } = require('stream');
const mongoose = require('mongoose');
const sharp = require('sharp');

// Görseller veritabanında (GridFS) saklanır. Ücretsiz sunucularda disk her yeniden başlatmada
// silindiği için dosyaya yazmak görsellerin kaybolmasına yol açardı.
const MAX_IMAGES = 5;
const MAX_INPUT_PIXELS = 40000000; // sıkıştırılmış "görsel bombalarına" karşı

// Küçük sunucuda bellek şişmesin.
sharp.cache(false);
sharp.concurrency(1);

const CONTENT_TYPES = {
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime'
};

const bucket = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' });

const newBaseName = () => `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;

// Liste ve küçük resimlerde kullanılan sürüm: "/uploads/a.webp" -> "/uploads/a_t.webp"
const thumbName = name => name.replace(/\.webp$/, '_t.webp');

async function removeByName(name) {
  const files = await bucket().find({ filename: name }).toArray();
  await Promise.all(files.map(file => bucket().delete(file._id)));
}

const saveBuffer = (name, buffer) =>
  new Promise((resolve, reject) => {
    const target = bucket().openUploadStream(name);
    target.once('error', reject);
    target.once('finish', resolve);
    target.end(buffer);
  });

// Gerçekten görsel olduğunu doğrular, konum gibi gizli bilgileri siler, boyutunu küçültür.
async function storeImage(buffer) {
  const image = sharp(buffer, { failOn: 'error', limitInputPixels: MAX_INPUT_PIXELS }).rotate();
  const [full, thumb] = await Promise.all([
    image.clone().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer(),
    image.clone().resize({ width: 480, height: 360, fit: 'cover', withoutEnlargement: true }).webp({ quality: 72 }).toBuffer()
  ]);
  const name = `${newBaseName()}.webp`;
  await Promise.all([saveBuffer(name, full), saveBuffer(thumbName(name), thumb)]);
  return name;
}

const fileFilter = (req, file, cb) => {
  const allowedTypes = /^(jpeg|jpg|png|gif|webp)$/;
  const extension = path.extname(file.originalname).slice(1).toLowerCase();
  const subtype = file.mimetype.split('/')[1] || '';

  if (allowedTypes.test(extension) && allowedTypes.test(subtype)) return cb(null, true);
  cb(new Error('Yalnızca JPG, PNG, GIF veya WEBP yükleyebilirsiniz.'));
};

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }
});

function deleteImages(imagePaths) {
  for (const imagePath of imagePaths) {
    if (!String(imagePath).startsWith('/uploads/')) continue;
    const name = path.basename(imagePath);
    for (const file of new Set([name, thumbName(name)])) {
      removeByName(file).catch(err => console.error('Görsel silinemedi:', err.message));
    }
  }
}

// Yükleme hatasını sunucu hatası yapmak yerine req.uploadError ile rotaya iletir,
// böylece kullanıcı formda anlaşılır bir mesaj görür.
const withFriendlyErrors = (handler, maxFiles = MAX_IMAGES) => (req, res, next) => {
  handler(req, res, async err => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') req.uploadError = 'Her görsel en fazla 5 MB olabilir.';
      else if (err.code === 'LIMIT_UNEXPECTED_FILE') req.uploadError = `En fazla ${maxFiles} görsel yükleyebilirsiniz.`;
      else req.uploadError = err.message;
      req.files = [];
      req.file = undefined;
      return next();
    }

    const files = req.files || (req.file ? [req.file] : []);
    const saved = [];
    try {
      for (const file of files) {
        file.filename = await storeImage(file.buffer);
        file.buffer = null;
        saved.push(file.filename);
      }
    } catch {
      deleteImages(saved.map(name => `/uploads/${name}`));
      req.uploadError = 'Görsel okunamadı. Geçerli bir JPG, PNG, GIF veya WEBP dosyası seçin.';
      req.files = [];
      req.file = undefined;
    }
    next();
  });
};

const uploadMedia = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'video') {
      const allowedVideo = /^(mp4|webm|mov|quicktime)$/;
      const ext = path.extname(file.originalname).slice(1).toLowerCase();
      const sub = file.mimetype.split('/')[1] || '';
      if (allowedVideo.test(ext) || allowedVideo.test(sub)) return cb(null, true);
      return cb(new Error('Yalnızca MP4, WebM veya MOV formatında video yükleyebilirsiniz.'));
    }
    fileFilter(req, file, cb);
  },
  limits: { fileSize: 30 * 1024 * 1024 } // Video için 30 MB, görseller aşağıda 5 MB ile denetlenir
});

const uploadRequestMedia = (req, res, next) => {
  const handler = uploadMedia.fields([
    { name: 'images', maxCount: MAX_IMAGES },
    { name: 'video', maxCount: 1 }
  ]);

  handler(req, res, async err => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') req.uploadError = 'Video en fazla 30 MB, her görsel en fazla 5 MB olabilir.';
      else if (err.code === 'LIMIT_UNEXPECTED_FILE') req.uploadError = `En fazla ${MAX_IMAGES} görsel ve 1 video yükleyebilirsiniz.`;
      else req.uploadError = err.message;
      req.files = { images: [], video: [] };
      return next();
    }

    req.files = req.files || {};
    const imgFiles = req.files.images || [];
    const videoFiles = req.files.video || [];

    // Görseller için 5 MB kontrolü
    for (const f of imgFiles) {
      if (f.size > 5 * 1024 * 1024) {
        req.uploadError = 'Her görsel en fazla 5 MB olabilir.';
        req.files = { images: [], video: [] };
        return next();
      }
    }

    const saved = [];
    try {
      for (const file of imgFiles) {
        file.filename = await storeImage(file.buffer);
        file.buffer = null;
        saved.push(file.filename);
      }

      if (videoFiles.length) {
        const vFile = videoFiles[0];
        const vExt = path.extname(vFile.originalname).toLowerCase() || '.mp4';
        const vName = `${newBaseName()}${vExt}`;
        await saveBuffer(vName, vFile.buffer);
        vFile.filename = vName;
        vFile.buffer = null;
        saved.push(vName);
      }
    } catch {
      deleteImages(saved.map(name => `/uploads/${name}`));
      req.uploadError = 'Dosya işlenemedi. Lütfen geçerli formatta görsel veya video seçin.';
      req.files = { images: [], video: [] };
    }
    next();
  });
};

const uploadImages = withFriendlyErrors(upload.array('images', MAX_IMAGES));
const uploadLogo = withFriendlyErrors(upload.single('logo'), 1);
const uploadMessageImage = withFriendlyErrors(upload.array('images', 1), 1);

const copyFile = (from, to) =>
  new Promise((resolve, reject) => {
    pipeline(bucket().openDownloadStreamByName(from), bucket().openUploadStream(to), err => (err ? reject(err) : resolve()));
  });

// Yeniden yayınlanan talep eskisiyle aynı dosyayı paylaşmasın diye kopyalar.
async function copyImages(imagePaths) {
  const copies = [];
  for (const imagePath of imagePaths) {
    if (!String(imagePath).startsWith('/uploads/')) {
      copies.push(imagePath);
      continue;
    }
    const source = path.basename(imagePath);
    const name = `${newBaseName()}${path.extname(source).toLowerCase()}`;
    try {
      await copyFile(source, name);
      if (thumbName(source) !== source) await copyFile(thumbName(source), thumbName(name)).catch(() => {});
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

    const range = req.headers.range;
    if (range && contentType.startsWith('video/')) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : file.length - 1;
      if (Number.isNaN(start) || start >= file.length || end >= file.length || start > end) {
        return res.status(416).set('Content-Range', `bytes */${file.length}`).end();
      }
      res.status(206).set({
        'Content-Range': `bytes ${start}-${end}/${file.length}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(end - start + 1),
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=604800, immutable'
      });
      if (req.method === 'HEAD') return res.end();
      return pipeline(bucket().openDownloadStream(file._id, { start, end: end + 1 }), res, err => {
        if (err && !res.headersSent) next(err);
      });
    }

    res.set({
      'Content-Type': contentType,
      'Content-Length': String(file.length),
      'Accept-Ranges': contentType.startsWith('video/') ? 'bytes' : 'none',
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

module.exports = { uploadImages, uploadRequestMedia, uploadLogo, uploadMessageImage, deleteImages, copyImages, serveImage, MAX_IMAGES };
