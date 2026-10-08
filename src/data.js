// Oyun verileri: ekipman kataloğu, personel, pazarlama, seviyeler, genişleme, isimler, yorumlar.

export const MAXW = 30; // arsa genişliği (karo)
export const MAXD = 18; // arsa derinliği (karo)
export const DOOR_I = [2, 3]; // kapı karoları (ön duvar)

export const OPEN_MIN = 6 * 60;
export const LAST_ARRIVAL_MIN = 22 * 60;
export const CLOSE_MIN = 23 * 60;
export const REAL_SEC_PER_GAME_MIN = 0.17; // 1x hızda

export const CATEGORIES = [
  { id: 'cardio', name: 'Kardiyo', icon: '🏃' },
  { id: 'strength', name: 'Ağırlık', icon: '🏋️' },
  { id: 'functional', name: 'Fonksiyonel', icon: '🥊' },
  { id: 'facility', name: 'Tesis', icon: '🚿' },
  { id: 'decor', name: 'Dekor', icon: '🪴' },
];

// Egzersiz grupları — müşteri hedefleri bu gruplardan plan çıkarır.
export const GROUPS = {
  cardio: ['treadmill', 'bike', 'elliptical', 'rower', 'stair'],
  upper: ['dumbbells', 'flatbench', 'benchpress', 'pulldown', 'cable'],
  lower: ['squat', 'legpress', 'smith'],
  flex: ['yogamat'],
  combat: ['punchbag'],
};
// Grubun hiçbir aleti yoksa idare edilebilecek alternatifler (ör. bacak için dambıl ile goblet squat)
export const GROUP_FALLBACK = {
  cardio: ['punchbag'],
  upper: ['cable', 'yogamat'],
  lower: ['dumbbells', 'yogamat'],
  flex: ['bench'],
  combat: ['treadmill', 'bike', 'yogamat'],
};
export const GROUP_NAMES = {
  cardio: 'kardiyo aleti',
  upper: 'üst vücut aleti',
  lower: 'bacak aleti',
  flex: 'yoga alanı',
  combat: 'boks torbası',
};

