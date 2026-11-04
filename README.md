# TeklifVer

Hizmet talebi verip firmalardan teklif alınan ilan sitesi. Node.js, Express, EJS ve MongoDB ile yazılmıştır.

## Kurulum

```bash
npm install
npm start
```

Tarayıcıda **http://localhost:3000** adresini açın. Geliştirme sırasında otomatik yenileme için `npm run dev` kullanılabilir.

### Veritabanı

`.env` içindeki `MONGODB_URI` adresine bağlanılır. Geliştirme ortamında bu adrese ulaşılamazsa proje, verileri `.data/mongo` klasöründe saklayan gömülü bir MongoDB başlatır; ayrıca MongoDB kurmak gerekmez. İlk çalıştırmada MongoDB bir kez indirilir.

Windows'ta gömülü MongoDB için Microsoft Visual C++ Runtime gerekir. Eksikse sunucu bunu söyler, kurmak için:

```bash
winget install --id Microsoft.VCRedist.2015+.x64
```

Canlı ortamda (`NODE_ENV=production`) gömülü veritabanı kullanılmaz; `MONGODB_URI` zorunludur.

### Ortam değişkenleri

Tüm ayarların örneği `.env.example` dosyasındadır.

| Değişken | Açıklama |
| --- | --- |
| `PORT` | Sunucu portu (varsayılan 3000) |
| `MONGODB_URI` | MongoDB bağlantı adresi |
| `SESSION_SECRET` | Oturum çerezlerini imzalayan uzun, rastgele bir metin |
| `DEMO_DATA` | `false` yazılırsa örnek veriler eklenmez |
| `SITE_COMPANY`, `SITE_EMAIL` | Yasal ve reklam sayfalarında görünen bilgiler |
| `SITE_URL` | Paylaşım bağlantıları ve site haritası için alan adı |
| `ADMIN_EMAIL` | Bu e-postayla kayıtlı hesap, sunucu açılışında yönetici yapılır |
| `SMTP_*` | Şifre sıfırlama e-postaları. Boşsa geliştirmede bağlantı sunucu günlüğüne yazılır |

### Google, Facebook ve Microsoft ile giriş

