const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const MAX_IMAGES = 5;

const newFileName = extension =>
  `${Date.now()}-${Math.round(Math.random() * 1e9)}${extension.toLowerCase()}`;

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, newFileName(path.extname(file.originalname)))
});

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

// "/uploads/..." yollarını diskten siler; örnek fotoğraflara ve dizin dışına dokunmaz.
function deleteImages(imagePaths) {
  for (const imagePath of imagePaths) {
    if (!String(imagePath).startsWith('/uploads/')) continue;
    fs.unlink(path.join(uploadDir, path.basename(imagePath)), () => {});
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
      await fs.promises.copyFile(path.join(uploadDir, path.basename(imagePath)), path.join(uploadDir, name));
      copies.push('/uploads/' + name);
    } catch {
      // Dosya bulunamadıysa bu görsel atlanır.
    }
  }
  return copies;
}

module.exports = { uploadImages, uploadLogo, deleteImages, copyImages, MAX_IMAGES };
