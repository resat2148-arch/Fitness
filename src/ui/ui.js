import { G, fmtMoney, fmtTime, clamp } from '../game.js';
import {
  ITEMS, CATEGORIES, STAFF_ROLES, MARKETING, EXPANSIONS, LOANS, ISSUES, EVENTS, MILESTONES, GOALS,
  xpForLevel, RENT_PER_TILE, MAXD, MAXW, OPEN_MIN, CLOSE_MIN, GROUP_NAMES,
} from '../data.js';
import { dateInfo, save, deleteSave } from '../state.js';
import { makeGhost } from '../render/models.js';
import { itemDims, itemCenter } from '../render/world.js';
import { generateThumbnails } from '../render/thumbs.js';
import { INCOME_NAMES, EXPENSE_NAMES } from '../sim/sim.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const stars = (n, max = 5) => '★'.repeat(Math.round(n)) + '<span class="dim">' + '★'.repeat(max - Math.round(n)) + '</span>';
const bar = (v, cls = '') => `<div class="bar ${cls}"><div style="width:${clamp(v, 0, 1) * 100}%"></div></div>`;
const moodEmoji = s => (s >= 85 ? '😍' : s >= 70 ? '😄' : s >= 55 ? '🙂' : s >= 40 ? '😐' : s >= 25 ? '😠' : '😡');

const TUTORIAL = [
  {
    text: 'Hoş geldin patron! 🏋️ Spor salonunu sıfırdan kuracağız.<br>Önce <b>İnşa</b> menüsünden <b>Tesis</b> sekmesine gir ve bir <b>Resepsiyon</b> masası yerleştir.',
    target: 'tb-build',
    done: s => s.items.some(i => i.type === 'reception'),
  },
  {
    text: 'Harika! Şimdi <b>Personel</b> menüsünden bir <b>Resepsiyonist</b> işe al. Resepsiyonist olmadan günlük bilet ve üyelik satamazsın.',
    target: 'tb-staff',
    done: s => s.staff.some(x => x.role === 'receptionist'),
  },
  {
    text: 'Müşteriler antrenman için gelir! <b>Kardiyo</b> ve <b>Ağırlık</b> sekmelerinden en az <b>3 alet</b> yerleştir (ör. Koşu Bandı, Dambıl Seti, Bisiklet).<br><small>İpucu: Mavi daire aletin kullanım noktasıdır, boş kalmalı. <b>R</b> ile döndür.</small>',
    target: 'tb-build',
    done: s => s.items.filter(i => ['cardio', 'strength', 'functional'].includes(ITEMS[i.type].cat)).length >= 3,
  },
  {
    text: 'Temel ihtiyaçlar! <b>Tesis</b> sekmesinden bir <b>Soyunma Dolabı</b> ve bir <b>Tuvalet Kabini</b> koy. Olmazsa müşteriler çok şikayet eder.',
    target: 'tb-build',
    done: s => s.items.some(i => i.type === 'locker') && s.items.some(i => i.type === 'toilet'),
  },
  {
    text: 'Her şey hazır! Üstteki <b>▶</b> butonuyla zamanı başlat ve kapılarını aç! 🚪',
    target: 'speed',
    done: () => G.speed > 0,
  },
  {
    text: 'Müşterilerin başlarındaki <b>baloncuklar</b> ne düşündüklerini gösterir. Sol alttaki şikayet listesini takip et, gün sonunda raporunu incele ve salonunu büyüt! 💪<br><small>Kamera: sürükle = kaydır, tekerlek = yakınlaştır, Q/E = döndür</small>',
    target: null,
    done: (s, t) => t > 16,
  },
];

export class UI {
  constructor() {
    this.thumbs = generateThumbnails();
    this.selected = null;
    this.build = null;
    this.panel = null;
    this.buildCat = 'cardio';
    this.staffTab = 'receptionist';
    this.refreshT = 0;
    this.tutT = 0;
    this.toasts = [];
    this.heatOn = false;
    this.statTab = 'equip';
    this.statPeriod = 'week';
    this._bind();
  }

  // ===================== BAĞLAMA =====================
  _bind() {
    $('toolbar').addEventListener('click', e => {
      const b = e.target.closest('[data-panel]');
      if (!b) return;
      G.audio.play('click');
      const p = b.dataset.panel;
      if (this.panel === p) this.closePanel();
      else this.openPanel(p);
    });
    $('speed').addEventListener('click', e => {
      const b = e.target.closest('[data-speed]');
      if (!b) return;
      this.setSpeed(+b.dataset.speed);
    });
    const delegate = el =>
      el.addEventListener('click', e => {
        const b = e.target.closest('[data-act]');
        if (!b || b.disabled) return;
        this.act(b.dataset.act, b.dataset, b);
      });
    delegate($('panel'));
    delegate($('info'));
    delegate($('modal'));
    delegate($('buildbar'));
    delegate($('tutorial'));
    $('panel').addEventListener('input', e => {
      const t = e.target;
      if (t.dataset.price) {
        G.state.prices[t.dataset.price] = +t.value;
        this.updatePricingLabels();
      }
    });

    const canvas = G.engine.canvas;
    canvas.addEventListener('pointermove', e => {
      if (this.build && e.pointerType !== 'touch') this.updateGhost(e.clientX, e.clientY);
    });
    canvas.addEventListener('pointerup', e => {
      if (G.engine.dragMoved) return;
      if (e.button === 2) {
        if (this.movePick) this.endMovePick();
        else if (this.build) this.endBuild();
        else this.select(null);
        return;
      }
      if (e.button !== 0) return;
      this.handleClick(e.clientX, e.clientY, e.pointerType);
    });
    window.addEventListener('keydown', e => {
      if (e.target && e.target.tagName === 'INPUT') return;
      if (!G.running) return;
      if (e.code === 'Escape') {
        if (this.movePick) this.endMovePick();
        else if (this.build) this.endBuild();
        else if (!$('modal-wrap').classList.contains('hidden')) return;
        else if (this.panel) this.closePanel();
        else this.select(null);
      }
      if (e.code === 'KeyR' && this.build) this.rotateBuild();
      if (e.code === 'KeyM' && $('modal-wrap').classList.contains('hidden')) this.moveKey();
      if (e.code === 'Space') {
        e.preventDefault();
        this.setSpeed(G.speed ? 0 : this.lastSpeed || 1);
      }
      if (e.code === 'Digit1') this.setSpeed(1);
      if (e.code === 'Digit2') this.setSpeed(2);
      if (e.code === 'Digit3') this.setSpeed(5);
      if (e.code === 'KeyB') this.openPanel('build');
      if (e.code === 'Delete' && this.selected && this.selected.item) this.act('sell', {});
    });
  }

  setSpeed(s) {
    if (G.state.phase === 'night') return;
    G.speed = s;
    if (s) this.lastSpeed = s;
    for (const b of $('speed').querySelectorAll('button')) b.classList.toggle('on', +b.dataset.speed === s);
    G.audio.play('click');
    if (s) G.sdk.gameplayStart();
  }

  show() {
    $('hud').classList.remove('hidden');
    this.setSpeed(G.speed);
    this.refreshAll();
  }

  refreshAll() {
    this.updateTop(true);
    this.refreshGoals();
    this.updateStatus();
  }

  // ===================== ÜST BAR =====================
  updateTop(force) {
    const s = G.state;
    const di = dateInfo(s.day);
    $('gym-name').textContent = s.gymName;
    $('lvl').textContent = s.level;
    $('xpfill').style.width = (s.xp / xpForLevel(s.level)) * 100 + '%';
    $('date').textContent = `Gün ${s.day} · ${di.wdShort} ${di.label}`;
    $('clock').textContent = fmtTime(s.minute);
    const open = s.phase === 'open';
    $('openstate').textContent = open ? (s.minute >= 22 * 60 ? 'SON GİRİŞ' : 'AÇIK') : s.phase === 'closing' ? 'KAPANIYOR' : 'KAPALI';
    $('openstate').className = open ? 'open' : 'closed';
    const m = Math.round(s.money);
    if (m !== this._lastMoney) {
      const el = $('money');
      if (this._lastMoney !== undefined && !force) {
        el.classList.remove('up', 'down');
        void el.offsetWidth;
        el.classList.add(m > this._lastMoney ? 'up' : 'down');
      }
      this._lastMoney = m;
      el.textContent = fmtMoney(m);
      el.parentElement.classList.toggle('neg', m < 0);
    }
    $('members').textContent = s.members.length;
    $('rep').textContent = s.rep.toFixed(1);
  }