/*
  Konum kuralları (rot=0): model merkezi ayak izinin merkezinde, +z "ön" taraftır.
  spots: { x, z (metre, merkeze göre), y (taban yüksekliği), face (radyan, 0 = +z'ye bakar),
           pose, ax, az (erişim noktası, metre), prop }
*/
export const ITEMS = {
  // ---------- KARDİYO ----------
  treadmill: {
    name: 'Koşu Bandı', cat: 'cardio', price: 2800, size: [1, 2], level: 1,
    power: 1.6, wear: 0.7, appeal: 1, dur: [14, 26], tags: ['cardio'],
    desc: 'Salonların vazgeçilmezi. Kilo vermek isteyenlerin bir numaralı tercihi.',
    spots: [{ x: 0, z: 0.15, y: 0.2, face: Math.PI, pose: 'run', ax: 0, az: 1.5 }],
  },
  bike: {
    name: 'Kondisyon Bisikleti', cat: 'cardio', price: 950, size: [1, 2], level: 1,
    power: 0.2, wear: 0.45, appeal: 1, dur: [12, 24], tags: ['cardio'],
    desc: 'Uygun fiyatlı, eklem dostu kardiyo.',
    spots: [{ x: 0, z: 0.38, y: 0.78, face: Math.PI, pose: 'cycle', ax: 0, az: 1.5 }],
  },
  elliptical: {
    name: 'Eliptik Bisiklet', cat: 'cardio', price: 1900, size: [1, 2], level: 3,
    power: 0.3, wear: 0.55, appeal: 1, dur: [12, 24], tags: ['cardio'],
    desc: 'Tüm vücut kardiyosu; orta yaş üyelerin favorisi.',
    spots: [{ x: 0, z: 0.2, y: 0.3, face: Math.PI, pose: 'elliptical', ax: 0, az: 1.5 }],
  },
  rower: {
    name: 'Kürek Makinesi', cat: 'cardio', price: 1300, size: [1, 2], level: 4,
    power: 0.1, wear: 0.5, appeal: 1, dur: [10, 18], tags: ['cardio'],
    desc: 'Kardiyo ve sırt kaslarını birlikte çalıştırır.',
    spots: [{ x: 0, z: 0.35, y: 0.32, face: Math.PI, pose: 'row', ax: 0, az: 1.5 }],
  },
  stair: {
    name: 'Merdiven Makinesi', cat: 'cardio', price: 4600, size: [1, 2], level: 6,
    power: 1.2, wear: 0.6, appeal: 2, dur: [10, 18], tags: ['cardio'],
    desc: 'Premium kardiyo. Kalori yakımında rakipsiz.',
    spots: [{ x: 0, z: 0.1, y: 0.35, face: Math.PI, pose: 'stair', ax: 0, az: 1.5 }],
  },
  // ---------- AĞIRLIK ----------
  dumbbells: {
    name: 'Dambıl Seti', cat: 'strength', price: 1600, size: [2, 1], level: 1,
    power: 0, wear: 0.25, appeal: 1, dur: [8, 15], tags: ['upper'],
    desc: '2–30 kg dambıl seti ve rafı. İki kişi aynı anda kullanabilir.',
    spots: [
      { x: -0.5, z: 1.0, y: 0, face: Math.PI, pose: 'curl', ax: -0.5, az: 1.0, prop: 'dumbbells' },
      { x: 0.5, z: 1.0, y: 0, face: Math.PI, pose: 'curl', ax: 0.5, az: 1.0, prop: 'dumbbells' },
    ],
  },
  flatbench: {
    name: 'Düz Sehpa', cat: 'strength', price: 300, size: [1, 2], level: 1,
    power: 0, wear: 0.2, appeal: 0, dur: [8, 14], tags: ['upper'],
    desc: 'Dambıl press ve sırt çalışmaları için ayarlı sehpa.',
    spots: [{ x: 0, z: 0.05, y: 0.5, face: 0, pose: 'dbpress', ax: 0, az: 1.5, prop: 'dumbbells' }],
  },
  benchpress: {
    name: 'Bench Press İstasyonu', cat: 'strength', price: 1200, size: [2, 2], level: 2,
    power: 0, wear: 0.35, appeal: 1, dur: [10, 16], tags: ['upper'],
    desc: 'Göğüs gününün kralı. Her erkek üye pazartesi buradadır.',
    spots: [{ x: 0, z: 0.05, y: 0.5, face: 0, pose: 'bench', ax: -0.5, az: 1.5, prop: 'barbell' }],
  },
  pulldown: {
    name: 'Lat Pulldown', cat: 'strength', price: 1900, size: [1, 2], level: 3,
    power: 0, wear: 0.35, appeal: 1, dur: [8, 14], tags: ['upper'],
    desc: 'Sırt kasları için kablo makinesi.',
    spots: [{ x: 0, z: 0.25, y: 0.5, face: Math.PI, pose: 'pulldown', ax: 0, az: 1.5 }],
  },
  squat: {
    name: 'Squat Kafesi', cat: 'strength', price: 2300, size: [2, 2], level: 3,
    power: 0, wear: 0.3, appeal: 2, dur: [10, 18], tags: ['lower'],
    desc: 'Güç antrenmanının temeli. Ciddi sporcular bunu arar.',
    spots: [{ x: 0, z: 0.0, y: 0.03, face: 0, pose: 'squat', ax: -0.5, az: 1.5, prop: 'barbell' }],
  },
  legpress: {
    name: 'Leg Press', cat: 'strength', price: 3100, size: [1, 2], level: 4,
    power: 0, wear: 0.4, appeal: 1, dur: [8, 14], tags: ['lower'],
    desc: '45° bacak itiş makinesi.',
    spots: [{ x: 0, z: 0.45, y: 0.45, face: Math.PI, pose: 'legpress', ax: 0, az: 1.5 }],
  },
  cable: {
    name: 'Kablo İstasyonu', cat: 'strength', price: 3600, size: [3, 1], level: 5,
    power: 0, wear: 0.35, appeal: 2, dur: [8, 15], tags: ['upper'],
    desc: 'Çift kuleli crossover. Sınırsız egzersiz çeşitliliği.',
    spots: [{ x: 0, z: 0.05, y: 0, face: 0, pose: 'cable', ax: 0, az: 1.0 }],
  },
  smith: {
    name: 'Smith Makinesi', cat: 'strength', price: 2700, size: [2, 2], level: 6,
    power: 0, wear: 0.3, appeal: 2, dur: [10, 16], tags: ['lower'],
    desc: 'Kılavuzlu bar ile güvenli squat ve press.',
    spots: [{ x: 0, z: 0.0, y: 0.03, face: 0, pose: 'squat', ax: -0.5, az: 1.5, prop: 'smithbar' }],
  },
  // ---------- FONKSİYONEL ----------
  yogamat: {
    name: 'Yoga & Esneme Matı', cat: 'functional', price: 60, size: [1, 2], level: 1,
    power: 0, wear: 0.15, appeal: 1, dur: [10, 20], tags: ['flex'],
    desc: 'Esneme, yoga ve core çalışmaları için alan.',
    spots: [{ x: 0, z: 0, y: 0.02, face: 0, pose: 'yoga', ax: 0, az: 1.5 }],
  },
  punchbag: {
    name: 'Boks Torbası', cat: 'functional', price: 380, size: [1, 1], level: 4,
    power: 0, wear: 0.4, appeal: 1, dur: [8, 14], tags: ['combat'],
    desc: 'Stres atmanın en iyi yolu. Dövüş sporcularını çeker.',
    spots: [{ x: 0, z: 0.72, y: 0, face: Math.PI, pose: 'punch', ax: 0, az: 1.0 }],
  },
  // ---------- TESİS ----------
  reception: {
    name: 'Resepsiyon', cat: 'facility', price: 1500, size: [3, 2], level: 1,
    power: 0.3, wear: 0, appeal: 3, unique: false, kind: 'reception',
    desc: 'Giriş, üyelik satışı ve günlük bilet. Resepsiyonist burada çalışır.',
    spots: [{ x: 0, z: 1.5, y: 0, face: Math.PI, pose: 'idle', ax: 0, az: 1.5 }],
    staffSpot: { x: 0, z: -0.45, y: 0, face: 0, ax: 1.9, az: -0.5 },
  },
  locker: {
    name: 'Soyunma Dolabı', cat: 'facility', price: 800, size: [2, 1], level: 1,
    power: 0, wear: 0.05, appeal: 0, kind: 'locker',
    desc: 'Üyeler eşyalarını bırakıp üstlerini değiştirir. Olmazsa çok şikayet gelir.',
    spots: [
      { x: -0.5, z: 1.0, y: 0, face: Math.PI, pose: 'locker', ax: -0.5, az: 1.0 },
      { x: 0.5, z: 1.0, y: 0, face: Math.PI, pose: 'locker', ax: 0.5, az: 1.0 },
    ],
  },
  water: {
    name: 'Su Sebili', cat: 'facility', price: 400, size: [1, 1], level: 1,
    power: 0.1, wear: 0.05, appeal: 0, kind: 'water',
    desc: 'Susayan sporcular için soğuk su.',
    spots: [{ x: 0, z: 0.85, y: 0, face: Math.PI, pose: 'drink', ax: 0, az: 1.0 }],
  },
  toilet: {
    name: 'Tuvalet Kabini', cat: 'facility', price: 1100, size: [1, 1], level: 1,
    power: 0, wear: 0.05, appeal: 0, kind: 'toilet', water: 0.05,
    desc: 'Temel bir ihtiyaç. Yoksa müşteriler çok kızar.',
    spots: [{ x: 0, z: 0.0, y: 0, face: 0, pose: 'hidden', ax: 0, az: 1.0 }],
  },
  shower: {
    name: 'Duş Kabini', cat: 'facility', price: 1400, size: [1, 1], level: 2,
    power: 0.5, wear: 0.05, appeal: 0, kind: 'shower', water: 0.45,
    desc: 'Antrenman sonrası duş. Kaliteli salonların olmazsa olmazı.',
    spots: [{ x: 0, z: 0.0, y: 0.05, face: 0, pose: 'shower', ax: 0, az: 1.0 }],
  },
  vending: {
    name: 'Otomat', cat: 'facility', price: 1800, size: [1, 1], level: 1,
    power: 0.4, wear: 0.05, appeal: 1, kind: 'vending', sale: [3, 6],
    desc: 'Su, enerji içeceği ve protein bar satar. Pasif gelir!',
    spots: [{ x: 0, z: 0.95, y: 0, face: Math.PI, pose: 'buy', ax: 0, az: 1.0 }],
  },
  bench: {
    name: 'Dinlenme Bankı', cat: 'facility', price: 180, size: [2, 1], level: 2,
    power: 0, wear: 0.02, appeal: 1, kind: 'rest',
    desc: 'Setler arası dinlenme. Yorulan müşteriler burada soluklanır.',
    spots: [
      { x: -0.5, z: 0.05, y: 0.45, face: 0, pose: 'sit', ax: -0.5, az: 1.0 },
      { x: 0.5, z: 0.05, y: 0.45, face: 0, pose: 'sit', ax: 0.5, az: 1.0 },
    ],
  },
  proteinbar: {
    name: 'Protein Bar', cat: 'facility', price: 6500, size: [3, 2], level: 6,
    power: 1.2, wear: 0.03, appeal: 4, kind: 'shop', sale: [6, 11],
    desc: 'Shake ve smoothie satışı. Yüksek kâr marjı.',
    spots: [
      { x: -0.8, z: 1.5, y: 0, face: Math.PI, pose: 'buy', ax: -1, az: 1.5 },
      { x: 0.8, z: 1.5, y: 0, face: Math.PI, pose: 'buy', ax: 1, az: 1.5 },
    ],
  },
  // ---------- DEKOR ----------
  plant: {
    name: 'Saksı Bitkisi', cat: 'decor', price: 80, size: [1, 1], level: 1,
    appeal: 5, radius: 3, desc: 'Ortama doğallık katar.',
  },
  bigplant: {
    name: 'Büyük Palmiye', cat: 'decor', price: 260, size: [1, 1], level: 3,
    appeal: 10, radius: 4, desc: 'Salona ferahlık ve prestij.',
  },
  mirror: {
    name: 'Duvar Aynası', cat: 'decor', price: 350, size: [2, 1], level: 2,
    appeal: 9, radius: 3, desc: 'Ağırlık sporcuları kendini görmeyi sever.',
  },
  speaker: {
    name: 'Hoparlör', cat: 'decor', price: 480, size: [1, 1], level: 3,
    appeal: 9, radius: 6, power: 0.15, desc: 'Motivasyonu yükselten müzik.',
  },
  tv: {
    name: 'Duvar TV', cat: 'decor', price: 750, size: [2, 1], level: 5,
    appeal: 10, radius: 5, power: 0.15, desc: 'Kardiyo yaparken dizi izlemek paha biçilmez.',
  },
  fan: {
    name: 'Ayaklı Vantilatör', cat: 'decor', price: 120, size: [1, 1], level: 1,
    appeal: 1, radius: 2, cooling: 1.5, power: 0.06, desc: 'Ucuz serinlik. Küçük alan için.',
  },
  ac: {
    name: 'Salon Kliması', cat: 'decor', price: 1900, size: [1, 1], level: 4,
    appeal: 2, radius: 2, cooling: 6, power: 2.4, desc: 'Yaz aylarında hayat kurtarır.',
  },
  neon: {
    name: 'Neon Tabela', cat: 'decor', price: 900, size: [2, 1], level: 7,
    appeal: 16, radius: 5, power: 0.05, desc: 'Instagram fotoğrafları için mükemmel köşe.',
  },
  trophy: {
    name: 'Kupa Vitrini', cat: 'decor', price: 1500, size: [2, 1], level: 9,
    appeal: 20, radius: 5, desc: 'Salonun başarılarını sergiler. Prestij!',
  },
};

