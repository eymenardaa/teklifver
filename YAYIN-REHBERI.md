# TeklifVer Yayın Rehberi

Site iki ücretsiz servisle yayına alınabilir: **MongoDB Atlas** (veritabanı) ve **Render** (sunucu). Hesapları ve şifreleri siz oluşturursunuz. Şifre ve anahtarları koda veya GitHub'a yazmayın; yalnızca bu servislerin panellerine girin.

## 1. Veritabanı: MongoDB Atlas

1. [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas/register) adresinden hesap açın.
2. **Free** paketle bir cluster oluşturun. Bölge olarak Avrupa seçin (ör. Frankfurt).
3. **Database Access**: bir kullanıcı ve güçlü bir şifre oluşturun.
4. **Network Access**: `0.0.0.0/0` ekleyin. Render'ın ücretsiz paketinde sabit IP olmadığı için gereklidir; bu yüzden şifrenin güçlü olması önemlidir.
5. **Connect → Drivers** bölümünden bağlantı adresini kopyalayın. `<password>` yerine şifreyi yazın ve `.net/` sonrasına veritabanı adını ekleyin:

```
mongodb+srv://kullanici:sifre@cluster0.xxxxx.mongodb.net/teklifver?retryWrites=true&w=majority
```

## 2. Sunucu: Render

1. [render.com](https://render.com) adresinde GitHub hesabınızla oturum açın.
2. **New → Blueprint** seçin, `sswird/teklifver` deposunu bağlayın. `render.yaml` otomatik okunur.
3. İstenen değerleri girin:

| Ayar | Değer |
| --- | --- |
| `MONGODB_URI` | 1. adımdaki bağlantı adresi |
| `SITE_COMPANY` | Yasal sayfalarda görünecek şirket veya kişi adı |
| `SITE_EMAIL` | İletişim adresi. Yasal sayfalarda herkese görünür, iletişim formu buraya yazar |

4. **Apply** deyin. Kurulum bitince site `https://teklifver.onrender.com` benzeri bir adreste açılır.
5. Kontrol edin: adresin sonuna `/healthz` ekleyince `{"status":"ok"}` görünmelidir.

`NODE_ENV=production` ve rastgele `SESSION_SECRET` otomatik ayarlanır. Bu modda örnek veriler ve örnek hesaplar (`demo1234`) oluşmaz, site boş başlar.

## 3. Yönetici hesabı

Sıra önemlidir, çünkü sitede e-posta doğrulaması yoktur:

1. Önce siteye kendi e-postanızla **kayıt olun**.
2. Sonra Render'da **Environment** sekmesine `ADMIN_EMAIL` olarak aynı adresi ekleyin. Servis yeniden başlar, panel `/admin` adresinde açılır.

Ayarı kayıttan önce yaparsanız, o adresi önce kaydeden kişi yönetici olur.

## 4. Şifre sıfırlama ve iletişim e-postaları

Bir SMTP servisinden aldığınız bilgileri **Environment** sekmesine ekleyin: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.

Bu ayar olmadan şifre sıfırlama e-postası gitmez ve iletişim formu "kullanılamıyor" der.

## 5. Google, Facebook ve Microsoft ile giriş

Önce sitenin kalıcı adresini belirleyin ve **Environment** sekmesine `SITE_URL` olarak ekleyin (ör. `https://teklifver.onrender.com`, sonda `/` olmadan). Yönlendirme adresleri buna göre oluşur.

| Sağlayıcı | Nereden | Yönlendirme adresi | Render ayarları |
| --- | --- | --- | --- |
| Google | [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → OAuth istemci kimliği (Web) | `SITE_URL/auth/google/callback` | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| Facebook | [Meta for Developers](https://developers.facebook.com/apps) → Facebook Login | `SITE_URL/auth/facebook/callback` | `FACEBOOK_CLIENT_ID`, `FACEBOOK_CLIENT_SECRET` |
| Microsoft | [Azure App registrations](https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps) → yalnızca kişisel Microsoft hesapları | `SITE_URL/auth/microsoft/callback` | `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` |

Sağlayıcılar genellikle gizlilik politikası adresi ister: `SITE_URL/gizlilik`. Herkese açmadan önce Google ve Facebook'ta uygulamayı yayın moduna almanız gerekebilir. Anahtarı eklenen sağlayıcının butonu kendiliğinden görünür.

## 6. Kendi alan adınız (isteğe bağlı)

Render'da **Settings → Custom Domains** bölümünden ekleyin, DNS kayıtlarını alan adı firmanızda girin. Sonra `SITE_URL` değerini ve sağlayıcılardaki yönlendirme adreslerini yeni adresle güncelleyin.

## Gerçek kullanıcı almadan önce

- [ ] **Yasal metinler:** Kullanım koşulları, KVKK ve çerez metinleri taslaktır. Bir hukukçuya kontrol ettirin, sayfalardaki taslak uyarısını kaldırın.
- [ ] **Sunucu paketi:** Render ücretsiz paketi 15 dakika ziyaret olmazsa uyur, sonraki açılış yavaş olur ve Render bu paketi canlı kullanım için önermez. Gerçek kullanıcıda ücretli pakete geçin.
- [ ] **Depolama:** Fotoğraflar veritabanında durur. Her biri en çok 5 MB olduğundan Atlas'ın ücretsiz alanı hızla dolabilir; kullanımı Atlas panelinden izleyin.
- [ ] **Yedekleme:** Atlas'ın ücretsiz paketindeki yedekleme seçeneklerini kontrol edin, gerekiyorsa düzenli yedek alın.

## Güncelleme

`main` dalına gönderilen her değişiklik Render'da otomatik yayınlanır. Önizleme (GitHub Pages) ayrıdır, `npm run pages:build` ve `npm run pages:deploy` ile güncellenir.