  updateStatus() {
    const sim = G.sim;
    const s = G.state;
    const t = s.today;
    const clean = sim.cleanliness();
    const temp = sim.temp;
    const inside = sim.customers.filter(a => a.pos.z < MAXD && a.state !== 'leaving').length;
    const sat = t && t.satN ? Math.round(t.satSum / t.satN) : null;
    const ap = sim.avgAppeal();
    let html = `
      <div class="st" title="Temizlik"><span>🧹</span><b class="${clean < 0.6 ? 'bad' : clean < 0.8 ? 'warn' : ''}">${Math.round(clean * 100)}%</b></div>
      <div class="st" title="İç sıcaklık (dışarısı ${Math.round(sim.outdoorTemp())}°C)"><span>🌡️</span><b class="${temp > 26 ? 'bad' : temp > 24 ? 'warn' : ''}">${temp.toFixed(1)}°C</b></div>
      <div class="st" title="Şu an içeride"><span>🏃</span><b>${inside}</b></div>
      <div class="st" title="Bugünkü ortalama memnuniyet"><span>${sat === null ? '😶' : moodEmoji(sat)}</span><b class="${sat !== null && sat < 50 ? 'bad' : ''}">${sat === null ? '—' : sat + '%'}</b></div>
      <div class="st" title="Atmosfer (dekor)"><span>✨</span><b>${Math.round(ap * 100)}%</b></div>`;
    // en çok şikayet
    if (t) {
      const top = Object.entries(t.complaints).sort((a, b) => b[1] - a[1]).slice(0, 3);
      if (top.length) {
        html += `<div class="complaints"><div class="ctitle">Bugünkü şikayetler</div>` +
          top.map(([k, n]) => `<div class="cmp" title="${esc(ISSUES[k].tip)}"><span>${ISSUES[k].emoji}</span>${ISSUES[k].label}<b>${n}</b></div><div class="tip">💡 ${ISSUES[k].tip}</div>`).join('') + `</div>`;
      }
    }
    // aktif olaylar & kampanyalar
    const chips = [];
    for (const e of s.events) if (e.until >= s.day && e.start <= s.day) chips.push(`<span class="chip ev" title="${esc(EVENTS[e.type].desc)}">${EVENTS[e.type].icon} ${EVENTS[e.type].name}</span>`);
    for (const m of s.marketing) {
      if (m.until < s.day) continue;
      const d = MARKETING.find(x => x.id === m.id);
      chips.push(`<span class="chip mk" title="${d.name}">${d.icon} ${m.until - s.day + 1}g</span>`);
    }
    if (!s.items.some(i => i.type === 'reception')) chips.push(`<span class="chip bad">⚠️ Resepsiyon yok</span>`);
    else if (!s.staff.some(x => x.role === 'receptionist')) chips.push(`<span class="chip bad">⚠️ Resepsiyonist yok</span>`);
    if (s.money < 0) chips.push(`<span class="chip bad">⚠️ Borçtasın! (${s.negDays}/5 gün)</span>`);
    if (chips.length) html += `<div class="chips">${chips.join('')}</div>`;
    if (html !== this._statusHtml) {
      this._statusHtml = html;
      $('status-widget').innerHTML = html;
    }
  }

  refreshGoals() {
    const s = G.state;
    if (!s.goals) return;
    $('goals').innerHTML = `<div class="gtitle">🎯 Günlük Hedefler</div>` +
      s.goals.map(g => {
        const p = g.end ? (g.done ? 1 : 0) : Math.min(1, g.progress / g.target);
        return `<div class="goal ${g.done ? 'done' : ''}">
          <div class="gtext">${g.done ? '✅' : '▫️'} ${esc(g.text)}</div>
          ${g.end ? `<div class="gsub">Gün sonunda kontrol edilir</div>` : bar(p)}
          <div class="greward">+${fmtMoney(g.reward)} · +${g.xp} XP</div>
        </div>`;
      }).join('');
  }

  // ===================== BİLDİRİMLER =====================
  notify(text, type = 'info', onClick) {
    const box = $('toasts');
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.innerHTML = text;
    if (onClick) {
      el.style.cursor = 'pointer';
      el.addEventListener('click', onClick);
    }
    box.prepend(el);
    while (box.children.length > 5) box.lastChild.remove();
    setTimeout(() => el.classList.add('out'), 5200);
    setTimeout(() => el.remove(), 5800);
    if (type === 'good') G.audio.play('notify');
  }

  onReview(r) {
    if (r.stars <= 2 || r.stars === 5) {
      const s = '★'.repeat(r.stars);
      this.notify(`<span class="rv-stars s${r.stars}">${s}</span> <b>${esc(r.name)}</b>: “${esc(r.text)}”`, r.stars <= 2 ? 'bad review' : 'review');
    }
  }

  onDayStart(resumed) {
    this.refreshGoals();
    if (!resumed && G.state.day > 1) {
      const di = dateInfo(G.state.day);
      this.notify(`☀️ Gün ${G.state.day} başladı — ${di.weekday}, ${di.label}`, 'info');
      G.audio.play('day');
    }
    if (this.panel) this.renderPanel();
  }

  // ===================== PANELLER =====================
  openPanel(name) {
    if (this.build) this.endBuild();
    this.panel = name;
    $('panel').classList.remove('hidden');
    $('hud').classList.add('panel-open');
    for (const b of $('toolbar').querySelectorAll('button')) b.classList.toggle('on', b.dataset.panel === name);
    this.renderPanel();
    G.audio.play('open');
  }

  closePanel() {
    this.panel = null;
    $('panel').classList.add('hidden');
    $('hud').classList.remove('panel-open');
    for (const b of $('toolbar').querySelectorAll('button')) b.classList.remove('on');
    if (this.heatOn) this.toggleHeat(false);
  }

  renderPanel() {
    const f = {
      build: () => this.panelBuild(),
      staff: () => this.panelStaff(),
      pricing: () => this.panelPricing(),
      marketing: () => this.panelMarketing(),
      finance: () => this.panelFinance(),
      expand: () => this.panelExpand(),
      reviews: () => this.panelReviews(),
      stats: () => this.panelStats(),
      settings: () => this.panelSettings(),
    }[this.panel];
    if (!f) return;
    const [title, body] = f();
    $('panel').innerHTML = `<div class="ph"><h2>${title}</h2><button class="x" data-act="close">✕</button></div><div class="pb">${body}</div>`;
    if (this.panel === 'finance') this.drawFinanceChart($('fin-chart'));
    if (this.panel === 'pricing') this.updatePricingLabels();
  }

  panelBuild() {
    const s = G.state;
    const tabs = CATEGORIES.map(c => `<button class="tab ${c.id === this.buildCat ? 'on' : ''}" data-act="cat" data-cat="${c.id}">${c.icon} ${c.name}</button>`).join('');
    const items = Object.entries(ITEMS).filter(([, d]) => d.cat === this.buildCat).sort((a, b) => a[1].level - b[1].level || a[1].price - b[1].price);
    const cards = items.map(([type, d]) => {
      const locked = d.level > s.level;
      const price = G.sim.priceOf(type);
      const owned = (G.sim.itemsByType.get(type) || []).length;
      const tags = [];
      if (d.spots && d.cat !== 'decor') tags.push(`👥 ${d.spots.length}`);
      if (d.power) tags.push(`⚡ ${d.power}kW`);
      if (d.appeal && d.cat === 'decor') tags.push(`✨ +${d.appeal}`);
      if (d.cooling) tags.push(`❄️ -${d.cooling}°`);
      if (d.sale) tags.push(`💵 $${d.sale[0]}-${d.sale[1]}`);
      tags.push(`📐 ${d.size[0]}×${d.size[1]}`);
      return `<div class="card ${locked ? 'locked' : ''} ${price > s.money ? 'cant' : ''}" data-act="${locked ? '' : 'buy'}" data-type="${type}" data-price="${price}" title="${esc(d.desc)}">
        <img src="${this.thumbs[type] || ''}" alt="">
        <div class="cname">${d.name}</div>
        <div class="cprice">${price < d.price ? `<s>${fmtMoney(d.price)}</s> ` : ''}${fmtMoney(price)}</div>
        <div class="ctags">${tags.join(' ')}</div>
        ${owned ? `<div class="owned">${owned}</div>` : ''}
        ${locked ? `<div class="lock">🔒 Seviye ${d.level}</div>` : ''}
      </div>`;
    }).join('');
    return ['🏗️ İnşa Et', `<div class="tabs">${tabs}</div>
      <div class="hint">Bir öğe seç ve salona yerleştir. <b>R</b>: döndür · <b>M</b>: eşya taşı · <b>Sağ tık/Esc</b>: iptal · Mavi daireler kullanım noktasıdır.</div>
      <div class="cards">${cards}</div>
      <div class="row"><button class="btn small" data-act="movepick">✋ Eşya taşı (M)</button><button class="btn small ${this.heatOn === 'appeal' ? 'on' : ''}" data-act="heat">✨ Atmosfer haritası ${this.heatOn === 'appeal' ? 'açık' : 'kapalı'}</button></div>`];
  }