export const STAFF_ROLES = {
  receptionist: {
    name: 'Resepsiyonist', icon: '🧑‍💼', wage: [60, 95], level: 1, color: 0x1d3557,
    desc: 'Müşteri girişleri, günlük bilet ve üyelik satışı. Olmazsa yeni müşteri kaybedersin.',
  },
  cleaner: {
    name: 'Temizlik Görevlisi', icon: '🧹', wage: [45, 70], level: 1, color: 0x2a9d8f,
    desc: 'Zeminleri, duşları ve tuvaletleri temizler.',
  },
  technician: {
    name: 'Teknisyen', icon: '🔧', wage: [80, 120], level: 3, color: 0xf4a261,
    desc: 'Bozulan aletleri tamir eder, bakım yapar.',
  },
  trainer: {
    name: 'Kişisel Antrenör', icon: '💪', wage: [90, 140], level: 4, color: 0xd62828,
    desc: 'Üyelere koçluk yapar, PT dersi satar. Memnuniyeti ciddi artırır.',
  },
};

export const MARKETING = [
  { id: 'flyer', name: 'El İlanı Dağıtımı', icon: '📄', cost: 300, days: 5, boost: 0.25, level: 1, desc: 'Mahallede kapı kapı tanıtım.' },
  { id: 'social', name: 'Sosyal Medya Reklamı', icon: '📱', cost: 900, days: 7, boost: 0.5, level: 2, desc: 'Instagram ve TikTok hedefli reklam.' },
  { id: 'search', name: 'Arama Motoru Reklamı', icon: '🔎', cost: 2200, days: 7, boost: 0.8, level: 4, desc: '"Yakınımdaki spor salonu" aramalarında en üstte.' },
  { id: 'influencer', name: 'Fenomen İş Birliği', icon: '🤳', cost: 4500, days: 10, boost: 1.0, level: 6, desc: 'Popüler bir fitness fenomeni salonunu tanıtır.' },
  { id: 'billboard', name: 'Billboard', icon: '🪧', cost: 7500, days: 14, boost: 1.3, level: 8, desc: 'Ana cadde üzerinde dev reklam panosu.' },
  { id: 'tv', name: 'TV Reklamı', icon: '📺', cost: 22000, days: 14, boost: 2.4, level: 12, desc: 'Yerel kanalda prime-time reklam.' },
];

