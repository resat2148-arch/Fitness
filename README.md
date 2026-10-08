# Gym Tycoon 3D

İzometrik 3D spor salonu işletme oyunu. Boş bir dükkândan başlayıp salonunu gün gün büyütürsün: ekipman alır, personel işe alır, fiyatları belirler, üyelerini mutlu eder ve arsanı genişletirsin.

Three.js ile yazıldı. Dışarıdan hiçbir model, doku ya da ses dosyası yüklenmiyor; hepsi kodla üretiliyor. Bu yüzden oyun tek bir HTML dosyası olarak da çalışabiliyor.

## Çalıştırma

```bash
npm install
npm run dev          # geliştirme sunucusu (http://localhost:5173)
npm run build        # dist/ klasörü (CrazyGames'e zip olarak yüklenebilir)
npm run build:single # dist/gym-tycoon.html: her şey gömülü tek dosya
```

Hata ayıklama için adresin sonuna `?debug` eklersen `window.G` üzerinden oyun durumuna erişebilirsin.

## Oynanış

- **Gün döngüsü:** Salon her gün 06:00–23:00 arası açık. Gün sonunda gelir/gider, yeni ve kaybedilen üyeler, şikayetler ve yorumlarla bir rapor gelir.
- **Müşteriler:** Her müşterinin bir hedefi (kilo vermek, kas yapmak, kondisyon, esneklik, dövüş) ve buna göre bir antrenman planı var. Resepsiyonda giriş yapar, soyunma dolabına uğrar, aletleri sırayla kullanır, susar, tuvalete gider, terler, duş alır, otomattan bir şey alır ve çıkar.
- **Memnuniyet:** Bekleme süresi, eksik alet, kir, sıcaklık, kalabalık, atmosfer, bozuk aletler, antrenör desteği ve fiyat algısı memnuniyeti belirler. Müşterilerin başındaki baloncuklar o anki sorunu gösterir, sol alttaki panel de günün en büyük şikayetlerini çözüm önerisiyle listeler.
- **Üyelik ekonomisi:** Günlük ziyaretçiler memnun kalırsa üye olur ve bir kerelik kayıt ücreti öder. Üyelik aylıktır ve 30 günde bir yenilenir; memnuniyetsiz ya da pahalı bulan üye ayrılır. Fiyatı salonun "adil değerine" göre ayarlaman gerekir.
- **Soyunma odaları:** Erkek ve kadın soyunma odaları ayrı, duvarlı ve kapılı odalar. Her birinde 3 dolap yeri, bir duş ve bir tuvalet var. Müşteri kapıdan girip kendi cinsiyetinin odasını kullanır; kameraya bakan duvarlar içerisi görünsün diye alçalır.
- **Grup dersleri:** Grup Dersi Stüdyosu (5×4, 7 kişilik) 3. seviyede açılır. Stüdyoya tıklayıp 6 saat diliminin her birine Zumba, Pilates, Yoga, HIIT veya Kick Boks atayabilirsin. Dersleri Grup Eğitmeni verir; eğitmen yoksa ders iptal olur. Bazı üyeler belirli bir dersin hayranıdır ve o dersin saatine göre gelir. Derse katılan çok memnun kalır; ders dolu, iptal ya da hiç yoksa şikayet eder.
- **Alet istatistikleri:** İstatistik panelinde aletler bugün / son 7 gün / tüm zamanlar için kullanım sayısına göre sıralanır. Panel; kullanım payını, alet başına kullanımı, kaç müşterinin beklemek zorunda kaldığını ve aranıp bulunamayan alet türlerini gösterir, "bir tane daha al" ya da "az kullanılıyor" uyarısı verir. Kullanım haritası yoğun aletleri salonda kırmızıyla işaretler.
- **Gerçekçi giderler:** m² başına kira, maaşlar, kullanılan aletlere göre elektrik (kWh), duş ve tuvalet için su, kredi taksitleri.
- **Isı:** Dış sıcaklık mevsime ve saate göre değişir; içerideki kalabalık salonu ısıtır. Yazın vantilatör veya klima gerekir.
- **Bakım:** Aletler kullanıldıkça yıpranır ve bozulabilir. Teknisyen tamir eder; istersen ücretli servis de çağırabilirsin. Temizlikçi zemini, duşları ve tuvaletleri temizler.
- **Personel:** Resepsiyonist, temizlik görevlisi, teknisyen ve kişisel antrenör. Her adayın yetenek seviyesi ve maaşı farklı; aday havuzu her gün yenilenir.
- **İlerleme:** XP ile seviye atlayınca 30'dan fazla eşya, yeni personel türleri, pazarlama kampanyaları ve 5 aşamalı arsa genişlemesi açılır. Günlük hedefler, başarımlar ve rastgele olaylar da var: sıcak hava dalgası, rakip salon, sağlık denetimi, ünlü ziyareti, viral olma, ekipman fuarı.

## Kontroller

| Eylem | Kontrol |
| --- | --- |
| Kamerayı kaydır | Sürükle / WASD |
| Yakınlaştır | Fare tekerleği / iki parmak |
| Kamerayı döndür | Q / E |
| Yerleştirirken döndür | R |
| Eşya taşı | M (seçili eşyayı taşır; seçim yoksa tıklanan eşyayı) |
| Seçili eşyayı sat | Delete |
| Yerleştirmeyi bitir | Sağ tık / Esc |
| Duraklat / hız (1x, 2x, 5x) | Boşluk / 1 2 3 |
| İnşa menüsü | B |

## CrazyGames

`src/sdk.js`, CrazyGames SDK v3'ü yükler. Yükleme ekranı, `gameplayStart/Stop`, seviye atlamada `happytime`, gün sonunda ödüllü reklam (günlük kârın %30'u kadar bonus), üç günde bir ara reklam ve bulut kaydı (`data` modülü) bağlı. SDK erişilemezse (yerelde çalışırken) oyun bunları atlayıp normal çalışır. Yüklemek için `npm run build` çıktısındaki `dist/` klasörünü zipleyebilirsin.

## Kod yapısı

```
src/
  data.js            ekipman kataloğu, personel, pazarlama, olaylar, şikayet metinleri
  state.js           yeni oyun, kayıt/yükleme, tarih, rastgele isim ve görünüm
  sim/sim.js         gün döngüsü, ekonomi, talep, memnuniyet, yorumlar, hedefler
  sim/agents.js      müşteri ve personel yapay zekası
  sim/grid.js        A* yol bulma ve yerleştirme için ulaşılabilirlik kontrolü
  render/engine.js   renderer, izometrik kamera, kontroller, gün ışığı
  render/world.js    bina, duvar kesitleri, çevre, kir katmanı, efektler
  render/models.js   prosedürel ekipman modelleri
  render/character.js prosedürel insan modeli ve egzersiz animasyonları
  ui/ui.js           HUD, paneller, inşa modu, raporlar, eğitim
  audio.js           WebAudio ile üretilen efektler ve müzik
  sdk.js             CrazyGames SDK sarmalayıcısı
```
