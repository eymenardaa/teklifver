# TeklifVer Yayın Rehberi

Site iki servisle yayına alınabilir: **MongoDB Atlas** (veritabanı) ve **Render** (sunucu). Hesapları ve şifreleri siz oluşturursunuz. Şifre ve anahtarları koda veya GitHub'a yazmayın; yalnızca bu servislerin panellerine girin.

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
| `SITE_EMAIL` | İletişim adresi. Yasal sayfalarda herkese görünür, iletişim formu mesajları da buraya gelir |

4. **Apply** deyin. Kurulum bitince site `https://teklifver.onrender.com` benzeri bir adreste açılır.
5. Kontrol edin: adresin sonuna `/healthz` ekleyince `{"status":"ok"}` görünmelidir.

`NODE_ENV=production` ve rastgele `SESSION_SECRET` otomatik ayarlanır. Render'ın verdiği adres otomatik kullanılır; kendi alan adınızda `SITE_URL` zorunludur.

### Site boş mu başlasın, dolu mu?

Canlıda varsayılan olarak örnek veri yoktur, site boş başlar. Tanıtım için dolu görünmesini isterseniz **Environment** sekmesine `DEMO_DATA=showcase` ekleyin:

- Örnek talepler, firmalar ve yorumlar görünür, altta "örnek veridir" uyarısı çıkar.
- Örnek hesapların şifresi rastgele üretilir, kimse giremez.
- Gerçek kullanıcılar gelmeye başlayınca **Yönetim Paneli → Örnek Verileri Sil** düğmesiyle tek seferde silinir, bir daha gelmez. Gerçek kullanıcıların verileri silinmez.

## 3. E-posta (SMTP)

Bir SMTP servisinden aldığınız bilgileri **Environment** sekmesine ekleyin: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.

SMTP eklenince şunlar kendiliğinden çalışır:

- **E-posta doğrulama:** Yeni üyeler bağlantıyı açmadan talep, teklif ve mesaj gönderemez.
- **Şifre sıfırlama** ve **e-posta değiştirme**
- **Bildirim e-postaları:** Yeni teklif, kabul, mesaj, uygun talep, kayıtlı arama. Kullanıcılar Hesap Bilgilerim sayfasından kapatabilir.

SMTP yoksa site yine çalışır: doğrulama istenmez, bildirimler yalnızca site içinde görünür, şifre sıfırlama "kapalı" uyarısı verir, iletişim mesajları yönetim panelinde okunur.

## 4. Yönetici hesabı

1. Önce siteye kendi e-postanızla **kayıt olun**. SMTP eklediyseniz gelen bağlantıyla adresinizi doğrulayın.
2. Sonra **Environment** sekmesine `ADMIN_EMAIL` olarak aynı adresi ekleyin. Servis yeniden başlar, panel `/admin` adresinde açılır.

SMTP varken doğrulanmamış hesap yönetici olamaz. **SMTP yoksa bu koruma çalışmaz:** o adresi önce kaydeden kişi yönetici olur, bu yüzden önce kendiniz kayıt olun.

Panelde talepler, kullanıcılar, yorumlar, iletişim mesajları, şikayetler ve reklamlar yönetilir.

### İstek sınırlarını kontrol edin

Panelin **Sunucu Kontrolü** bölümünde sitenin gördüğü IP adresiniz yazar. Bunu [kendi IP'nizle](https://www.whatismyip.com/) karşılaştırın. Farklıysa sunucunun önünde birden fazla vekil sunucu vardır ve hatalı giriş sınırları tüm ziyaretçileri tek kişi sayar. Render'ın vekil sayısı belgelerinde net değil; **Environment** sekmesine `TRUST_PROXY_HOPS` ekleyip 2, 3 diye artırın, IP adresiniz doğru görünene kadar deneyin.

## 5. Google, Facebook ve Microsoft ile giriş

| Sağlayıcı | Nereden | Yönlendirme adresi | Render ayarları |
| --- | --- | --- | --- |
| Google | [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → OAuth istemci kimliği (Web) | `SITE_URL/auth/google/callback` | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| Facebook | [Meta for Developers](https://developers.facebook.com/apps) → Facebook Login | `SITE_URL/auth/facebook/callback` | `FACEBOOK_CLIENT_ID`, `FACEBOOK_CLIENT_SECRET` |
| Microsoft | [Azure App registrations](https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps) → yalnızca kişisel Microsoft hesapları | `SITE_URL/auth/microsoft/callback` | `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` |

`SITE_URL` burada sitenizin adresidir (ör. `https://teklifver.onrender.com`). Sağlayıcıların istediği sayfalar hazırdır:

- Gizlilik politikası: `SITE_URL/gizlilik`
- Kullanım koşulları: `SITE_URL/kullanim-kosullari`
- Veri silme (Meta ister): `SITE_URL/veri-silme`

Herkese açmadan önce Google ve Facebook'ta uygulamayı yayın moduna almanız gerekebilir. Anahtarı eklenen sağlayıcının butonu kendiliğinden görünür.

## 6. Kendi alan adınız (isteğe bağlı)

Render'da **Settings → Custom Domains** bölümünden ekleyin, DNS kayıtlarını alan adı firmanızda girin. Sonra **Environment** sekmesine `SITE_URL` olarak yeni adresi yazın (sonda `/` olmadan) ve sağlayıcılardaki yönlendirme adreslerini güncelleyin.

## Gerçek kullanıcı almadan önce

- [ ] **Yasal metinler:** Kullanım koşulları, KVKK ve çerez metinleri taslaktır. Bir hukukçuya kontrol ettirin, sayfalardaki taslak uyarısını kaldırın.
- [ ] **Sunucu paketi:** Render ücretsiz paketi 15 dakika ziyaret olmazsa uyur, sonraki açılış yavaş olur ve Render bu paketi canlı kullanım için önermez. Gerçek kullanıcıda ücretli pakete geçin.
- [ ] **Depolama:** Fotoğraflar küçültülüp veritabanında saklanır. Atlas kullanımını panelinden izleyin.
- [ ] **Yedekleme:** Atlas'ın paketinizdeki yedekleme seçeneklerini kontrol edin, gerekiyorsa düzenli yedek alın.

## Güncelleme

`main` dalına gönderilen her değişiklik Render'da otomatik yayınlanır ve GitHub Actions'ta testlerden geçer. Önizleme (GitHub Pages) ayrıdır, `npm run pages:build` ve `npm run pages:deploy` ile güncellenir.