export const EXPANSIONS = [
  { w: 10, d: 8, cost: 0, level: 1 },
  { w: 14, d: 10, cost: 9000, level: 2 },
  { w: 18, d: 12, cost: 22000, level: 4 },
  { w: 22, d: 14, cost: 48000, level: 6 },
  { w: 26, d: 16, cost: 95000, level: 9 },
  { w: 30, d: 18, cost: 170000, level: 12 },
];

export const LOANS = [
  { amount: 10000, days: 30, rate: 0.12 },
  { amount: 30000, days: 45, rate: 0.16 },
  { amount: 80000, days: 60, rate: 0.2 },
];

export const RENT_PER_TILE = 0.6;
export const ELECTRIC_PRICE = 0.16; // $/kWh

export function xpForLevel(l) {
  return Math.round(45 + (l - 1) * 40 + Math.pow(l - 1, 2) * 10);
}

// Müşteri hedefleri: plan şablonları
export const GOALS = {
  weightloss: { name: 'Kilo vermek', plan: [['cardio', 2, 3], ['upper', 0, 1], ['lower', 0, 1], ['flex', 0, 1]], weight: 0.3 },
  muscle: { name: 'Kas yapmak', plan: [['upper', 2, 3], ['lower', 1, 2], ['cardio', 0, 1]], weight: 0.3 },
  fitness: { name: 'Formda kalmak', plan: [['cardio', 1, 2], ['upper', 1, 2], ['lower', 0, 1], ['combat', 0, 1]], weight: 0.25 },
  wellness: { name: 'Esneklik & sağlık', plan: [['flex', 1, 2], ['cardio', 1, 1], ['upper', 0, 1]], weight: 0.08 },
  combat: { name: 'Dövüş kondisyonu', plan: [['combat', 1, 2], ['cardio', 1, 1], ['upper', 0, 1]], weight: 0.07 },
};