Her sağlayıcıda uygulama oluşturup aldığınız anahtarları `.env` dosyasına yazın (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` vb.) ve sunucuyu yeniden başlatın.

| Sağlayıcı | Nereden alınır | Yönlendirme adresi |
| --- | --- | --- |
| Google | [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → OAuth istemci kimliği | `SITE_URL/auth/google/callback` |
| Facebook | [Meta for Developers](https://developers.facebook.com/apps) → Facebook Login | `SITE_URL/auth/facebook/callback` |
| Microsoft | [Azure App registrations](https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps) → yalnızca kişisel hesaplar | `SITE_URL/auth/microsoft/callback` |

Geliştirmede `SITE_URL` boşsa adres `http://localhost:3000/...` olur. Anahtarı olmayan sağlayıcının butonu geliştirmede görünür ve tıklanınca uyarı verir, canlıda hiç görünmez.

## Örnek veriler

Geliştirme ortamında veritabanında hiç talep yoksa sunucu açılışta örnek firmalar, talepler, teklifler, mesajlar ve yorumlar ekler. Giriş sayfasındaki **Müşteri**, **Firma** ve **Yönetici hesabı** butonlarıyla tek tıkla girilir. Canlı ortamda örnek veri eklenmez ve bu butonlar görünmez.

Örnek verileri kaldırmak için sunucuyu durdurup `.env` dosyasına `DEMO_DATA=false` yazın, ardından:

```bash
npm run demo:sil
```

Örnek talep fotoğrafları [Unsplash](https://unsplash.com) kaynaklıdır ve `public/img/ilan` klasöründedir.

## GitHub Pages önizlemesi

GitHub Pages sunucu çalıştıramadığı için orada sitenin statik bir önizlemesi yayınlanır: https://sswird.github.io/teklifver/

Talepler, firmalar, arama ve filtreler çalışır. Üyelik, talep verme, teklif ve mesajlaşma kapalıdır. Önizleme boş, geçici bir veritabanındaki örnek verilerden üretilir; gerçek veritabanı ve `.env` kullanılmaz. Tarihler üretildiği anda sabitlenir.

```bash
npm run pages:build
npm run pages:deploy
```

Yeni özelliklerin tam çalışması için sitenin Node.js ve MongoDB destekleyen bir sunucuda çalışması gerekir.

## Özellikler

**Talepler**
- Kategori ağacı ve talep sayıları, vitrin, son eklenenler, son tarihi yaklaşanlar
- Kelime veya talep numarasıyla arama, yazarken arama önerileri
- İl, bütçe, tarih, fotoğraflı ve teklif almamış filtreleri; liste ve galeri görünümü
- Favoriler, kayıtlı aramalar ve yeni sonuç sayısı
- Son gezilen talepler (çerez onayıyla)
- Süresi dolan talepler listeden çıkar, teklif almaz
- Paylaşım (WhatsApp, X, e-posta), yazdırma, şikayet etme
- Kategoride ortalama teklif bilgisi

**Müşteri**
- Fotoğraflı talep verme, düzenleme, kapatma, silme ve yeniden yayınlama
- Kategoriye göre yardımcı sorular, yarım kalan talep taslağının saklanması (çerez onayıyla)
- Teklifleri fiyat, süre ve puana göre sıralama, kabul etme ve reddetme
- İşi tamamlama, firmayı puanlama ve yorum yazma

**Firma**
- Teklif verme, düzenleme ve geri çekme
- Hizmet kategorileri seçme, bu kategorilerdeki yeni taleplerde bildirim, "Size Uygun Talepler"
- Logo, tanıtım, hizmetler, yorumlar, kabul oranı ve aldığı işlerle firma sayfası
- Firma rehberinde kategori, il, puan ve onay filtreleri

**Mesajlaşma ve bildirimler**
- Firma, açık talebin sahibine yazabilir; talep sahibi, teklif veren firmaya yazabilir
- Gelen kutusu, okunmamış sayısı, sayfa açıkken yeni mesajlar, hazır yanıtlar
- Yeni teklif, kabul, ret, mesaj ve uygun talep bildirimleri

**Hesap**
- Kayıt, giriş ve çıkış; bireysel ve firma hesapları; koşul onayı
- Google, Facebook ve Microsoft ile giriş; hesap bağlama ve bağlantı kaldırma
- Profil doluluk göstergesi
- "Oturumum açık kalsın" (30 gün), şifre değiştirme, şifremi unuttum
- Verilerimi indirme ve hesabı silme
- Şifreler bcrypt ile saklanır; hatalı giriş denemeleri sınırlandırılır
- Teklif kabul edildiğinde iki taraf birbirinin iletişim bilgilerini görür

**Yönetim paneli** (`/admin`)
- Site istatistikleri, şikayetleri inceleme
- Talep kaldırma ve geri alma
- Kullanıcı arama, askıya alma, firma onaylama (rozet)

**Reklam, yasal ve teknik**
- Üst, yan ve liste içi reklam alanları; reklamlar `config/ads.js` dosyasından yönetilir
- Açılışta çerez onayı: tümünü kabul et, reddet veya tek tek seç
- Yardım, iletişim formu, reklam, kullanım koşulları, KVKK ve çerez politikası sayfaları (`views/pages`)
- Tüm kategoriler, 81 il ve teklif verilerinden hesaplanan fiyat rehberi sayfaları
- Site haritası, robots.txt, paylaşım etiketleri
- Güvenlik başlıkları (CSP), gzip sıkıştırma

Yasal metinler taslaktır. Yayına almadan önce bir hukukçuya kontrol ettirin, sayfalardaki taslak uyarısını kaldırın.

## Proje yapısı

```
config/       Kategoriler, iller, reklamlar, veritabanı, örnek veriler
lib/          İkon, biçimlendirme, form, filtre, bildirim, e-posta yardımcıları
middleware/   Yetkilendirme, görsel yükleme
models/       User, Request, Bid, Message, Notification, Review, Report, SavedSearch
routes/       home, pages, auth, requests, companies, messages, notifications, bids, dashboard, admin
scripts/      Örnek verileri silme aracı
views/        EJS şablonları
public/       CSS, JavaScript, fotoğraflar, favicon
uploads/      Yüklenen görseller
```

## İkonlar

İkonlar [Lucide](https://lucide.dev) kaynaklıdır. Şablonda `<%- icon('search', { size: 16 }) %>` yazmak yeterlidir; ikon adları lucide.dev üzerindeki adlarla aynıdır.
