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
| `DEMO_DATA` | `false`: örnek veri eklenmez. `showcase`: canlıda girilemeyen hesaplarla dolu vitrin |
| `SITE_COMPANY`, `SITE_EMAIL` | Yasal ve reklam sayfalarında görünen bilgiler |
| `SITE_URL` | Sitenin adresi. E-posta, paylaşım ve sosyal giriş bağlantıları bununla üretilir. Canlıda zorunlu (Render adresi otomatik alınır) |
| `ADMIN_EMAIL` | Bu e-postayla kayıtlı hesap, sunucu açılışında yönetici yapılır |
| `SMTP_*` | E-posta doğrulama, şifre sıfırlama ve bildirim e-postaları. Boşsa geliştirmede bağlantı sunucu günlüğüne yazılır |
| `REQUIRE_EMAIL_VERIFICATION` | SMTP varken doğrulama zorunludur; `true` veya `false` ile değiştirilir |
| `RATE_LIMIT_PER_MINUTE` | Tek IP'den dakikada kabul edilen istek (varsayılan 600) |
| `TRUST_PROXY_HOPS` | Canlıda önündeki vekil sunucu sayısı (varsayılan 1) |

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

Örnek verileri kaldırmak için Yönetim Panelindeki **Örnek Verileri Sil** düğmesini kullanın veya sunucuyu durdurup şunu çalıştırın. Silinen veriler bir daha eklenmez.

```bash
npm run demo:sil
```

## Testler

```bash
npm test
```

Her takım boş bir geçici veritabanıyla çalışır; gerçek veritabanına, `.env` dosyasına ve dışarıya dokunmaz. E-postalar sahte bir SMTP sunucusuna, sosyal giriş sahte bir sağlayıcıya gider. Tek takım için: `node test/run.js email`. Testler her gönderimde GitHub Actions'ta da çalışır.