export const NAMES_M = ['Ahmet', 'Mehmet', 'Mustafa', 'Emre', 'Burak', 'Can', 'Murat', 'Kerem', 'Onur', 'Serkan', 'Cem', 'Barış', 'Oğuz', 'Eren', 'Yusuf', 'Ali', 'Hakan', 'Volkan', 'Tolga', 'Kaan', 'Arda', 'Berk', 'Deniz', 'Furkan', 'Gökhan', 'Hüseyin', 'İlker', 'Kadir', 'Levent', 'Mert', 'Okan', 'Selim', 'Tuna', 'Umut', 'Yiğit', 'Emir', 'Alp', 'Batuhan', 'Doruk', 'Ozan'];
export const NAMES_F = ['Ayşe', 'Fatma', 'Elif', 'Zeynep', 'Merve', 'Esra', 'Büşra', 'Selin', 'Ece', 'Deniz', 'Gizem', 'İrem', 'Damla', 'Ceren', 'Derya', 'Ebru', 'Pınar', 'Seda', 'Tuğba', 'Yasemin', 'Buse', 'Melis', 'Nazlı', 'Sude', 'Defne', 'Ezgi', 'Hande', 'Aslı', 'Beril', 'Cansu', 'Dilara', 'Eylül', 'Gamze', 'Hazal', 'Lale', 'Nehir', 'Özge', 'Sinem', 'Şule', 'Tülin'];
export const SURNAMES = ['Yılmaz', 'Kaya', 'Demir', 'Şahin', 'Çelik', 'Yıldız', 'Yıldırım', 'Öztürk', 'Aydın', 'Özdemir', 'Arslan', 'Doğan', 'Kılıç', 'Aslan', 'Çetin', 'Kara', 'Koç', 'Kurt', 'Özkan', 'Şimşek', 'Polat', 'Erdem', 'Güneş', 'Aksoy', 'Tekin', 'Ünal', 'Bulut', 'Korkmaz', 'Acar', 'Taş'];

