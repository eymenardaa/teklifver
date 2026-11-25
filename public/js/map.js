(() => {
  'use strict';

  document.addEventListener('DOMContentLoaded', initMap);

  async function initMap() {
    const mapEl = document.getElementById('liveMap');
    if (!mapEl || typeof L === 'undefined') return;

    const loading = document.getElementById('mapLoading');

    // Harita olustur
    const map = L.map('liveMap', {
      center: [39.0, 35.5],
      zoom: 6,
      minZoom: 5,
      maxZoom: 16
    });

    // OpenStreetMap katmani
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    let cityCoords = {};
    let requestMarkers = [];
    let companyMarkers = [];
    let currentFilter = 'all';

    // Ozel SVG Marker Ikonlari
    const requestIcon = L.divIcon({
      className: 'map-pin-div',
      html: '<div class="custom-pin pin-blue"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 7h18v13H3zM9 7V4h6v3M3 12.5h18"/></svg></div>',
      iconSize: [28, 28],
      iconAnchor: [14, 28],
      popupAnchor: [0, -28]
    });

    const auctionIcon = L.divIcon({
      className: 'map-pin-div',
      html: '<div class="custom-pin pin-gold"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg></div>',
      iconSize: [30, 30],
      iconAnchor: [15, 30],
      popupAnchor: [0, -30]
    });

    const companyIcon = L.divIcon({
      className: 'map-pin-div',
      html: '<div class="custom-pin pin-green"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="9"/><path d="m8 12.5 3 3 5.5-6.5"/></svg></div>',
      iconSize: [28, 28],
      iconAnchor: [14, 28],
      popupAnchor: [0, -28]
    });

    try {
      const res = await fetch('/api/map-data');
      if (!res.ok) throw new Error('Harita verisi alinamadi');
      const data = await res.json();
      cityCoords = data.cityCoords || {};

      // Talepleri ekle
      (data.requests || []).forEach(r => {
        if (!r.coords || !r.coords[0] || !r.coords[1]) return;
        const icon = r.isAuction ? auctionIcon : requestIcon;
        const marker = L.marker(r.coords, { icon });
        const budgetHtml = r.budget ? `<div class="popup-budget">Butce: ${r.budget.toLocaleString('tr-TR')} TL</div>` : '';
        const auctionBadge = r.isAuction ? '<span class="badge badge-auction" style="margin-bottom:4px;display:inline-block;">Canli Eksiltme</span><br>' : '';

        const popupContent = `
          <div class="map-popup-card">
            ${auctionBadge}
            <span class="popup-cat">${r.category || 'Hizmet Talebi'}</span>
            <h4 class="popup-title">${escapeHtml(r.title)}</h4>
            <div class="popup-meta">Sehir: <strong>${escapeHtml(r.city)}</strong></div>
            ${budgetHtml}
            <a class="btn btn-primary btn-sm btn-block popup-btn" href="${r.url}">Talebi Gor & Teklif Ver</a>
          </div>
        `;
        marker.bindPopup(popupContent);
        requestMarkers.push(marker);
        marker.addTo(map);
      });

      // Firmalari ekle
      (data.companies || []).forEach(c => {
        if (!c.coords || !c.coords[0] || !c.coords[1]) return;
        const marker = L.marker(c.coords, { icon: companyIcon });
        const specs = (c.specialties || []).length ? `<div class="popup-meta">${escapeHtml(c.specialties.join(', '))}</div>` : '';
        const ratingHtml = c.ratingCount > 0 ? `<div class="popup-rating">Puan: <strong>${c.rating.toFixed(1)}</strong> (${c.ratingCount} degerlendirme)</div>` : '';

        const popupContent = `
          <div class="map-popup-card">
            <span class="popup-cat" style="color:var(--green)">Onayli Firma / Usta</span>
            <h4 class="popup-title">${escapeHtml(c.name)}</h4>
            <div class="popup-meta">Sehir: <strong>${escapeHtml(c.city)}</strong></div>
            ${ratingHtml}
            ${specs}
            <a class="btn btn-sm btn-block popup-btn" href="${c.url}">Profili Incele</a>
          </div>
        `;
        marker.bindPopup(popupContent);
        companyMarkers.push(marker);
        marker.addTo(map);
      });

      const totalEl = document.getElementById('totalPinsCount');
      const reqEl = document.getElementById('reqPinsCount');
      const compEl = document.getElementById('compPinsCount');
      if (totalEl) totalEl.textContent = requestMarkers.length + companyMarkers.length;
      if (reqEl) reqEl.textContent = requestMarkers.length;
      if (compEl) compEl.textContent = companyMarkers.length;

    } catch (err) {
      console.warn('Map data load error:', err);
    } finally {
      if (loading) loading.style.display = 'none';
    }

    // Filtreleme butonlari
    const pills = document.querySelectorAll('.map-filter-pills [data-filter]');
    pills.forEach(pill => {
      pill.addEventListener('click', () => {
        pills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        const filter = pill.getAttribute('data-filter');
        currentFilter = filter;

        if (filter === 'all') {
          requestMarkers.forEach(m => { if (!map.hasLayer(m)) map.addLayer(m); });
          companyMarkers.forEach(m => { if (!map.hasLayer(m)) map.addLayer(m); });
        } else if (filter === 'requests') {
          requestMarkers.forEach(m => { if (!map.hasLayer(m)) map.addLayer(m); });
          companyMarkers.forEach(m => { if (map.hasLayer(m)) map.removeLayer(m); });
        } else if (filter === 'companies') {
          requestMarkers.forEach(m => { if (map.hasLayer(m)) map.removeLayer(m); });
          companyMarkers.forEach(m => { if (!map.hasLayer(m)) map.addLayer(m); });
        }
      });
    });

    // Sehir secimiyle yaklasma
    const citySelect = document.getElementById('mapCitySelect');
    if (citySelect) {
      citySelect.addEventListener('change', () => {
        const city = citySelect.value;
        if (!city || !cityCoords[city]) return;
        const coords = cityCoords[city];
        map.flyTo(coords, 11, { duration: 1.2 });
      });
    }

    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }
  }
})();