Örnek talep fotoğrafları [Unsplash](https://unsplash.com) kaynaklıdır ve `public/img/ilan` klasöründedir.

## GitHub Pages önizlemesi

GitHub Pages sunucu çalıştıramadığı için orada sitenin statik bir önizlemesi yayınlanır: https://sswird.github.io/teklifver/

Talepler, firmalar, arama ve filtreler çalışır. Üyelik, talep verme, teklif ve mesajlaşma kapalıdır. Önizleme boş, geçici bir veritabanındaki örnek verilerden üretilir; gerçek veritabanı ve `.env` kullanılmaz. Tarihler üretildiği anda sabitlenir.

```bash
npm run pages:build
npm run pages:deploy
```

Tam çalışan sürüm için sitenin Node.js ve MongoDB destekleyen bir sunucuda çalışması gerekir. Adımlar: [YAYIN-REHBERI.md](YAYIN-REHBERI.md)

## Özellikler

**Talepler**
- Kategori ağacı ve talep sayıları, vitrin, son eklenenler, son tarihi yaklaşanlar
- Kelime veya talep numarasıyla arama, yazarken arama önerileri
- İl, bütçe, tarih, fotoğraflı ve teklif almamış filtreleri; liste ve galeri görünümü
- Favoriler, kayıtlı aramalar, yeni sonuç sayısı ve yeni talep bildirimi
- Son gezilen talepler (çerez onayıyla)
- Süresi dolan talepler listeden çıkar, teklif almaz
- Paylaşım (WhatsApp, X, e-posta), yazdırma, şikayet etme
- Kategoride ortalama teklif bilgisi

**Müşteri**
- Fotoğraflı talep verme, düzenleme, kapatma, silme ve yeniden yayınlama
- Kategoriye göre yardımcı sorular, yarım kalan talep taslağının saklanması (çerez onayıyla)
- Teklifleri fiyat, süre ve puana göre sıralama, kabul etme ve reddetme
- Anlaşmayı iptal etme: talep yeniden açılır, elenen teklifler tekrar değerlendirmeye girer
- Firma sayfasından firmayı talebe davet etme
- İşi tamamlama, firmayı puanlama ve yorum yazma (sonradan da yazılabilir)

**Firma**
- Teklif verme, düzenleme ve geri çekme; alınan işi bırakma
- Teklif tutarları rakip firmalara görünmez
- İş örneği fotoğrafları, yorumlara cevap verme
- Hizmet kategorileri seçme, bu kategorilerdeki yeni taleplerde bildirim, "Size Uygun Talepler"
- Logo, tanıtım, hizmetler, yorumlar, kabul oranı ve aldığı işlerle firma sayfası
- Firma rehberinde kategori, il, puan ve onay filtreleri, sayfalama

**Mesajlaşma ve bildirimler**
- Firma, açık talebin sahibine yazabilir; talep sahibi, teklif veren firmaya yazabilir
- Gelen kutusu, okunmamış sayısı, sayfa açıkken yeni mesajlar, hazır yanıtlar
- Yeni teklif, kabul, ret, mesaj ve uygun talep bildirimleri
- Bildirimler e-postayla da gider, tür tür kapatılabilir; okunmamış sayısı sayfa yenilenmeden güncellenir

**Hesap**
- Kayıt, giriş ve çıkış; bireysel ve firma hesapları; koşul onayı
- E-posta doğrulama, e-posta değiştirme, diğer cihazlardan çıkış
- Google, Facebook ve Microsoft ile giriş; hesap bağlama ve bağlantı kaldırma
- Profil doluluk göstergesi
- "Oturumum açık kalsın" (30 gün), şifre değiştirme, şifremi unuttum
- Verilerimi indirme ve hesabı silme
- Şifreler bcrypt ile saklanır; hatalı giriş denemeleri sınırlandırılır, şifre değişince eski oturumlar kapanır
- Herkese açık sayfalarda soyad kısaltılır
- Teklif kabul edildiğinde iki taraf birbirinin iletişim bilgilerini görür

**Yönetim paneli** (`/admin`)
- Site istatistikleri, şikayetleri inceleme
- Talep kaldırma ve geri alma
- Kullanıcı arama, askıya alma, firma onaylama (rozet)
- Yorumları gizleme, firma şikayetleri, iletişim mesajları
- Reklam ekleme, zamanlama, gösterim ve tıklama sayıları
- Örnek verileri tek düğmeyle silme

**Reklam, yasal ve teknik**
- Üst, yan ve liste içi reklam alanları; reklamlar panelden, sitenin kendi tanıtımları `config/ads.js` dosyasından yönetilir
- Açılışta çerez onayı: tümünü kabul et, reddet veya tek tek seç
- Hakkımızda, firmalar için, güvenli hizmet rehberi, veri silme, yardım, iletişim formu, reklam, kullanım koşulları, KVKK ve çerez politikası sayfaları (`views/pages`)
- Tüm kategoriler, 81 il ve teklif verilerinden hesaplanan fiyat rehberi sayfaları
- Site haritası, robots.txt, paylaşım etiketleri, yapısal veri (JSON-LD), canonical adresler, uygulama simgeleri
- Küçük ekranda alt menü
- Siyah ve beyaz tema: ilk girişte cihazın ayarı izlenir, seçim tarayıcıda saklanır, yazdırma her zaman beyazdır
- Güvenlik başlıkları (CSP), gzip sıkıştırma, başka sitelerden form gönderimine karşı koruma, istek sınırları
- Yüklenen görseller doğrulanır, küçültülür, konum bilgisi silinir ve veritabanında (GridFS) saklanır; sunucu yeniden başlasa da kaybolmaz
- Sağlık kontrolü (`/healthz`), Render kurulum dosyası (`render.yaml`)

Yasal metinler taslaktır. Yayına almadan önce bir hukukçuya kontrol ettirin, sayfalardaki taslak uyarısını kaldırın.

## Proje yapısı

```
config/       Kategoriler, iller, reklamlar, veritabanı, örnek veriler
lib/          İkon, biçimlendirme, form, filtre, bildirim, e-posta yardımcıları
middleware/   Yetkilendirme, görsel yükleme
models/       User, Request, Bid, Message, Notification, Review, Report, CompanyReport, SavedSearch, ContactMessage, Ad
routes/       home, pages, auth, oauth, email, requests, companies, messages, notifications, bids, dashboard, admin
scripts/      Örnek veri silme, küçük görsel üretme, GitHub Pages önizlemesi
test/         Testler (npm test)
views/        EJS şablonları
public/       CSS, JavaScript, fotoğraflar, favicon
```

## İkonlar

İkonlar [Lucide](https://lucide.dev) kaynaklıdır. Şablonda `<%- icon('search', { size: 16 }) %>` yazmak yeterlidir; ikon adları lucide.dev üzerindeki adlarla aynıdır.