export const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
export const WEEKDAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
export const WEEKDAYS_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
export const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

// Şikayet / övgü anahtarları -> metin & emoji
export const ISSUES = {
  wait: { emoji: '⏳', tip: 'Daha fazla alet ekle — özellikle en çok kullanılan türden.', label: 'Alet beklemek', review: ['Aletler hep dolu, sıra beklemekten antrenman yapamadım.', 'Akşam saatlerinde makine bulmak imkansız.', 'Yarım saat boş bir alet bekledim, daha fazla alet lazım.'] },
  missing: { emoji: '❓', tip: 'Farklı türde aletler ekle: kardiyo, üst vücut, bacak, yoga, boks.', label: 'Aradığı alet yok', review: ['Aradığım aletler salonda yok.', 'Ekipman çeşitliliği çok az.', 'Yapmak istediğim egzersiz için uygun alet yoktu.'] },
  dirty: { emoji: '🤢', tip: 'Temizlik görevlisi işe al.', label: 'Kirli salon', review: ['Yerler çok kirliydi, hijyen sıfır.', 'Temizlik berbat, bir daha düşünürüm.', 'Ter kokusu ve kir... Temizlikçi lazım!'] },
  hot: { emoji: '🥵', tip: 'Vantilatör veya klima yerleştir.', label: 'Çok sıcak', review: ['İçerisi fırın gibi, klima şart!', 'Sıcaktan nefes alamadım.', 'Havalandırma yetersiz, çok bunaltıcı.'] },
  cold: { emoji: '🥶', tip: 'Klimaları azalt.', label: 'Çok soğuk', review: ['Salon buz gibiydi.', 'Isınmak için bile çok soğuk.'] },
  crowded: { emoji: '😤', tip: 'Salonu genişlet, aletleri ferah yerleştir.', label: 'Kalabalık', review: ['Çok kalabalık, nefes alacak yer yok.', 'Salon üye sayısına göre çok küçük.', 'İnsanlar üst üste antrenman yapıyor.'] },
  noLocker: { emoji: '🎒', tip: 'Soyunma dolabı yerleştir.', label: 'Soyunma dolabı yok', review: ['Eşyalarımı koyacak dolap bile yok!', 'Soyunma dolabı yok, çantamla antrenman yaptım.'] },
  noShower: { emoji: '🚿', tip: 'Duş kabini yerleştir.', label: 'Duş yok', review: ['Antrenman sonrası duş alamamak kabul edilemez.', 'Duş yok, terli terli eve döndüm.'] },
  noToilet: { emoji: '🚽', tip: 'Tuvalet kabini yerleştir.', label: 'Tuvalet yok', review: ['Tuvalet bile yok, inanılmaz!', 'Tuvalet ihtiyacım için dışarı çıkmak zorunda kaldım.'] },
  thirst: { emoji: '💧', tip: 'Su sebili yerleştir.', label: 'Su yok', review: ['Su içebileceğim bir yer yoktu.', 'Su sebili bile yok, susuz kaldım.'] },
  broken: { emoji: '🔧', tip: 'Teknisyen işe al ya da bozuk aleti tamir ettir.', label: 'Bozuk alet', review: ['Aletlerin yarısı bozuk.', 'Bozuk makineler kimse tamir etmiyor.'] },
  noStaff: { emoji: '🙋', tip: 'Resepsiyonist işe al.', label: 'Resepsiyonda kimse yok', review: ['Resepsiyonda kimse yoktu, içeri giremedim.', 'Kayıt olmak istedim ama ilgilenen olmadı.'] },
  queue: { emoji: '🧾', tip: 'İkinci bir resepsiyon masası ve resepsiyonist ekle.', label: 'Resepsiyon kuyruğu', review: ['Girişte uzun kuyruk vardı.', 'Resepsiyon çok yavaş.'] },
  dirtyWc: { emoji: '🧻', tip: 'Temizlik görevlisi işe al.', label: 'Kirli duş/WC', review: ['Duşlar ve tuvaletler pislik içinde.', 'Islak alanlar çok kirli.'] },
  price: { emoji: '💸', tip: 'Üyelik fiyatını düşür veya salonun kalitesini artır.', label: 'Pahalı', review: ['Bu fiyata daha iyisini bulurum.', 'Üyelik ücreti hizmete göre çok pahalı.'] },
};

