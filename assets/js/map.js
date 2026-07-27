/*
  WebGIS Dusun Kebonrejo 3 - Version 6 Final
  Pembaruan: Juli 2026
*/

document.addEventListener('DOMContentLoaded', () => {
  // Pusat Kebonrejo 3
  const MAP_CENTER = [-7.5019, 110.2785];
  const MAP_ZOOM = 17;

  // 1. Ambil Data Lokasi
  const rawLocations = Array.isArray(window.KEBONREJO_LOCATIONS)
    ? window.KEBONREJO_LOCATIONS
    : (Array.isArray(window.lokasiData) ? window.lokasiData : []);

  // Normalisasi RT Function
  function normalizeRT(rtVal) {
    if (rtVal === null || rtVal === undefined) return '';
    const str = String(rtVal).toLowerCase().trim();
    const match = str.match(/\d+/);
    return match ? String(parseInt(match[0], 10)) : '';
  }

  // Validasi Koordinat
  function validCoordinates(item) {
    const lat = parseFloat(item.lat);
    const lng = parseFloat(item.lng || item.long);
    return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -8.5 && lat <= -6.5 && lng >= 109.5 && lng <= 111.5;
  }

  const locations = rawLocations.filter(validCoordinates);

  // 2. Inisialisasi Peta Leaflet
  const map = L.map('map', {
    zoomControl: true,
    scrollWheelZoom: true,
    doubleClickZoom: true,
    touchZoom: true,
    boxZoom: true,
    keyboard: true,
    dragging: true
  }).setView(MAP_CENTER, MAP_ZOOM);

  // Tambahkan Scale Bar (Metric Only)
  L.control.scale({
    metric: true,
    imperial: false,
    position: 'bottomleft'
  }).addTo(map);

  // 3. Basemaps
  const basemaps = {
    jalan: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 20,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors'
    }),
    satelit: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
    }),
    topografi: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
      maxZoom: 17,
      attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, SRTM | Map style &copy; <a href="https://opentopomap.org">OpenTopoMap</a>'
    })
  };

  let activeBasemap = basemaps.jalan;
  activeBasemap.addTo(map);

  basemaps.topografi.on('tileerror', (error) => {
    console.warn('[WebGIS Warning] Tile topografi tidak merespon. Mengalihkan ke basemap Jalan (OpenStreetMap).', error);
    if (activeBasemap === basemaps.topografi) {
      map.removeLayer(basemaps.topografi);
      basemaps.jalan.addTo(map);
      activeBasemap = basemaps.jalan;
      document.querySelectorAll('.basemap-button').forEach((b) => {
        b.classList.toggle('active', b.dataset.basemap === 'jalan');
      });
    }
  });

  // 4. Layer Groups
  const rtLayer = L.layerGroup().addTo(map);
  const markerLayer = L.layerGroup().addTo(map);

  const markerById = new Map();
  const rtLayerByNum = new Map();
  let rtGeoJsonLayer = null;
  let activeCategory = 'semua';
  let activeQuery = '';
  
  let rtBounds = null;
  const allDataBounds = L.latLngBounds();

  // Memusatkan Peta Berdasarkan Prioritas Boundary RT
  function fitMapToRT(options = {}) {
    const targetBounds = (rtBounds && rtBounds.isValid())
      ? rtBounds
      : (allDataBounds.isValid() ? allDataBounds : null);

    map.invalidateSize({ pan: false });

    if (targetBounds) {
      map.fitBounds(targetBounds, {
        paddingTopLeft: [45, 45],
        paddingBottomRight: [45, 45],
        maxZoom: 18,
        animate: options.animate === true,
        duration: options.animate ? 0.8 : undefined
      });
    } else {
      map.setView(MAP_CENTER, MAP_ZOOM, {
        animate: options.animate === true
      });
    }
  }

  // 5. Konfigurasi Warna & Ikon Kategori
  const categoryConfig = {
    'Pemerintahan': { color: '#2563eb', faIcon: 'fa-building-flag', fallbackIcon: '🏛' },
    'UMKM': { color: '#16a34a', faIcon: 'fa-bag-shopping', fallbackIcon: '🛍' },
    'Jasa': { color: '#ea580c', faIcon: 'fa-wrench', fallbackIcon: '🔧' },
    'Fasilitas Umum': { color: '#475569', faIcon: 'fa-house-chimney', fallbackIcon: '🌳' },
    'Tempat Ibadah': { color: '#9333ea', faIcon: 'fa-mosque', fallbackIcon: '🕌' },
    'Pendidikan': { color: '#dc2626', faIcon: 'fa-graduation-cap', fallbackIcon: '🏫' }
  };

  function getCategoryConfig(category) {
    return categoryConfig[category] || { color: '#334155', faIcon: 'fa-location-dot', fallbackIcon: '●' };
  }

  // Custom DivIcon Marker
  function createCustomMarkerIcon(item) {
    const config = getCategoryConfig(item.kategori || item.category);
    return L.divIcon({
      className: '',
      html: `
        <div class="custom-marker" style="background-color: ${config.color};">
          <span><i class="fa-solid ${config.faIcon}" onerror="this.outerHTML='${config.fallbackIcon}'"></i></span>
        </div>
      `,
      iconSize: [34, 34],
      iconAnchor: [17, 32],
      popupAnchor: [0, -30]
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Popup Content Marker
  function createMarkerPopupContent(item) {
    const name = escapeHtml(item.nama || item.name || 'Lokasi');
    const category = escapeHtml(item.kategori || item.category || 'Umum');
    const rtNorm = normalizeRT(item.rt);
    const rtDisplay = rtNorm ? `RT 0${rtNorm}` : escapeHtml(item.rt || '');
    const desc = escapeHtml(item.deskripsi || item.description || '');
    const mapsUrl = (item.linkMaps || '').trim();

    let html = `
      <div class="loc-popup">
        <h3 class="loc-popup__title">${name}</h3>
        <div class="loc-popup__meta">
          <span class="loc-popup__badge">${category}</span>
          ${rtDisplay ? `<span class="loc-popup__rt">${rtDisplay}</span>` : ''}
        </div>
    `;

    if (desc) {
      html += `<p class="loc-popup__desc">${desc}</p>`;
    }

    if (mapsUrl && (mapsUrl.startsWith('http://') || mapsUrl.startsWith('https://'))) {
      html += `
        <a class="loc-popup__btn" href="${escapeHtml(mapsUrl)}" target="_blank" rel="noopener noreferrer">
          <i class="fa-solid fa-map-location-dot"></i> Buka di Google Maps
        </a>
      `;
    }

    html += `</div>`;
    return html;
  }

  // Highlight Polygon RT tempat marker berada
  function highlightRTPolygon(rtNum) {
    if (!rtGeoJsonLayer) return;
    rtLayerByNum.forEach((layer, num) => {
      if (num === rtNum) {
        layer.setStyle({ fillOpacity: 0.45, weight: 4 });
        if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
          layer.bringToFront();
        }
      } else {
        rtGeoJsonLayer.resetStyle(layer);
      }
    });
  }

  function resetAllRTPolygons() {
    if (!rtGeoJsonLayer) return;
    rtLayerByNum.forEach((layer) => {
      rtGeoJsonLayer.resetStyle(layer);
    });
  }

  // Listener saat popup ditutup
  map.on('popupclose', () => {
    resetAllRTPolygons();
  });

  // Inisialisasi Marker
  locations.forEach((item) => {
    const lat = parseFloat(item.lat);
    const lng = parseFloat(item.lng || item.long);
    const marker = L.marker([lat, lng], { icon: createCustomMarkerIcon(item) })
      .bindPopup(createMarkerPopupContent(item), { maxWidth: 280 });

    const rtNorm = normalizeRT(item.rt);
    marker.on('click', () => {
      if (rtNorm) highlightRTPolygon(rtNorm);
    });

    const itemId = item.id || `${item.nama}-${lat}-${lng}`;
    markerById.set(itemId, marker);
    allDataBounds.extend([lat, lng]);
  });

  // Matching Logic
  function matches(item) {
    const itemCat = (item.kategori || item.category || '').toLowerCase();
    const categoryMatch = activeCategory === 'semua' || itemCat === activeCategory.toLowerCase();

    const rtNorm = normalizeRT(item.rt);
    const rtSearchable = rtNorm ? `rt ${rtNorm} rt 0${rtNorm}` : '';
    const haystack = `${item.nama || ''} ${item.name || ''} ${item.kategori || ''} ${item.category || ''} ${rtSearchable} ${item.deskripsi || ''} ${item.description || ''}`.toLowerCase();
    
    const queryMatch = !activeQuery || haystack.includes(activeQuery);
    return categoryMatch && queryMatch;
  }

  // Render List & Statistics
  const locationList = document.getElementById('locationList');
  const locationCount = document.getElementById('locationCount');
  const mapSidebar = document.getElementById('mapSidebar');

  // Update Statistics Sidebar
  function updateSidebarStatistics() {
    const statRtCount = document.getElementById('statRtCount');
    const statLocCount = document.getElementById('statLocCount');
    const statCatCount = document.getElementById('statCatCount');

    if (statRtCount) statRtCount.textContent = '4';
    if (statLocCount) statLocCount.textContent = locations.length;
    
    const uniqueCats = new Set(locations.map((item) => item.kategori || item.category));
    if (statCatCount) statCatCount.textContent = uniqueCats.size;
  }
  updateSidebarStatistics();

  function renderLocations() {
    markerLayer.clearLayers();
    locationList.innerHTML = '';

    const visibleItems = locations.filter(matches);

    visibleItems.forEach((item) => {
      const itemId = item.id || `${item.nama}-${item.lat}-${item.lng}`;
      const marker = markerById.get(itemId);
      if (marker) {
        marker.addTo(markerLayer);
      }

      const config = getCategoryConfig(item.kategori || item.category);
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'location-card';
      const rtNorm = normalizeRT(item.rt);
      const rtDisplay = rtNorm ? `RT 0${rtNorm}` : (item.rt || '');

      card.innerHTML = `
        <span class="location-card__icon" style="background-color: ${config.color}18; color: ${config.color};">
          <i class="fa-solid ${config.faIcon}" onerror="this.outerHTML='${config.fallbackIcon}'"></i>
        </span>
        <span class="location-card__info">
          <strong>${escapeHtml(item.nama || item.name)}</strong>
          <small><span class="badge-cat" style="background-color: ${config.color}15; color: ${config.color};">${config.fallbackIcon} ${escapeHtml(item.kategori || item.category)}</span> ${rtDisplay ? `· ${rtDisplay}` : ''}</small>
        </span>
      `;

      card.addEventListener('click', () => {
        const lat = parseFloat(item.lat);
        const lng = parseFloat(item.lng || item.long);

        // FlyTo Smooth Animation
        map.flyTo([lat, lng], 18, { duration: 1.0 });

        if (marker) {
          marker.openPopup();
        }
        if (rtNorm) {
          highlightRTPolygon(rtNorm);
        }
        if (window.innerWidth <= 900) {
          mapSidebar.classList.remove('open');
        }
      });

      locationList.appendChild(card);
    });

    locationCount.textContent = `${visibleItems.length} lokasi`;

    if (visibleItems.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.className = 'location-empty';
      emptyMsg.innerHTML = `
        <i class="fa-solid fa-magnifying-glass-location" style="font-size: 1.5rem; color: #8a968d; margin-bottom: 8px; display: block;"></i>
        <strong>Lokasi Tidak Ditemukan</strong>
        <p>Tidak ada titik lokasi yang sesuai dengan pencarian atau filter terpilih.</p>
      `;
      locationList.appendChild(emptyMsg);
    }
  }

  // 6. Color Scheme & Official RT Data
  const rtStyles = {
    "1": { color: '#0288d1', fillColor: '#0288d1' }, // RT 1: Biru
    "2": { color: '#fbc02d', fillColor: '#fbc02d' }, // RT 2: Kuning
    "3": { color: '#e65100', fillColor: '#ffb74d' }, // RT 3: Oranye
    "4": { color: '#7b1fa2', fillColor: '#ba68c8' }  // RT 4: Ungu
  };

  const rtOfficialInfo = {
    "1": { ketua: "Harno", penduduk: "176 jiwa", kk: "55 KK" },
    "2": { ketua: "Achmad Idris Abdurrahman", penduduk: "91 jiwa", kk: "27 KK" },
    "3": { ketua: "Achmad Mustanir", penduduk: "80 jiwa", kk: "35 KK" },
    "4": { ketua: "Suwarto", penduduk: "67 jiwa", kk: "34 KK" }
  };

  // Load GeoJSON Batas RT
  fetch('assets/data/batas-antar-rt.geojson')
    .then((res) => {
      if (!res.ok) throw new Error('File batas-antar-rt.geojson tidak ditemukan');
      return res.json();
    })
    .then((data) => {
      if (!data || !data.features) return;
      rtGeoJsonLayer = L.geoJSON(data, {
        style: (feature) => {
          const rtNum = normalizeRT(feature.properties ? feature.properties.rt : '');
          const s = rtStyles[rtNum] || { color: '#109c96', fillColor: '#55a78c' };
          return {
            color: s.color,
            weight: 2.5,
            opacity: 0.85,
            fillColor: s.fillColor,
            fillOpacity: 0.26,
            dashArray: ''
          };
        },
        onEachFeature: (feature, layer) => {
          const props = feature.properties || {};
          const rtNum = normalizeRT(props.rt);
          const rtTitle = rtNum ? `RT 0${rtNum}` : (props.rt || 'RT');

          if (rtNum) {
            rtLayerByNum.set(rtNum, layer);
          }

          const itemsInRT = locations.filter((loc) => normalizeRT(loc.rt) === rtNum);
          const info = rtOfficialInfo[rtNum] || { ketua: 'Ketua RT', penduduk: 'Data Penduduk', kk: 'Data KK' };

          // Permanent Label Badge di tengah polygon
          layer.bindTooltip(rtTitle, {
            permanent: true,
            direction: 'center',
            className: `rt-label rt-label--${rtNum}`,
            interactive: false
          });

          // Popup Polygon RT Informatif Resmi
          const popupContent = `
            <div class="rt-popup">
              <div class="rt-popup__header">
                <span class="rt-popup__badge">Wilayah Administrasi</span>
                <h3>Wilayah ${rtTitle}</h3>
              </div>
              <div class="rt-popup__info">
                <div class="rt-info-item"><strong>Ketua RT</strong><span>${escapeHtml(info.ketua)}</span></div>
                <div class="rt-info-item"><strong>Jumlah Penduduk</strong><span>${escapeHtml(info.penduduk)}</span></div>
                <div class="rt-info-item"><strong>Jumlah KK</strong><span>${escapeHtml(info.kk)}</span></div>
                <div class="rt-info-item"><strong>Lokasi Terdaftar</strong><span>${itemsInRT.length} Lokasi</span></div>
              </div>
            </div>
          `;
          layer.bindPopup(popupContent, { maxWidth: 260 });

          // Hover effect
          layer.on({
            mouseover: (e) => {
              const l = e.target;
              l.setStyle({ fillOpacity: 0.45, weight: 3.5 });
              if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
                l.bringToFront();
              }
            },
            mouseout: (e) => {
              rtGeoJsonLayer.resetStyle(e.target);
            }
          });
        }
      }).addTo(rtLayer);

      const polygonBounds = rtGeoJsonLayer.getBounds();
      if (polygonBounds.isValid()) {
        rtBounds = polygonBounds;
        allDataBounds.extend(polygonBounds);
      }

      // Pemusatan dua tahap rAF agar layout CSS selesai dihitung browser
      requestAnimationFrame(() => {
        map.invalidateSize({ pan: false });
        requestAnimationFrame(() => {
          fitMapToRT({ animate: false });
        });
      });
    })
    .catch((err) => {
      console.warn('[WebGIS Info] GeoJSON RT tidak dimuat:', err.message);
      requestAnimationFrame(() => {
        map.invalidateSize({ pan: false });
        requestAnimationFrame(() => {
          fitMapToRT({ animate: false });
        });
      });
    });

  // 7. Filter Kategori Event
  document.querySelectorAll('.filter-chip').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.filter-chip').forEach((b) => b.classList.remove('active'));
      button.classList.add('active');
      activeCategory = button.dataset.category || 'semua';
      renderLocations();
    });
  });

  // 8. Search Input Event
  const searchInput = document.getElementById('locationSearch');
  const clearSearch = document.getElementById('clearSearch');

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      activeQuery = searchInput.value.trim().toLowerCase();
      renderLocations();
    });
  }

  if (clearSearch) {
    clearSearch.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      activeQuery = '';
      renderLocations();
      if (searchInput) searchInput.focus();
    });
  }

  // 9. Basemap Button Event
  document.querySelectorAll('.basemap-button').forEach((button) => {
    button.addEventListener('click', () => {
      const selectedKey = button.dataset.basemap;
      const selected = basemaps[selectedKey];
      if (!selected || selected === activeBasemap) return;

      map.removeLayer(activeBasemap);
      selected.addTo(map);
      activeBasemap = selected;

      document.querySelectorAll('.basemap-button').forEach((b) => b.classList.remove('active'));
      button.classList.add('active');
    });
  });

  // 10. Layer Control Checkbox & Toggle All
  const layerMap = { rt: rtLayer, locations: markerLayer };
  
  function updateToggleAllButtonState() {
    const checkboxes = [...document.querySelectorAll('[data-layer]')];
    const toggleBtn = document.getElementById('toggleAllLayers');
    const allUnchecked = checkboxes.every((cb) => !cb.checked);
    if (toggleBtn) {
      toggleBtn.textContent = allUnchecked ? 'Tampilkan semua' : 'Sembunyikan semua';
    }
  }

  document.querySelectorAll('[data-layer]').forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      const layer = layerMap[checkbox.dataset.layer];
      if (!layer) return;
      if (checkbox.checked) {
        layer.addTo(map);
      } else {
        map.removeLayer(layer);
      }
      updateToggleAllButtonState();
    });
  });

  const toggleAllBtn = document.getElementById('toggleAllLayers');
  if (toggleAllBtn) {
    toggleAllBtn.addEventListener('click', () => {
      const checkboxes = [...document.querySelectorAll('[data-layer]')];
      const shouldShow = checkboxes.some((cb) => !cb.checked);
      checkboxes.forEach((cb) => {
        cb.checked = shouldShow;
        const layer = layerMap[cb.dataset.layer];
        if (layer) {
          if (shouldShow) layer.addTo(map); else map.removeLayer(layer);
        }
      });
      updateToggleAllButtonState();
    });
  }

  // 11. Action Buttons (Reset, Fullscreen, Locate)
  const resetBtn = document.getElementById('resetView');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      fitMapToRT({ animate: true });
    });
  }

  const fullscreenBtn = document.getElementById('fullscreenToggle');
  if (fullscreenBtn) {
    fullscreenBtn.addEventListener('click', () => {
      const mapApp = document.querySelector('.map-app') || document.documentElement;
      if (!document.fullscreenElement) {
        if (mapApp.requestFullscreen) {
          mapApp.requestFullscreen();
        } else if (mapApp.webkitRequestFullscreen) {
          mapApp.webkitRequestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
          document.webkitExitFullscreen();
        }
      }
    });
  }

  document.addEventListener('fullscreenchange', () => {
    map.invalidateSize({ pan: false });
  });

  const locateBtn = document.getElementById('locateMe');
  if (locateBtn) {
    locateBtn.addEventListener('click', () => {
      map.locate({ setView: true, maxZoom: 18 });
    });
  }

  map.on('locationfound', (e) => {
    L.circleMarker(e.latlng, { radius: 8, color: '#ffffff', weight: 3, fillColor: '#2563eb', fillOpacity: 1 })
      .addTo(map)
      .bindPopup('Lokasi Anda Saat Ini')
      .openPopup();
  });

  // 12. Mobile Sidebar Toggle Controls
  const sidebarToggle = document.getElementById('sidebarToggle');
  const sidebarClose = document.getElementById('sidebarClose');

  if (sidebarToggle && mapSidebar) {
    sidebarToggle.addEventListener('click', () => mapSidebar.classList.add('open'));
  }
  if (sidebarClose && mapSidebar) {
    sidebarClose.addEventListener('click', () => mapSidebar.classList.remove('open'));
  }

  // Initial Render
  renderLocations();

  // Pemusatan Ulang Pengaman Pasca Window Load
  window.addEventListener('load', () => {
    requestAnimationFrame(() => {
      map.invalidateSize({ pan: false });
      requestAnimationFrame(() => {
        fitMapToRT({ animate: false });
      });
    });
  });

  // Window Resize Listener (Debounced)
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      map.invalidateSize({ pan: false });
    }, 150);
  });
});
