// Yapay Zekâ ve Akıllı Asistan Yardımcı Modülü

// Kategoriye göre tahmini metrekare ve birim fiyat çarpanları
const CATEGORY_ESTIMATES = {
  'Boya & Badana': { min: 6000, max: 14000, unit: 'daire/oda başına' },
  'Evden Eve Nakliyat': { min: 8000, max: 22000, unit: 'mesafeye ve oda sayısına göre' },
  'Temizlik': { min: 1500, max: 4500, unit: 'günlük/seanslık' },
  'Tadilat & Dekorasyon': { min: 25000, max: 120000, unit: 'kapsama göre' },
  'Elektrik & Tesisat': { min: 1000, max: 5000, unit: 'iş başına' },
  'Mobilya & Marangoz': { min: 3000, max: 18000, unit: 'ölçüye göre' },
  'Yazılım & Web Tasarım': { min: 15000, max: 65000, unit: 'projeye göre' },
  'Grafik Tasarım & Logo': { min: 2000, max: 9000, unit: 'tasarım başına' },
  'Fotoğraf & Video': { min: 4000, max: 16000, unit: 'çekim başına' },
  'Özel Ders': { min: 500, max: 1500, unit: 'saatlik' }
};

// Akıllı Fiyat Tahmini Algoritması
function getAiPriceEstimate(category, description = '') {
  const base = CATEGORY_ESTIMATES[category] || { min: 3000, max: 15000, unit: 'ortalama' };
  let multiplier = 1;

  const desc = description.toLowerCase();
  if (desc.includes('acil') || desc.includes('hemen')) multiplier *= 1.15;
  if (desc.includes('büyük') || desc.includes('villa') || desc.includes('3+1') || desc.includes('4+1')) multiplier *= 1.3;
  if (desc.includes('küçük') || desc.includes('1+1') || desc.includes('parça') || desc.includes('tek oda')) multiplier *= 0.75;
  if (desc.includes('lüks') || desc.includes('özel') || desc.includes('kaliteli')) multiplier *= 1.25;

  const min = Math.round((base.min * multiplier) / 100) * 100;
  const max = Math.round((base.max * multiplier) / 100) * 100;

  return {
    min,
    max,
    unit: base.unit,
    confidence: '%92 Güven Aralığı',
    text: `Piyasa verileri ve benzer taleplere göre tahmini aralık: ${min.toLocaleString('tr-TR')} ₺ - ${max.toLocaleString('tr-TR')} ₺`
  };
}

// Yapay Zekâ İlan Geliştirici (Prompt-based structuring)
function generateAiEnhancedDescription(category, shortText) {
  const text = (shortText || '').trim();
  let enhancement = '';

  switch (category) {
    case 'Boya & Badana':
      enhancement = `
📌 [Yapay Zekâ Detay Taslağı]
- Talep Özeti: ${text || 'Belirtilmedi'}
- Tahmini Alan: Yaklaşık 100-120 m² (veya belirtiniz)
- Duvar Durumu: Alçı / zımpara ve küçük çatlak tamiratları gerekebilir.
- Malzeme: Boya tarafımdan temin edilecek / Firma getirsin (Lütfen seçiniz).
- Çalışma Takvimi: Hafta içi / Hafta sonu gündüz saatleri.
- Ek İstekler: Tavan boyası ve süpürgelik detayları dahil.`;
      break;

    case 'Evden Eve Nakliyat':
      enhancement = `
📌 [Yapay Zekâ Detay Taslağı]
- Talep Özeti: ${text || 'Belirtilmedi'}
- Oda Tipi: 2+1 / 3+1 daire eşyası.
- Kat Durumu: Çıkış Katı: 2 (Asansör var/yok) ➔ Varış Katı: 3 (Asansör var/yok).
- Paketleme: Kırılacak eşyalar ve mobilya demonte/monte firma tarafından yapılacak.
- Tarih Esnekliği: 2-3 gün esneklik payı vardır.`;
      break;

    case 'Tadilat & Dekorasyon':
      enhancement = `
📌 [Yapay Zekâ Detay Taslağı]
- Talep Özeti: ${text || 'Belirtilmedi'}
- Yapılacak İşler: Kırma/dökme, fayans, sıhhi tesisat ve aydınlatma yenileme.
- Malzeme Seçimi: Bütçeye göre birlikte seçilecek veya işçilik teklifi isteniyor.
- Süre: Başladıktan sonra en geç 2-3 hafta içinde tamamlanması hedefleniyor.`;
      break;

    case 'Yazılım & Web Tasarım':
      enhancement = `
📌 [Yapay Zekâ Detay Taslağı]
- Talep Özeti: ${text || 'Belirtilmedi'}
- Platform: Mobil uyumlu modern web sitesi / panel.
- Özellikler: Kullanıcı kaydı, dinamik yönetim paneli, arama ve filtreleme.
- Tasarım: Modern, sade ve kurumsal renklerle uyumlu arayüz.
- Destek: Teslim sonrası 1 aylık teknik destek beklentisi bulunmaktadır.`;
      break;

    default:
      enhancement = `
📌 [Yapay Zekâ Detay Taslağı]
- Talep Özeti: ${text || 'Hizmet talebi detayı'}
- Beklenti: İşin uzmanı, referanslı ve fatura kesebilen firmalar önceliklidir.
- Zamanlama: Mümkün olan en kısa sürede başlanması tercih edilir.
- Malzeme & Ekipman: Tüm gerekli araç ve gereçlerin firma tarafından sağlanması beklenmektedir.`;
  }

  return enhancement.trim();
}

module.exports = { getAiPriceEstimate, generateAiEnhancedDescription };