  panelStaff() {
    const s = G.state;
    const wages = s.staff.reduce((a, x) => a + x.wage, 0);
    const current = s.staff.length
      ? s.staff.map(rec => {
          const r = STAFF_ROLES[rec.role];
          const ag = G.sim.staffAgents.find(a => a.data === rec);
          return `<div class="staff">
            <div class="avatar" style="background:#${r.color.toString(16).padStart(6, '0')}">${r.icon}</div>
            <div class="sinfo"><b>${esc(rec.name)}</b> <span class="muted">${r.name}</span><div class="stars">${stars(rec.skill)}</div>
            <div class="muted small">${ag ? esc(ag.status) : 'Mesai dışı'}</div></div>
            <div class="swage">${fmtMoney(rec.wage)}<small>/gün</small></div>
            <button class="btn small red" data-act="fire" data-id="${rec.id}">Kov</button>
          </div>`;
        }).join('')
      : `<div class="empty">Henüz personelin yok.</div>`;
    const tabs = Object.entries(STAFF_ROLES).map(([k, r]) => `<button class="tab ${k === this.staffTab ? 'on' : ''}" data-act="stab" data-role="${k}">${r.icon} ${r.name}${r.level > s.level ? ' 🔒' : ''}</button>`).join('');
    const role = STAFF_ROLES[this.staffTab];
    const locked = role.level > s.level;
    const cands = (s.candidates[this.staffTab] || []).map(c => `<div class="staff cand">
        <div class="avatar" style="background:#${role.color.toString(16).padStart(6, '0')}">${role.icon}</div>
        <div class="sinfo"><b>${esc(c.name)}</b><div class="stars">${stars(c.skill)}</div><div class="muted small">${['', 'Acemi', 'Normal', 'Deneyimli', 'Uzman', 'Usta'][c.skill]}</div></div>
        <div class="swage">${fmtMoney(c.wage)}<small>/gün</small></div>
        <button class="btn small green" data-act="hire" data-id="${c.id}" ${locked ? 'disabled' : ''}>İşe Al</button>
      </div>`).join('');
    return ['👔 Personel', `<div class="sect"><h3>Ekibin <span class="muted">(${s.staff.length} kişi · günlük ${fmtMoney(wages)})</span></h3>${current}</div>
      <div class="sect"><h3>Aday Havuzu <span class="muted">(her gün yenilenir)</span></h3><div class="tabs">${tabs}</div>
      <div class="hint">${role.desc}${locked ? ` <b>Seviye ${role.level}'de açılır.</b>` : ''}</div>${cands}</div>`];
  }

  panelPricing() {
    const s = G.state;
    const sim = G.sim;
    const members = s.members;
    const avgSat = members.length ? members.reduce((a, m) => a + m.sat, 0) / members.length : 0;
    const upcoming = members.filter(m => m.renew - s.day <= 7).length;
    const goals = {};
    for (const m of members) goals[m.goal] = (goals[m.goal] || 0) + 1;
    const goalRows = Object.entries(goals).sort((a, b) => b[1] - a[1]).map(([g, n]) => `<div class="kv"><span>${GOALS[g].name}</span><b>${n}</b></div>`).join('') || '<div class="muted">—</div>';
    return ['💳 Üyelik & Fiyatlar', `
      <div class="sect"><h3>Aylık Üyelik Ücreti</h3>
        <div class="slider"><input type="range" min="15" max="150" step="1" value="${s.prices.monthly}" data-price="monthly"><b id="pv-monthly"></b></div>
        <div class="kv"><span>Salonunun değeri (adil fiyat)</span><b id="fair-price"></b></div>
        <div class="kv"><span>Müşteri algısı</span><b id="price-perc"></b></div>
        <div class="hint">Yüksek fiyat daha az yeni üye ve daha fazla iptal demektir. Salonunu geliştirdikçe (ekipman çeşitliliği, duş, antrenör, atmosfer, itibar) adil fiyat artar.</div>
      </div>
      <div class="sect"><h3>Günlük Bilet</h3>
        <div class="slider"><input type="range" min="3" max="35" step="1" value="${s.prices.dayPass}" data-price="dayPass"><b id="pv-dayPass"></b></div>
      </div>
      <div class="sect"><h3>PT Dersi (Antrenör)</h3>
        <div class="slider"><input type="range" min="15" max="90" step="1" value="${s.prices.pt || 30}" data-price="pt"><b id="pv-pt"></b></div>
      </div>
      <div class="sect"><h3>Kayıt Ücreti (yeni üyelerden bir kez)</h3>
        <div class="slider"><input type="range" min="0" max="100" step="5" value="${s.prices.joinFee ?? 20}" data-price="joinFee"><b id="pv-joinFee"></b></div>
        <div class="hint">Her yeni üyeden ilk ay ücretine ek olarak alınır. Çok yüksek tutarsan üye olma oranı düşer.</div>
      </div>
      <div class="sect two">
        <div><h3>Üyeler</h3>
          <div class="kv"><span>Toplam üye</span><b>${members.length}</b></div>
          <div class="kv"><span>Ortalama memnuniyet</span><b>${members.length ? moodEmoji(avgSat) + ' ' + Math.round(avgSat) + '%' : '—'}</b></div>
          <div class="kv"><span>7 gün içinde yenileme</span><b>${upcoming}</b></div>
          <div class="kv"><span>Tahmini aylık gelir</span><b>${fmtMoney(members.length * s.prices.monthly)}</b></div>
        </div>
        <div><h3>Üye hedefleri</h3>${goalRows}</div>
      </div>`];
  }

  updatePricingLabels() {
    const s = G.state;
    const set = (id, v) => $(id) && ($(id).textContent = v);
    set('pv-monthly', fmtMoney(s.prices.monthly) + '/ay');
    set('pv-dayPass', fmtMoney(s.prices.dayPass));
    set('pv-pt', fmtMoney(s.prices.pt || 30));
    set('pv-joinFee', fmtMoney(s.prices.joinFee ?? 0));
    const fair = G.sim.fairPrice();
    set('fair-price', fmtMoney(fair) + '/ay');
    const r = G.sim.priceRatio();
    const el = $('price-perc');
    if (el) {
      const [txt, cls] = r < 0.8 ? ['Çok ucuz 🤑', 'good'] : r < 0.95 ? ['Ucuz 👍', 'good'] : r < 1.1 ? ['Uygun 👌', ''] : r < 1.3 ? ['Pahalı 😕', 'warn'] : ['Çok pahalı 😠', 'bad'];
      el.textContent = txt;
      el.className = cls;
    }
  }

  panelMarketing() {
    const s = G.state;
    const est = Math.round(G.sim.baseProspects());
    const cards = MARKETING.map(m => {
      const active = s.marketing.find(x => x.id === m.id && x.until >= s.day);
      const locked = m.level > s.level;
      return `<div class="mk ${locked ? 'locked' : ''}">
        <div class="mkicon">${m.icon}</div>
        <div class="mkinfo"><b>${m.name}</b><div class="muted small">${m.desc}</div>
          <div class="small">📈 +%${Math.round(m.boost * 100)} yeni müşteri · ⏱️ ${m.days} gün</div></div>
        ${active ? `<div class="active">Aktif<br><small>${active.until - s.day + 1} gün kaldı</small></div>`
          : locked ? `<div class="lockt">🔒 Sv. ${m.level}</div>`
          : `<button class="btn green ${m.cost > s.money ? 'cant' : ''}" data-act="campaign" data-id="${m.id}">${fmtMoney(m.cost)}</button>`}
      </div>`;
    }).join('');
    return ['📣 Pazarlama', `<div class="hint">Tahmini günlük yeni müşteri adayı: <b>${est}</b> kişi (itibar, fiyat, sezon, hafta günü ve kampanyalara göre). Kampanya başladığı anda bugüne de etki eder.</div>${cards}`];
  }

  panelFinance() {
    const s = G.state;
    const t = s.today;
    const R = G.sim.grid.rect;
    const rent = Math.round(R.w * R.d * RENT_PER_TILE);
    const wages = s.staff.reduce((a, x) => a + x.wage, 0);
    const inc = Object.entries(t.income).map(([k, v]) => `<div class="kv"><span>${INCOME_NAMES[k] || k}</span><b class="good">+${fmtMoney(v)}</b></div>`).join('') || '<div class="muted">Henüz gelir yok</div>';
    const exp = Object.entries(t.expense).map(([k, v]) => `<div class="kv"><span>${EXPENSE_NAMES[k] || k}</span><b class="bad">-${fmtMoney(v)}</b></div>`).join('') || '<div class="muted">Henüz harcama yok</div>';
    const loan = s.loan
      ? `<div class="kv"><span>Kalan taksit</span><b>${s.loan.left} gün × ${fmtMoney(s.loan.daily)}</b></div>
         <button class="btn" data-act="payloan">Erken kapat (${fmtMoney(Math.round(s.loan.daily * s.loan.left * 0.92))})</button>`
      : LOANS.map((L, k) => `<div class="kv"><span>${fmtMoney(L.amount)} · ${L.days} gün · faiz %${Math.round(L.rate * 100)}</span>
          <button class="btn small" data-act="loan" data-k="${k}">Al (${fmtMoney(Math.round((L.amount * (1 + L.rate)) / L.days))}/gün)</button></div>`).join('');
    return ['📊 Finans', `
      <div class="sect"><h3>Son 14 gün</h3><canvas id="fin-chart" width="560" height="170"></canvas>
        <div class="legend"><span class="lg inc"></span>Gelir <span class="lg exp"></span>Gider <span class="lg mon"></span>Kasa</div></div>
      <div class="sect two">
        <div><h3>Bugünkü gelirler</h3>${inc}</div>
        <div><h3>Bugünkü giderler</h3>${exp}</div>
      </div>
      <div class="sect"><h3>Sabit günlük giderler (gün sonunda)</h3>
        <div class="kv"><span>Kira (${R.w * R.d} m²)</span><b>${fmtMoney(rent)}</b></div>
        <div class="kv"><span>Maaşlar (${s.staff.length} kişi)</span><b>${fmtMoney(wages)}</b></div>
        <div class="kv"><span>Elektrik (bugüne kadar ~${Math.round(t.kwh)} kWh)</span><b>~${fmtMoney(t.kwh * 0.16)}</b></div>
      </div>
      <div class="sect"><h3>🏦 Banka Kredisi</h3>${loan}</div>`];
  }

  drawFinanceChart(cv) {
    if (!cv) return;
    const x = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    x.clearRect(0, 0, W, H);
    const h = G.state.history.slice(-14);
    if (!h.length) {
      x.fillStyle = '#8b93a7';
      x.font = '14px sans-serif';
      x.textAlign = 'center';
      x.fillText('İlk günün sonunda grafik burada görünecek', W / 2, H / 2);
      return;
    }
    const maxV = Math.max(1, ...h.map(d => Math.max(d.income, d.expense)));
    const bw = (W - 40) / 14;
    x.strokeStyle = 'rgba(255,255,255,0.08)';
    for (let i = 0; i < 4; i++) {
      x.beginPath();
      x.moveTo(30, 10 + (i * (H - 30)) / 3);
      x.lineTo(W, 10 + (i * (H - 30)) / 3);
      x.stroke();
    }
    h.forEach((d, i) => {
      const bx = 34 + i * bw;
      const ih = (d.income / maxV) * (H - 30);
      const eh = (d.expense / maxV) * (H - 30);
      x.fillStyle = '#3ddc84';
      x.fillRect(bx, H - 20 - ih, bw * 0.38, ih);
      x.fillStyle = '#ff6b6b';
      x.fillRect(bx + bw * 0.4, H - 20 - eh, bw * 0.38, eh);
      x.fillStyle = '#8b93a7';
      x.font = '10px sans-serif';
      x.textAlign = 'center';
      x.fillText(d.day, bx + bw * 0.4, H - 6);
    });
    const mins = Math.min(...h.map(d => d.money)), maxs = Math.max(...h.map(d => d.money));
    x.strokeStyle = '#ffd166';
    x.lineWidth = 2;
    x.beginPath();
    h.forEach((d, i) => {
      const px = 34 + i * bw + bw * 0.4;
      const py = H - 20 - ((d.money - mins) / Math.max(1, maxs - mins)) * (H - 40) - 5;
      i ? x.lineTo(px, py) : x.moveTo(px, py);
    });
    x.stroke();
    x.fillStyle = '#8b93a7';
    x.textAlign = 'left';
    x.font = '10px sans-serif';
    x.fillText(fmtMoney(maxV), 0, 14);
  }

  panelExpand() {
    const s = G.state;
    const cur = EXPANSIONS[s.expansion];
    const next = EXPANSIONS[s.expansion + 1];
    const steps = EXPANSIONS.map((e, k) => `<div class="exp ${k <= s.expansion ? 'done' : k === s.expansion + 1 ? 'next' : ''}">
      <b>${e.w}×${e.d}</b><small>${e.w * e.d} m²</small>${k ? `<small>${fmtMoney(e.cost)}</small><small>Sv. ${e.level}</small>` : '<small>Başlangıç</small>'}</div>`).join('');
    let body = `<div class="exps">${steps}</div>`;
    body += `<div class="kv"><span>Şu anki alan</span><b>${cur.w}×${cur.d} = ${cur.w * cur.d} m²</b></div>
      <div class="kv"><span>Günlük kira</span><b>${fmtMoney(cur.w * cur.d * RENT_PER_TILE)}</b></div>`;
    if (next) {
      const lockedL = next.level > s.level;
      body += `<div class="kv"><span>Sonraki alan</span><b>${next.w}×${next.d} = ${next.w * next.d} m²</b></div>
        <div class="kv"><span>Yeni günlük kira</span><b>${fmtMoney(next.w * next.d * RENT_PER_TILE)}</b></div>
        <div class="hint">Daha büyük salon = daha fazla alet, daha az kalabalık ve daha yüksek kapasite. Arsadaki sarı kesikli çizgi yeni alanı gösterir.</div>
        <button class="btn big green ${next.cost > s.money || lockedL ? 'cant' : ''}" data-act="expand" ${lockedL ? 'disabled' : ''}>${lockedL ? `🔒 Seviye ${next.level} gerekli` : `🏗️ Genişlet — ${fmtMoney(next.cost)}`}</button>`;
    } else body += `<div class="hint">Salonun maksimum büyüklükte! 🏆</div>`;
    return ['🏢 Salonu Genişlet', body];
  }

  panelReviews() {
    const s = G.state;
    const avg = s.reviews.length ? s.reviews.reduce((a, r) => a + r.stars, 0) / s.reviews.length : 0;
    const t = s.today;
    const comp = Object.entries(t.complaints).sort((a, b) => b[1] - a[1]);
    const compHtml = comp.length
      ? comp.map(([k, n]) => `<div class="cmprow"><span class="ce">${ISSUES[k].emoji}</span><div><b>${ISSUES[k].label}</b> <span class="muted">×${n}</span><div class="small">💡 ${ISSUES[k].tip}</div></div></div>`).join('')
      : '<div class="muted">Bugün şikayet yok 🎉</div>';
    const list = s.reviews.length
      ? s.reviews.map(r => `<div class="review"><div class="rh"><span class="ava">${r.g === 'f' ? '👩' : '👨'}</span><b>${esc(r.name)}</b><span class="rv-stars s${r.stars}">${stars(r.stars)}</span><span class="muted small">Gün ${r.day}</span></div><div>“${esc(r.text)}”</div></div>`).join('')
      : '<div class="muted">Henüz yorum yok.</div>';
    return ['⭐ İtibar & Yorumlar', `
      <div class="sect two">
        <div><h3>İtibar</h3><div class="bigrep">${s.rep.toFixed(2)} <span class="rv-stars">${stars(s.rep)}</span></div>
          <div class="muted small">Son yorumların ortalaması: ${avg ? avg.toFixed(1) : '—'} ★</div>
          <div class="hint">İtibar; yeni müşteri sayısını, adil fiyatı ve üye sadakatini belirler.</div></div>
        <div><h3>Bugünkü şikayetler</h3>${compHtml}</div>
      </div>
      <div class="sect"><h3>Son yorumlar</h3>${list}</div>`];
  }

  panelStats() {
    const tabs = [['equip', '🏋️ Aletler'], ['general', '🏆 Genel & Başarımlar']]
      .map(([k, n]) => `<button class="tab ${this.statTab === k ? 'on' : ''}" data-act="stattab" data-tab="${k}">${n}</button>`).join('');
    const [title, body] = this.statTab === 'general' ? this.panelGoals() : this.panelEquipStats();
    return [title, `<div class="tabs">${tabs}</div>${body}`];
  }

  panelEquipStats() {
    const s = G.state;
    const period = this.statPeriod;
    const st = G.sim.usageStats(period);
    const owned = G.sim.itemsByType;
    const types = new Set([...owned.keys(), ...Object.keys(st.use), ...Object.keys(st.wait)]);
    const rows = [...types]
      .filter(t => ITEMS[t] && ITEMS[t].dur)
      .map(t => {
        const n = (owned.get(t) || []).length;
        const use = st.use[t] || 0;
        const wait = st.wait[t] || 0;
        return { t, n, use, wait, per: n ? use / n : 0 };
      })
      .sort((a, b) => b.use - a.use || b.wait - a.wait);
    const maxUse = Math.max(1, ...rows.map(r => r.use));
    const withUse = rows.filter(r => r.n && r.use);
    const avgPer = withUse.length ? withUse.reduce((a, r) => a + r.per, 0) / withUse.length : 0;
    const totalUse = rows.reduce((a, r) => a + r.use, 0);
    const periods = [['today', 'Bugün'], ['week', 'Son 7 gün'], ['all', 'Tüm zamanlar']]
      .map(([k, n]) => `<button class="tab small ${period === k ? 'on' : ''}" data-act="statperiod" data-p="${k}">${n}</button>`).join('');
    const list = rows.length
      ? rows.map((r, i) => {
          let chip = '';
          if (r.n && r.wait >= 3 && r.wait / Math.max(1, r.use) >= 0.2) chip = `<span class="chip warnc" title="Müşteriler bu aleti beklemek zorunda kalıyor">⚠️ Yetersiz — 1 tane daha al</span>`;
          else if (!r.n && (r.use || r.wait)) chip = `<span class="chip">Artık salonda yok</span>`;
          else if (r.n && avgPer > 3 && r.per < avgPer * 0.35) chip = `<span class="chip" title="Diğer aletlere göre çok az kullanılıyor">💤 Az kullanılıyor</span>`;
          const share = totalUse ? Math.round((r.use / totalUse) * 100) : 0;
          return `<div class="urow" title="${ITEMS[r.t].name}: ${r.use} kullanım (%${share}) · ${r.n} adet · ${r.wait} bekleme">
            <span class="urank">${i + 1}</span>
            <img src="${this.thumbs[r.t] || ''}" alt="">
            <div class="umain">
              <div class="utop"><b>${ITEMS[r.t].name}</b><span class="muted small">×${r.n}</span><span class="uval">${r.use}</span></div>
              <div class="ubar"><div style="width:${(r.use / maxUse) * 100}%"></div></div>
              <div class="usub muted small">%${share} pay · alet başına ${r.n ? r.per.toFixed(1) : '—'} · ⏳ ${r.wait} bekleme ${chip}</div>
            </div>
          </div>`;
        }).join('')
      : `<div class="empty">Henüz kullanım verisi yok. Zamanı başlat; müşteriler aletleri kullandıkça burada görünecek.</div>`;
    const miss = Object.entries(st.missing || {}).sort((a, b) => b[1] - a[1]);
    const missHtml = miss.length
      ? `<div class="sect"><h3>❓ Aranıp bulunamayanlar <span class="muted">(bugün)</span></h3>${miss.map(([g, n]) => `<div class="kv"><span>${GROUP_NAMES[g] || g}</span><b class="bad">${n} kişi</b></div>`).join('')}
         <div class="hint">Bu türden hiç alet olmadığı için müşteriler antrenmanlarını yarım bıraktı.</div></div>`
      : '';
    const items = G.state.items.filter(it => ITEMS[it.type].dur).sort((a, b) => b.uses - a.uses).slice(0, 8);
    const itemsHtml = items.length
      ? items.map(it => `<div class="kv iteml" data-act="focusitem" data-id="${it.id}" title="Salonda göster">
          <span>${ITEMS[it.type].name} <span class="muted small">#${it.id}</span></span>
          <span class="small ${it.broken ? 'bad' : it.cond < 40 ? 'warn' : 'muted'}">${it.broken ? 'BOZUK' : Math.round(it.cond) + '%'}</span>
          <b>${it.uses}</b></div>`).join('')
      : '<div class="muted">Henüz alet yok.</div>';
    return ['📈 İstatistikler', `
      <div class="row" style="margin-top:0">${periods}<button class="btn small ${this.heatOn === 'usage' ? 'on' : ''}" data-act="heatuse" style="margin-left:auto">🔥 Kullanım haritası</button></div>
      <div class="hint">Toplam <b>${totalUse}</b> egzersiz. Çok bekleme olan aletten bir tane daha almak memnuniyeti artırır; az kullanılanı satıp yerine popüler olanı koyabilirsin.</div>
      <div class="sect"><h3>En çok kullanılan aletler</h3>${list}</div>
      ${missHtml}
      <div class="sect"><h3>Tek tek en yoğun aletler <span class="muted">(tüm zamanlar)</span></h3>${itemsHtml}</div>`];
  }

  panelGoals() {
    const s = G.state;
    const ms = MILESTONES.map(m => `<div class="ms ${s.milestones[m.id] ? 'done' : ''}"><span>${s.milestones[m.id] ? '🏅' : '⬜'}</span><div>${m.text}<div class="muted small">Ödül: ${fmtMoney(m.reward)}${s.milestones[m.id] ? ` · Gün ${s.milestones[m.id]}'de kazanıldı` : ''}</div></div></div>`).join('');
    const st = s.stats;
    return ['🏆 Başarımlar & İstatistik', `
      <div class="sect two">
        <div><h3>Genel</h3>
          <div class="kv"><span>Gün</span><b>${s.day}</b></div>
          <div class="kv"><span>Seviye</span><b>${s.level}</b></div>
          <div class="kv"><span>Toplam ziyaret</span><b>${st.visits}</b></div>
          <div class="kv"><span>Toplam gelir</span><b>${fmtMoney(st.income)}</b></div>
          <div class="kv"><span>Kazanılan üye</span><b>${st.newMembers}</b></div>
          <div class="kv"><span>Rekor üye sayısı</span><b>${st.maxMembers}</b></div>
        </div>
        <div><h3>Seviye ${s.level} → ${s.level + 1}</h3>${bar(s.xp / xpForLevel(s.level))}<div class="muted small">${s.xp} / ${xpForLevel(s.level)} XP</div>
          <div class="hint">XP; ziyaretlerden, yeni üyelerden ve hedeflerden gelir. Yeni seviyeler yeni aletler, personel ve genişleme açar.</div></div>
      </div>
      <div class="sect"><h3>Başarımlar</h3><div class="mss">${ms}</div></div>`];
  }

  panelSettings() {
    const st = G.state.settings;
    return ['⚙️ Ayarlar', `
      <div class="kv"><span>🎵 Müzik</span><button class="btn small ${st.music ? 'green' : ''}" data-act="toggle" data-k="music">${st.music ? 'Açık' : 'Kapalı'}</button></div>
      <div class="kv"><span>🔊 Ses efektleri</span><button class="btn small ${st.sfx ? 'green' : ''}" data-act="toggle" data-k="sfx">${st.sfx ? 'Açık' : 'Kapalı'}</button></div>
      <div class="kv"><span>🌑 Gölgeler</span><button class="btn small ${st.shadows !== false ? 'green' : ''}" data-act="toggle" data-k="shadows">${st.shadows !== false ? 'Açık' : 'Kapalı'}</button></div>
      <div class="sect"><h3>Kontroller</h3>
        <div class="kv"><span>Kamerayı kaydır</span><b>Sürükle / WASD</b></div>
        <div class="kv"><span>Yakınlaştır</span><b>Fare tekerleği / iki parmak</b></div>
        <div class="kv"><span>Kamerayı döndür</span><b>Q / E</b></div>
        <div class="kv"><span>Yerleştirirken döndür</span><b>R</b></div>
        <div class="kv"><span>Eşya taşı (seçiliyken ya da tıklayarak seç)</span><b>M</b></div>
        <div class="kv"><span>Seçili eşyayı sat</span><b>Delete</b></div>
        <div class="kv"><span>Duraklat / Hız</span><b>Boşluk / 1 2 3</b></div>
        <div class="kv"><span>İnşa menüsü</span><b>B</b></div>
      </div>
      <div class="row"><button class="btn" data-act="savenow">💾 Kaydet</button><button class="btn red" data-act="reset">🗑️ Yeni oyun başlat</button></div>`];
  }

  // ===================== AKSİYONLAR =====================
  act(a, d, el) {
    const s = G.state;
    switch (a) {
      case 'close': this.closePanel(); break;
      case 'cat': this.buildCat = d.cat; this.renderPanel(); G.audio.play('click'); break;
      case 'stab': this.staffTab = d.role; this.renderPanel(); G.audio.play('click'); break;
      case 'stattab': this.statTab = d.tab; this.renderPanel(); G.audio.play('click'); break;
      case 'statperiod': this.statPeriod = d.p; this.renderPanel(); G.audio.play('click'); break;
      case 'heatuse': this.toggleHeat(this.heatOn === 'usage' ? false : 'usage'); this.renderPanel(); break;
      case 'focusitem': {
        const it = s.items.find(x => x.id === +d.id);
        if (it) this.selectItem(it);
        break;
      }
      case 'buy':
        if (+d.price > s.money) {
          this.notify('Yeterli paran yok!', 'bad');
          G.audio.play('error');
          return;
        }
        this.startBuild(d.type);
        break;
      case 'heat': this.toggleHeat(this.heatOn === 'appeal' ? false : 'appeal'); this.renderPanel(); break;
      case 'hire': {
        const c = s.candidates[this.staffTab].find(x => x.id === +d.id);
        if (c) G.sim.hire(c);
        this.renderPanel();
        break;
      }
      case 'fire': {
        const rec = s.staff.find(x => x.id === +d.id);
        if (rec)
          this.confirm(`<b>${esc(rec.name)}</b> işten çıkarılsın mı?<br><small>Tazminat: 1 günlük maaş (${fmtMoney(rec.wage)})</small>`, () => {
            G.sim.fire(rec);
            if (this.panel) this.renderPanel();
          });
        break;
      }
      case 'campaign': G.sim.launchCampaign(d.id); this.renderPanel(); break;
      case 'loan': G.sim.takeLoan(+d.k); this.renderPanel(); break;
      case 'payloan': G.sim.payLoan(); this.renderPanel(); break;
      case 'expand': G.sim.expand(); this.renderPanel(); break;
      case 'toggle':
        s.settings[d.k] = s.settings[d.k] === false ? true : !s.settings[d.k];
        G.audio.applySettings();
        if (d.k === 'shadows') G.engine.renderer.shadowMap.enabled = s.settings.shadows !== false, G.engine.scene.traverse(o => o.material && (o.material.needsUpdate = true));
        this.renderPanel();
        break;
      case 'savenow': save(); this.notify('💾 Oyun kaydedildi', 'good'); break;
      case 'reset':
        this.confirm('Tüm ilerleme silinecek ve yeni bir salonla baştan başlayacaksın.', () => G.resetGame());
        break;
      // bilgi paneli
      case 'move': if (this.selected && this.selected.item) this.startMove(this.selected.item); break;
      case 'movepick': this.moveKey(); break;
      case 'sell': {
        const it = this.selected && this.selected.item;
        if (!it) return;
        const doSell = () => {
          if (!G.state.items.includes(it)) return;
          G.sim.sellItem(it);
          this.select(null);
        };
        if (it.type === 'reception' && s.items.filter(i => i.type === 'reception').length === 1)
          this.confirm('Tek resepsiyon masanı satıyorsun. Resepsiyon olmadan yeni müşteri kabul edemezsin.', doSell);
        else doSell();
        break;
      }
      case 'repair': {
        const it = this.selected && this.selected.item;
        if (it) G.sim.repairNow(it);
        this.renderInfo(true);
        break;
      }
      case 'firesel': {
        const ag = this.selected && this.selected.agent;
        if (ag)
          this.confirm(`<b>${esc(ag.data.name)}</b> işten çıkarılsın mı?<br><small>Tazminat: 1 günlük maaş (${fmtMoney(ag.data.wage)})</small>`, () => {
            if (G.state.staff.includes(ag.data)) G.sim.fire(ag.data);
            this.select(null);
          });
        break;
      }
      case 'deselect': this.select(null); break;
      case 'endbuild': this.endBuild(); break;
      case 'endmovepick': this.endMovePick(); break;
      case 'rotate': this.rotateBuild(); break;
      case 'skiptut':
        s.tutorial = -1;
        $('tutorial').classList.add('hidden');
        this.clearHighlight();
        break;
      // modallar
      case 'nextday': this.closeModal(); this.goNextDay(); break;
      case 'adbonus': this.rewardedBonus(el, +d.amount); break;
      case 'okmodal': this.closeModal(); break;
      case 'confirmyes': {
        const f = this._confirmYes;
        this._confirmYes = null;
        this.closeModal();
        if (f) f();
        break;
      }
      case 'newgame': this.closeModal(); G.resetGame(); break;
    }
  }

  // mode: false | 'appeal' (atmosfer) | 'usage' (alet kullanım yoğunluğu)
  toggleHeat(mode) {
    this.heatOn = mode;
    if (mode === 'appeal') {
      const vals = new Float32Array(G.sim.appeal.length);
      for (let k = 0; k < vals.length; k++) vals[k] = G.sim.appeal[k] / 22;
      G.world.showHeat(vals, G.sim.grid.inside);
    } else if (mode === 'usage') {
      // yoğun kullanılan = kırmızı, az kullanılan = yeşil; sadece aletlerin kapladığı karolar
      const vals = new Float32Array(G.sim.appeal.length);
      const mask = new Uint8Array(vals.length);
      const eq = G.state.items.filter(it => ITEMS[it.type].dur);
      const maxU = Math.max(1, ...eq.map(it => it.uses));
      for (const it of eq)
        for (const c of G.sim.cells(it.type, it.i, it.j, it.rot)) {
          const k = c.j * MAXW + c.i;
          vals[k] = 1 - it.uses / maxU;
          mask[k] = 1;
        }
      G.world.showHeat(vals, mask);
    } else G.world.showHeat(null);
  }

  // ===================== İNŞA MODU =====================
  startBuild(type) {
    this.endBuild();
    this.select(null);
    const ghost = makeGhost(type);
    G.world.root.add(ghost);
    this.build = { type, rot: (this.rotByType || {})[type] || 0, ghost, i: null, j: null, chk: null };
    $('panel').classList.add('hidden');
    this.renderBuildbar();
    if (this.lastPointer) this.updateGhost(this.lastPointer.x, this.lastPointer.y);
    else {
      const c = G.engine.target;
      this._placeGhostAt(c.x, c.z);
    }
  }

  startMove(it) {
    this.endBuild();
    const ghost = makeGhost(it.type);
    G.world.root.add(ghost);
    this.build = { type: it.type, rot: it.rot, ghost, move: it, i: null, j: null };
    it._mesh.visible = false;
    $('info').classList.add('hidden');
    G.world.showSelectionItem(null);
    this.renderBuildbar();
    const c = itemCenter(it);
    this._placeGhostAt(c.x, c.z);
  }

  renderBuildbar() {
    const b = this.build;
    const d = ITEMS[b.type];
    const price = b.move ? 0 : G.sim.priceOf(b.type);
    $('buildbar').innerHTML = `<img src="${this.thumbs[b.type] || ''}"><div><b>${b.move ? 'Taşınıyor: ' : ''}${d.name}</b>${b.move ? '' : ` · ${fmtMoney(price)}`}
      <div class="small muted" id="bb-reason">Yerleştirmek için tıkla</div></div>
      <button class="btn small" data-act="rotate">⟳ Döndür (R)</button><button class="btn small red" data-act="endbuild">✕ Bitir</button>`;
    $('buildbar').classList.remove('hidden');
  }

  updateGhost(sx, sy) {
    this.lastPointer = { x: sx, y: sy };
    const p = G.engine.screenToGround(sx, sy);
    if (!p) return;
    this._placeGhostAt(p.x, p.z);
  }

  _placeGhostAt(x, z, force) {
    const b = this.build;
    if (!b) return;
    const [w, d] = itemDims(b.type, b.rot);
    const i = Math.round(x - w / 2), j = Math.round(z - d / 2);
    if (!force && i === b.i && j === b.j) return;
    b.i = i;
    b.j = j;
    const tmp = { type: b.type, i, j, rot: b.rot };
    G.world.placeMesh(b.ghost, tmp);
    b.chk = G.sim.canPlace(b.type, i, j, b.rot, b.move || null);
    const afford = b.move || G.state.money >= G.sim.priceOf(b.type);
    const ok = b.chk.ok && afford;
    b.ghost.userData.setOk(ok);
    G.world.showFootprint(tmp, ok, b.chk.access);
    const r = $('bb-reason');
    if (r) {
      r.textContent = !afford ? 'Yeterli paran yok' : b.chk.ok ? 'Yerleştirmek için tıkla' : b.chk.reason;
      r.className = 'small ' + (ok ? 'muted' : 'badt');
    }
  }

  rotateBuild() {
    const b = this.build;
    if (!b) return;
    b.rot = (b.rot + 1) % 4;
    if (!b.move) (this.rotByType ||= {})[b.type] = b.rot;
    const c = { x: b.i + itemDims(b.type, (b.rot + 3) % 4)[0] / 2, z: b.j + itemDims(b.type, (b.rot + 3) % 4)[1] / 2 };
    b.i = null;
    this._placeGhostAt(c.x, c.z, true);
    G.audio.play('click');
  }

  endBuild() {
    const b = this.build;
    if (!b) return;
    G.world.root.remove(b.ghost);
    G.world.showFootprint(null);
    if (b.move && b.move._mesh) b.move._mesh.visible = true;
    this.build = null;
    $('buildbar').classList.add('hidden');
    if (this.panel === 'build') {
      $('panel').classList.remove('hidden');
      this.renderPanel();
    }
  }

  // M tuşu: seçili eşyayı taşı; seçili eşya yoksa "taşınacak eşyayı seç" moduna gir
  moveKey() {
    if (this.build && this.build.move) return;
    if (this.movePick) return this.endMovePick();
    if (this.selected && this.selected.item) return this.startMove(this.selected.item);
    if (this.build) this.endBuild();
    this.select(null);
    this.movePick = true;
    $('panel').classList.add('hidden');
    $('buildbar').innerHTML = `<div style="font-size:26px">✋</div><div><b>Taşıma modu</b><div class="small muted">Taşımak istediğin eşyaya tıkla · Esc: iptal</div></div>
      <button class="btn small red" data-act="endmovepick">✕ İptal</button>`;
    $('buildbar').classList.remove('hidden');
    G.audio.play('click');
  }

  endMovePick() {
    this.movePick = false;
    $('buildbar').classList.add('hidden');
    if (this.panel) $('panel').classList.remove('hidden');
  }

  pickItemAt(sx, sy) {
    for (const h of G.engine.pick(sx, sy, [G.world.itemGroup])) {
      const id = h.object.userData.itemId;
      const it = id && G.state.items.find(x => x.id === id);
      if (it) return it;
    }
    return null;
  }

  handleClick(sx, sy, pointerType) {
    if (this.movePick) {
      const it = this.pickItemAt(sx, sy);
      if (!it) {
        G.audio.play('error');
        return;
      }
      this.movePick = false;
      this.startMove(it);
      return;
    }
    if (this.build) {
      const b = this.build;
      const p = G.engine.screenToGround(sx, sy);
      if (!p) return;
      const [w, d] = itemDims(b.type, b.rot);
      const i = Math.round(p.x - w / 2), j = Math.round(p.z - d / 2);
      if (pointerType === 'touch' && (i !== b.i || j !== b.j)) {
        this._placeGhostAt(p.x, p.z);
        return;
      }
      this._placeGhostAt(p.x, p.z);
      if (!b.chk || !b.chk.ok) {
        G.audio.play('error');
        if (b.chk) this.notify(b.chk.reason, 'bad');
        return;
      }
      if (b.move) {
        const it = b.move;
        if (G.sim.moveItem(it, b.i, b.j, b.rot)) {
          this.build = null;
          G.world.root.remove(b.ghost);
          G.world.showFootprint(null);
          $('buildbar').classList.add('hidden');
          if (this.panel) $('panel').classList.remove('hidden');
          this.select({ item: it });
        }
        return;
      }
      const it = G.sim.placeItem(b.type, b.i, b.j, b.rot);
      if (it) {
        // aynı karede tekrar değerlendir
        this._placeGhostAt(p.x, p.z, true);
        if (G.state.money < G.sim.priceOf(b.type) || ITEMS[b.type].kind === 'reception') this.endBuild();
      }
      return;
    }
    // seçim
    const hitA = G.engine.pick(sx, sy, [G.world.agentGroup]);
    for (const h of hitA) {
      if (h.object.userData.agent && !h.object.userData.agent.gone) {
        this.select({ agent: h.object.userData.agent });
        return;
      }
    }
    const hitI = G.engine.pick(sx, sy, [G.world.itemGroup]);
    for (const h of hitI) {
      const id = h.object.userData.itemId;
      if (id) {
        const it = G.state.items.find(x => x.id === id);
        if (it) {
          this.select({ item: it });
          return;
        }
      }
    }
    this.select(null);
  }

  selectItem(it) {
    this.select({ item: it });
    const c = itemCenter(it);
    G.engine.focus(c.x, c.z);
  }

  select(sel) {
    this.selected = sel;
    G.world.showSelectionItem(sel && sel.item ? sel.item : null);
    G.world.selRing.visible = !!(sel && sel.agent);
    if (!sel) {
      $('info').classList.add('hidden');
      return;
    }
    G.audio.play('click');
    $('info').classList.remove('hidden');
    this.renderInfo(true);
  }

  renderInfo(force) {
    const sel = this.selected;
    if (!sel) return;
    let html = '';
    if (sel.item) {
      const it = sel.item;
      if (!G.state.items.includes(it)) return this.select(null);
      const d = ITEMS[it.type];
      const users = it._spots ? it._spots.filter(s => s.user).map(s => s.user.m.name) : [];
      html = `<div class="ih"><img src="${this.thumbs[it.type] || ''}"><div><h3>${d.name}</h3><div class="muted small">${CATEGORIES.find(c => c.id === d.cat).name}</div></div><button class="x" data-act="deselect">✕</button></div>
        <div class="muted small">${d.desc}</div>`;
      if (d.wear) {
        html += `<div class="kv"><span>Durum</span><b class="${it.broken ? 'bad' : it.cond < 40 ? 'warn' : ''}">${it.broken ? 'BOZUK 🔧' : Math.round(it.cond) + '%'}</b></div>${bar(it.cond / 100, it.cond < 40 ? 'red' : '')}
          <div class="kv"><span>Toplam kullanım</span><b>${it.uses}</b></div>`;
      }
      if (d.kind === 'shower' || d.kind === 'toilet') html += `<div class="kv"><span>Hijyen</span><b>${Math.round((1 - (it.dirt || 0)) * 100)}%</b></div>`;
      if (d.spots && d.cat !== 'decor') html += `<div class="kv"><span>Kullanan</span><b>${users.length ? esc(users.join(', ')) : 'Boş'}</b></div>`;
      if (d.kind === 'reception') html += `<div class="kv"><span>Sıradaki</span><b>${it._queue.length} kişi</b></div><div class="kv"><span>Görevli</span><b>${it._staff ? esc(it._staff.data.name) : '<span class="bad">Yok</span>'}</b></div>`;
      if (d.appeal && d.cat === 'decor') html += `<div class="kv"><span>Atmosfer</span><b>+${d.appeal} (${d.radius} m)</b></div>`;
      if (d.cooling) html += `<div class="kv"><span>Soğutma</span><b>${d.cooling}°C / 80 m²</b></div>`;
      if (d.power) html += `<div class="kv"><span>Güç</span><b>${d.power} kW</b></div>`;
      html += `<div class="row">
        <button class="btn small" data-act="move" title="Kısayol: M">✋ Taşı (M)</button>
        ${d.wear && (it.broken || it.cond < 70) ? `<button class="btn small green" data-act="repair">🔧 Servis (${fmtMoney(G.sim.repairCost(it))})</button>` : ''}
        <button class="btn small red" data-act="sell" title="Kısayol: Delete">💰 Sat (+${fmtMoney(G.sim.sellValue(it))})</button></div>`;
    } else if (sel.agent) {
      const a = sel.agent;
      if (a.gone || !a.ch) return this.select(null);
      if (a.kind === 'customer') {
        const sat = G.sim.computeSat(a);
        const m = a.m;
        const iss = Object.keys(a.issues).map(k => `<span class="chip bad" title="${esc(ISSUES[k].tip)}">${ISSUES[k].emoji} ${ISSUES[k].label}</span>`).join('');
        html = `<div class="ih"><div class="ava big">${m.look.g === 'f' ? '👩' : '👨'}</div><div><h3>${esc(m.name)}</h3><div class="muted small">${a.vip ? '⭐ Ünlü ziyaretçi' : a.walkin ? 'Günlük ziyaretçi (aday üye)' : `Üye · ${m.visits || 0}. ziyaret`}</div></div><button class="x" data-act="deselect">✕</button></div>
          <div class="kv"><span>Hedef</span><b>${GOALS[m.goal].name}</b></div>
          <div class="kv"><span>Ne yapıyor</span><b>${esc(a.status || '')}</b></div>
          <div class="kv"><span>Memnuniyet</span><b>${moodEmoji(sat)} ${sat}%</b></div>${bar(sat / 100, sat < 50 ? 'red' : '')}
          ${!a.walkin && !a.vip ? `<div class="kv"><span>Genel memnuniyet</span><b>${Math.round(m.sat)}%</b></div><div class="kv"><span>Üyelik yenileme</span><b>${m.renew - G.state.day} gün sonra</b></div>` : ''}
          <div class="kv"><span>Antrenman</span><b>${a.exDone} / ${a.plannedEx}</b></div>
          <div class="needs"><div><span>💧 Susuzluk</span>${bar(a.thirst, 'blue')}</div><div><span>🚻 Tuvalet</span>${bar(a.bladder, 'yellow')}</div><div><span>⚡ Enerji</span>${bar(a.energy)}</div><div><span>💦 Ter</span>${bar(a.sweat, 'blue')}</div></div>
          ${iss ? `<div class="chips">${iss}</div>` : ''}${a.coached ? '<div class="chip good">💪 Antrenörden destek aldı</div>' : ''}`;
      } else {
        const r = STAFF_ROLES[a.role];
        html = `<div class="ih"><div class="avatar" style="background:#${r.color.toString(16).padStart(6, '0')}">${r.icon}</div><div><h3>${esc(a.data.name)}</h3><div class="muted small">${r.name}</div></div><button class="x" data-act="deselect">✕</button></div>
          <div class="kv"><span>Yetenek</span><b class="stars">${stars(a.data.skill)}</b></div>
          <div class="kv"><span>Maaş</span><b>${fmtMoney(a.data.wage)}/gün</b></div>
          <div class="kv"><span>Ne yapıyor</span><b>${esc(a.status || '')}</b></div>
          <div class="muted small">${r.desc}</div>
          <div class="row"><button class="btn small red" data-act="firesel">İşten çıkar</button></div>`;
      }
    }
    if (html !== this._infoHtml || force) {
      this._infoHtml = html;
      $('info').innerHTML = html;
    }
  }

  // ===================== MODALLAR =====================
  openModal(html, cls = '') {
    $('modal').className = cls;
    $('modal').innerHTML = html;
    $('modal-wrap').classList.remove('hidden');
  }

  closeModal() {
    $('modal-wrap').classList.add('hidden');
  }

  // Tarayıcı confirm() yerine oyun içi onay penceresi
  confirm(html, onYes) {
    this._confirmYes = onYes;
    this.openModal(`<div class="evt"><h1>Emin misin?</h1><p>${html}</p>
      <div class="row center"><button class="btn big" data-act="okmodal">Vazgeç</button><button class="btn big red" data-act="confirmyes">Evet</button></div></div>`, 'small');
  }

  showDaySummary(r) {
    G.speedBeforeNight = G.speed || this.lastSpeed || 1;
    G.sdk.gameplayStop();
    if (this.build) this.endBuild();
    if (r.bankrupt) return this.showGameOver(r);
    const inc = Object.entries(r.income).map(([k, v]) => `<div class="kv"><span>${INCOME_NAMES[k] || k}</span><b class="good">+${fmtMoney(v)}</b></div>`).join('') || '<div class="muted">Gelir yok</div>';
    const exp = Object.entries(r.expense).map(([k, v]) => `<div class="kv"><span>${EXPENSE_NAMES[k] || k}</span><b class="bad">-${fmtMoney(v)}</b></div>`).join('') || '<div class="muted">Gider yok</div>';
    const comp = Object.entries(r.complaints).sort((a, b) => b[1] - a[1]).slice(0, 4)
      .map(([k, n]) => `<div class="cmprow"><span class="ce">${ISSUES[k].emoji}</span><div><b>${ISSUES[k].label}</b> <span class="muted">×${n}</span><div class="small">💡 ${ISSUES[k].tip}</div></div></div>`).join('') || '<div class="good">Hiç şikayet yok, harika! 🎉</div>';
    const rev = r.reviews.map(x => `<div class="review"><div class="rh"><b>${esc(x.name)}</b><span class="rv-stars s${x.stars}">${stars(x.stars)}</span></div>“${esc(x.text)}”</div>`).join('');
    const popular = Object.entries(r.exUse).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t, n]) => `${ITEMS[t].name} (${n})`).join(', ');
    const bonus = Math.max(150, Math.round(r.incomeTotal * 0.3));
    const repArrow = r.repDelta > 0.005 ? `<span class="good">▲ ${r.repDelta.toFixed(2)}</span>` : r.repDelta < -0.005 ? `<span class="bad">▼ ${Math.abs(r.repDelta).toFixed(2)}</span>` : '';
    const warn = r.negDays ? `<div class="warnbox">⚠️ Kasan eksiye düştü! ${5 - r.negDays} gün içinde toparlanmazsan iflas edeceksin. Kredi almayı veya gereksiz giderleri kısmayı düşün.</div>` : '';
    this.openModal(`
      <h1>🌙 Gün ${r.day} Raporu</h1>
      <div class="sumtop">
        <div class="big ${r.net >= 0 ? 'good' : 'bad'}">${fmtMoney(r.net, true)}<small>Günlük net</small></div>
        <div class="big">${r.visits}<small>Ziyaret</small></div>
        <div class="big">${r.members}<small>Üye <span class="good">+${r.newMembers}</span>${r.lost ? ` <span class="bad">-${r.lost}</span>` : ''}</small></div>
        <div class="big">${r.avgSat ? moodEmoji(r.avgSat) + ' ' + r.avgSat + '%' : '—'}<small>Memnuniyet</small></div>
        <div class="big">${r.rep.toFixed(2)}★<small>İtibar ${repArrow}</small></div>
      </div>
      ${warn}
      <div class="sect two"><div><h3>Gelirler</h3>${inc}</div><div><h3>Giderler</h3>${exp}</div></div>
      <div class="sect two"><div><h3>Şikayetler</h3>${comp}</div><div><h3>Bugünün yorumları</h3>${rev || '<div class="muted">Yorum bırakılmadı</div>'}</div></div>
      <div class="muted small">🧹 Temizlik %${r.clean}${popular ? ` · 🔥 En popüler: ${popular}` : ''}${r.renewed ? ` · 🔁 ${r.renewed} üyelik yenilendi` : ''}${r.turnedAway ? ` · 🚪 ${r.turnedAway} kişi geri döndü` : ''}${r.lostNames.length ? ` · 👋 Ayrılanlar: ${r.lostNames.map(esc).join(', ')}` : ''}</div>
      <div class="row center">
        ${G.sdk.adsAvailable ? `<button class="btn big purple" data-act="adbonus" data-amount="${bonus}">📺 Reklam izle: +${fmtMoney(bonus)}</button>` : ''}
        <button class="btn big green" data-act="nextday">☀️ Sonraki Gün</button>
      </div>`, 'summary');
    G.audio.play('day');
  }

  rewardedBonus(el, amount) {
    el.disabled = true;
    G.sdk.rewarded(ok => {
      if (ok) {
        G.state.money += amount;
        G.state.today.income.reward = (G.state.today.income.reward || 0) + amount;
        G.audio.play('cash');
        el.textContent = `✅ +${fmtMoney(amount)} eklendi`;
        this.updateTop();
        save();
      } else {
        el.textContent = 'Reklam şu an yok';
      }
    });
  }

  goNextDay() {
    const proceed = () => {
      G.sim.nextDay();
      G.speed = G.speedBeforeNight || 1;
      this.setSpeed(G.speed);
      this.refreshAll();
    };
    if (G.state.day % 3 === 0 && G.sdk.adsAvailable) G.sdk.midgame(proceed);
    else proceed();
  }

  showGameOver(r) {
    const s = G.state;
    this.openModal(`<h1>💸 İflas!</h1>
      <p>Kasan 5 gün boyunca ekside kaldı ve banka salonuna el koydu.</p>
      <div class="sumtop"><div class="big">${s.day}<small>Gün</small></div><div class="big">${s.stats.maxMembers}<small>Rekor üye</small></div><div class="big">${fmtMoney(s.stats.income)}<small>Toplam gelir</small></div><div class="big">${s.level}<small>Seviye</small></div></div>
      <div class="row center"><button class="btn big green" data-act="newgame">🔁 Yeniden Başla</button></div>`, 'summary');
    deleteSave();
  }

  levelUp(level) {
    G.audio.play('levelup');
    G.sdk.happytime();
    const items = Object.entries(ITEMS).filter(([, d]) => d.level === level);
    const roles = Object.values(STAFF_ROLES).filter(r => r.level === level);
    const mk = MARKETING.filter(m => m.level === level);
    const ex = EXPANSIONS.filter(e => e.level === level && e.cost);
    const list = [
      ...items.map(([t, d]) => `<div class="unl"><img src="${this.thumbs[t] || ''}"><span>${d.name}</span></div>`),
      ...roles.map(r => `<div class="unl"><div class="uicon">${r.icon}</div><span>${r.name}</span></div>`),
      ...mk.map(m => `<div class="unl"><div class="uicon">${m.icon}</div><span>${m.name}</span></div>`),
      ...ex.map(e => `<div class="unl"><div class="uicon">🏢</div><span>Genişleme ${e.w}×${e.d}</span></div>`),
    ].join('');
    const wasOpen = !$('modal-wrap').classList.contains('hidden');
    if (wasOpen) {
      this.notify(`🎉 Seviye ${level}! Yeni içerikler açıldı.`, 'good');
      return;
    }
    this.openModal(`<div class="lvlup"><div class="burst">⭐</div><h1>Seviye ${level}!</h1>
      ${list ? `<p>Yeni açılanlar:</p><div class="unls">${list}</div>` : '<p>Salonun büyümeye devam ediyor!</p>'}
      <div class="row center"><button class="btn big green" data-act="okmodal">Harika! 💪</button></div></div>`, 'small');
    if (this.panel) this.renderPanel();
  }

  showEvent(type) {
    const e = EVENTS[type];
    if (!$('modal-wrap').classList.contains('hidden')) {
      this.notify(`${e.icon} <b>${e.name}</b>: ${e.desc}`, 'info');
      return;
    }
    this.openModal(`<div class="evt"><div class="burst">${e.icon}</div><h1>${e.name}</h1><p>${e.desc}</p>
      <div class="row center"><button class="btn big" data-act="okmodal">Tamam</button></div></div>`, 'small');
    G.audio.play('notify');
  }

  // ===================== EĞİTİM =====================
  clearHighlight() {
    document.querySelectorAll('.pulse').forEach(e => e.classList.remove('pulse'));
  }

  updateTutorial(dt) {
    const s = G.state;
    if (s.tutorial < 0) return;
    const step = TUTORIAL[s.tutorial];
    if (!step) {
      s.tutorial = -1;
      $('tutorial').classList.add('hidden');
      this.clearHighlight();
      return;
    }
    this.tutT += dt;
    if (step.done(s, this.tutT)) {
      s.tutorial++;
      this.tutT = 0;
      this._tutRendered = -1;
      G.audio.play('goal');
      return;
    }
    if (this._tutRendered !== s.tutorial) {
      this._tutRendered = s.tutorial;
      $('tutorial').innerHTML = `<div class="tstep">${s.tutorial + 1}/${TUTORIAL.length}</div><div class="ttext">${step.text}</div><button class="btn small" data-act="skiptut">Eğitimi geç</button>`;
      $('tutorial').classList.remove('hidden');
      this.clearHighlight();
      if (step.target) $(step.target) && $(step.target).classList.add('pulse');
    }
  }

  // ===================== KARE GÜNCELLEMESİ =====================
  update(dt) {
    this.refreshT += dt;
    if (this.refreshT > 0.2) {
      this.refreshT = 0;
      this.updateTop();
      this.updateStatus();
      if (this.selected) this.renderInfo();
      // kartların alınabilirliği
      if (this.panel === 'build') {
        for (const c of $('panel').querySelectorAll('.card[data-price]')) c.classList.toggle('cant', +c.dataset.price > G.state.money);
      }
    }
    if (this.selected && this.selected.agent && this.selected.agent.ch) {
      const a = this.selected.agent;
      G.world.selRing.position.set(a.pos.x, (a.pos.z >= MAXD ? 0.08 : 0.03) + (a.y || 0), a.pos.z);
    }
    this.updateTutorial(dt);
  }
}