export const PRAISES = {
  clean: ['Tertemiz bir salon, bayıldım!', 'Hijyen mükemmel.'],
  atmosphere: ['Ortam çok güzel, müzik harika.', 'Dekorasyon ve atmosfer çok motive edici.', 'Çok şık bir salon!'],
  trainer: ['Antrenör çok ilgiliydi, çok şey öğrendim.', 'PT hocası harika, kesinlikle tavsiye ederim.'],
  variety: ['Ekipman çeşitliliği süper.', 'Aradığım her alet var.'],
  quiet: ['Hiç beklemeden antrenmanımı tamamladım.', 'Rahat ve sakin bir salon.'],
  price: ['Fiyat/performans harika.', 'Bu fiyata bu kalite, çok iyi.'],
  general: ['Harika bir antrenman yaptım!', 'Personel çok güler yüzlü.', 'Her gün geleceğim!', 'Mahallenin en iyi salonu.'],
};

export const EVENTS = {
  heatwave: { name: 'Sıcak Hava Dalgası', icon: '☀️', days: 3, desc: 'Dışarıda sıcaklık 8°C arttı. Klima ve vantilatörlerin önemi arttı!' },
  competitor: { name: 'Rakip Salon Açıldı', icon: '🏢', days: 7, desc: 'Yakınlarda yeni bir salon açıldı. Yeni müşteri sayısı %25 azalacak.' },
  powerhike: { name: 'Elektrik Zammı', icon: '⚡', days: 7, desc: 'Elektrik fiyatları bir hafta boyunca %40 daha pahalı.' },
  waterCut: { name: 'Su Kesintisi', icon: '🚱', days: 1, desc: 'Bugün şebeke suyu kesik — duşlar kullanılamıyor.' },
  marathon: { name: 'Şehir Maratonu', icon: '🏅', days: 3, desc: 'Maraton heyecanı! Kardiyo talebi ve yeni müşteri sayısı arttı.' },
  viral: { name: 'Viral Oldun!', icon: '🔥', days: 2, desc: 'Bir üyenin paylaşımı viral oldu. Yeni müşteri akını!' },
  expo: { name: 'Ekipman Fuarı', icon: '🏷️', days: 1, desc: 'Bugün tüm ekipmanlarda %20 indirim!' },
  inspection: { name: 'Sağlık Denetimi', icon: '📋', days: 1, desc: 'Saat 15:00\'te belediye denetimi var. Temizlik %60\'ın altındaysa ceza!' },
  influencer: { name: 'Ünlü Ziyareti', icon: '⭐', days: 1, desc: 'Ünlü bir fitness fenomeni bugün salonunu ziyaret edecek. İyi bir izlenim bırak!' },
};

