require('dotenv').config();
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const flash = require('connect-flash');
const methodOverride = require('method-override');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');

const mongoose = require('mongoose');
const connectDatabase = require('./config/db');
const { closeDatabase } = connectDatabase;
const { serveImage } = require('./middleware/upload');
const { seedDemoData, demoAccounts } = require('./config/demo');
const Request = require('./models/Request');
const Message = require('./models/Message');
const Notification = require('./models/Notification');
const User = require('./models/User');
const ads = require('./config/ads');
const site = require('./config/site');
const icon = require('./lib/icons');
const helpers = require('./lib/helpers');
const { visibleProviders } = require('./lib/oauth');

const isProduction = process.env.NODE_ENV === 'production';

async function start() {
  if (!process.env.SESSION_SECRET) {
    throw new Error('SESSION_SECRET tanımlı değil. .env dosyasını kontrol edin.');
  }
  if (isProduction) checkProductionSettings();

  const mongoUrl = await connectDatabase();
  const hasDemoData = !isProduction && (await seedDemoData());
  await Request.assignMissingNumbers();

  // .env içindeki adres yönetici yapılır
  if (process.env.ADMIN_EMAIL) {
    await User.updateOne({ email: process.env.ADMIN_EMAIL.trim().toLowerCase() }, { isAdmin: true });
  }

  const app = express();

  // Barındırma servisinin önündeki vekil sunucu sayısı; gerçek ziyaretçi IP'si ve https buradan anlaşılır.
  if (isProduction) app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS) || 1);

  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  Object.assign(app.locals, helpers, {
    icon,
    site,
    demoAccounts: hasDemoData ? demoAccounts : [],
    socialProviders: visibleProviders()
  });
  const activeAds = ads.filter(ad => hasDemoData || !ad.demo);

  // Güvenlik başlıkları: yalnızca sitenin kendi betik ve görselleri çalışır.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: null
        }
      },
      hsts: isProduction,
      crossOriginEmbedderPolicy: false
    })
  );
  app.use(compression());

  const staticOptions = { maxAge: isProduction ? '1d' : 0 };
  app.use(express.static(path.join(__dirname, 'public'), staticOptions));

  // Sunucunun ayakta olduğunu ve veritabanına bağlı olduğunu barındırma servisine bildirir.
  app.get('/healthz', (req, res) => {
    const healthy = mongoose.connection.readyState === 1;
    res.status(healthy ? 200 : 503).json({ status: healthy ? 'ok' : 'veritabani-yok' });
  });

  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use(methodOverride('_method'));

  // Oturum hata verse bile hata sayfası çizilebilsin diye varsayılanlar önce atanır.
  app.use((req, res, next) => {
    Object.assign(res.locals, {
      currentUser: null,
      currentPath: req.path,
      currentUrl: req.originalUrl,
      pageUrl: `${process.env.SITE_URL || `${req.protocol}://${req.get('host')}`}${req.originalUrl}`,
      favoriteIds: [],
      unreadMessages: 0,
      unreadNotifications: 0,
      metaDescription: '',
      ogImage: '',
      success: [],
      error: [],
      errors: {},
      values: {}
    });

    // Aynı sayfada reklam tekrar etmesin diye her istekte karışık sırayla verilir.
    const queue = [...activeAds].sort(() => Math.random() - 0.5);
    let position = 0;
    res.locals.nextAd = () => (queue.length ? queue[position++ % queue.length] : null);
    next();
  });

  app.use(
    session({
      secret: process.env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      store: MongoStore.create({ mongoUrl, ttl: 7 * 24 * 60 * 60 }),
      cookie: {
        httpOnly: true,
        sameSite: 'lax', // başka sitelerden gelen POST isteklerine çerez eklenmez
        secure: 'auto'
      }
    })
  );

  app.use(flash());

  // Hesap silinmiş veya askıya alınmışsa açık oturum da kapanır; yönetici yetkisi güncel tutulur.
  app.use(async (req, res, next) => {
    if (!req.session.user) return next();
    try {
      const account = await User.findById(req.session.user.id).select('suspended isAdmin').lean();
      if (!account || account.suspended) {
        delete req.session.user;
        return next();
      }
      req.session.user.isAdmin = Boolean(account.isAdmin);
      next();
    } catch (err) {
      next(err);
    }
  });

  app.use((req, res, next) => {
    res.locals.currentUser = req.session.user || null;
    res.locals.favoriteIds = (req.session.user && req.session.user.favorites) || [];
    // Boş okuma her ziyaretçi için gereksiz oturum açmasın diye yalnızca mesaj varsa okunur.
    if (req.session.flash) {
      res.locals.success = req.flash('success');
      res.locals.error = req.flash('error');
    }
    next();
  });

  // Üst menüdeki okunmamış sayıları
  app.use(async (req, res, next) => {
    if (!req.session.user) return next();
    try {
      const id = req.session.user.id;
      [res.locals.unreadMessages, res.locals.unreadNotifications] = await Promise.all([
        Message.countDocuments({ receiver: id, read: false }),
        Notification.countDocuments({ user: id, read: false })
      ]);
      next();
    } catch (err) {
      next(err);
    }
  });

  app.get('/uploads/:name', serveImage);
  app.use('/', require('./routes/home'));
  app.use('/', require('./routes/pages'));
  app.use('/', require('./routes/auth'));
  app.use('/', require('./routes/oauth'));
  app.use('/requests', require('./routes/requests'));
  app.use('/companies', require('./routes/companies'));
  app.use('/messages', require('./routes/messages'));
  app.use('/notifications', require('./routes/notifications'));
  app.use('/bids', require('./routes/bids'));
  app.use('/dashboard', require('./routes/dashboard'));
  app.use('/admin', require('./routes/admin'));

  app.use((req, res) => {
    res.status(404).render('error', {
      title: 'Sayfa bulunamadı',
      code: 404,
      message: 'Aradığınız sayfa taşınmış ya da hiç var olmamış olabilir.'
    });
  });

  app.use((err, req, res, next) => {
    console.error(err.stack);
    if (res.headersSent) return next(err);
    res.status(500).render('error', {
      title: 'Bir sorun oluştu',
      code: 500,
      message: 'Beklenmeyen bir hata oldu. Lütfen biraz sonra tekrar deneyin.'
    });
  });

  const PORT = process.env.PORT || 3000;
  const server = app.listen(PORT, () => {
    console.log(`  TeklifVer hazır: http://localhost:${PORT}`);
  });

  // Barındırma servisi yeniden başlatırken açık istekler yarıda kesilmesin.
  if (isProduction) {
    process.once('SIGTERM', () => {
      server.close(() => closeDatabase().finally(() => process.exit(0)));
      setTimeout(() => process.exit(0), 10000).unref();
    });
  }
}

// Canlıda güvensiz bir ayarla açılmayı engeller, eksik özellikleri günlüğe yazar.
function checkProductionSettings() {
  const secret = process.env.SESSION_SECRET;
  if (secret.length < 32 || secret === 'buraya-uzun-ve-rastgele-bir-metin-yazin') {
    throw new Error('SESSION_SECRET en az 32 karakter uzunluğunda rastgele bir metin olmalı.');
  }
  if (!process.env.SITE_URL) console.warn('  Uyarı: SITE_URL tanımlı değil; paylaşım ve sosyal giriş adresleri istekteki alan adından üretilir.');
  if (!process.env.SMTP_HOST) console.warn('  Uyarı: SMTP tanımlı değil; şifre sıfırlama e-postaları gönderilemez.');
  if (!process.env.SITE_EMAIL) console.warn('  Uyarı: SITE_EMAIL tanımlı değil; iletişim formu çalışmaz.');
  if (!visibleProviders().length) console.warn('  Uyarı: Sosyal giriş anahtarı tanımlı değil; butonlar gizlendi.');
}

start().catch(err => {
  console.error('Sunucu başlatılamadı:', err.message);
  process.exit(1);
});