export const MILESTONES = [
  { id: 'm10', text: '10 üyeye ulaş', check: s => s.members.length >= 10, reward: 500 },
  { id: 'm50', text: '50 üyeye ulaş', check: s => s.members.length >= 50, reward: 2000 },
  { id: 'm100', text: '100 üyeye ulaş', check: s => s.members.length >= 100, reward: 4000 },
  { id: 'm250', text: '250 üyeye ulaş', check: s => s.members.length >= 250, reward: 10000 },
  { id: 'm500', text: '500 üyeye ulaş', check: s => s.members.length >= 500, reward: 25000 },
  { id: 'm1000', text: '1000 üyeye ulaş', check: s => s.members.length >= 1000, reward: 60000 },
  { id: 'r4', text: '4 yıldız itibar', check: s => s.rep >= 4, reward: 3000 },
  { id: 'r45', text: '4.5 yıldız itibar', check: s => s.rep >= 4.5, reward: 12000 },
  { id: 'e1', text: 'İlk genişleme', check: s => s.expansion >= 1, reward: 1000 },
  { id: 'e3', text: 'Salonu 3 kez genişlet', check: s => s.expansion >= 3, reward: 8000 },
  { id: 'e5', text: 'Maksimum büyüklük', check: s => s.expansion >= 5, reward: 30000 },
  { id: 'i20', text: '20 ekipman', check: s => s.items.filter(i => ITEMS[i.type].cat !== 'decor').length >= 20, reward: 3000 },
  { id: 's5', text: '5 personel', check: s => s.staff.length >= 5, reward: 2500 },
  { id: 'cash100', text: 'Kasada $100.000', check: s => s.money >= 100000, reward: 10000 },
  { id: 'd30', text: '30 gün hayatta kal', check: s => s.day >= 30, reward: 5000 },
];
