// ===========================
// STATE
// ===========================
let slotsData = null;
let selectedDate = '2025-05-09';
let selectedTime = null;
let selectedPeriod = null;

// ===========================
// DOM ELEMENTS
// ===========================
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const stepIndicator = $('#step-indicator');
const step1 = $('#step-1');
const step2 = $('#step-2');
const step3 = $('#step-3');
const closedMessage = $('#closed-message');

const morningGrid = $('#morning-slots');
const afternoonGrid = $('#afternoon-slots');
const selectedSlotInfo = $('#selected-slot-info');
const selectedSlotText = $('#selected-slot-text');
const btnStep1Next = $('#btn-step1-next');
const btnStep2Back = $('#btn-step2-back');
const bookingForm = $('#booking-form');
const loadingOverlay = $('#loading-overlay');
const toast = $('#toast');

// ===========================
// INIT
// ===========================
document.addEventListener('DOMContentLoaded', () => {
  loadSlots();
  setupDayTabs();
  setupNavigation();
  setupForm();
});

// ===========================
// API CALLS
// ===========================
async function loadSlots() {
  showLoading(true);
  try {
    const res = await fetch('/api/slots');
    const data = await res.json();

    if (data.closed) {
      showClosedState();
      showLoading(false);
      return;
    }

    slotsData = data.slots;
    renderSlots();
    updateSlotCounts();
  } catch (err) {
    showToast('Errore di connessione al server.', 'error');
    console.error(err);
  }
  showLoading(false);
}

async function submitBooking(formData) {
  showLoading(true);
  try {
    const res = await fetch('/api/book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: selectedDate,
        time: selectedTime,
        period: selectedPeriod,
        ...formData
      })
    });

    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || 'Errore durante la prenotazione.', 'error');
      if (res.status === 409) {
        // Slot already taken, reload slots
        await loadSlots();
        goToStep(1);
      }
      showLoading(false);
      return;
    }

    // Success
    showConfirmation(formData);
    goToStep(3);
  } catch (err) {
    showToast('Errore di connessione. Riprova.', 'error');
    console.error(err);
  }
  showLoading(false);
}

// ===========================
// RENDERING
// ===========================
function renderSlots() {
  if (!slotsData || !slotsData[selectedDate]) return;

  const dayData = slotsData[selectedDate];

  // Clear grids
  morningGrid.innerHTML = '';
  afternoonGrid.innerHTML = '';

  // Morning slots
  for (const [time, booked] of Object.entries(dayData.morning)) {
    morningGrid.appendChild(createSlotButton(time, booked, 'morning'));
  }

  // Afternoon slots
  for (const [time, booked] of Object.entries(dayData.afternoon)) {
    afternoonGrid.appendChild(createSlotButton(time, booked, 'afternoon'));
  }

  // Reset selection if switching day
  if (selectedTime) {
    const current = document.querySelector(`.slot-btn.selected`);
    if (!current) {
      clearSelection();
    }
  }
}

function createSlotButton(time, booked, period) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `slot-btn ${booked ? 'booked' : 'available'}`;
  btn.textContent = time;
  btn.dataset.time = time;
  btn.dataset.period = period;

  if (booked) {
    btn.disabled = true;
    btn.title = 'Orario già prenotato';
  } else {
    btn.title = `Prenota alle ${time}`;
    btn.addEventListener('click', () => selectSlot(btn, time, period));

    // Highlight if previously selected
    if (selectedTime === time && selectedPeriod === period) {
      btn.classList.add('selected');
    }
  }

  return btn;
}

function updateSlotCounts() {
  if (!slotsData) return;

  for (const [date, dayData] of Object.entries(slotsData)) {
    const morningFree = Object.values(dayData.morning).filter(b => !b).length;
    const afternoonFree = Object.values(dayData.afternoon).filter(b => !b).length;
    const total = morningFree + afternoonFree;
    const countEl = $(`#count-${date}`);
    if (countEl) {
      countEl.textContent = total > 0 ? `${total} posti disponibili` : 'Completo';
      countEl.style.color = total > 0 ? '' : 'var(--text-muted)';
    }
  }
}

// ===========================
// SLOT SELECTION
// ===========================
function selectSlot(btn, time, period) {
  // Deselect previous
  $$('.slot-btn.selected').forEach(b => b.classList.remove('selected'));

  // Select new
  btn.classList.add('selected');
  selectedTime = time;
  selectedPeriod = period;

  // Show info
  const dayLabel = slotsData[selectedDate].label;
  selectedSlotText.textContent = `${dayLabel} — ore ${time}`;
  selectedSlotInfo.style.display = 'flex';

  // Enable next button
  btnStep1Next.disabled = false;
}

function clearSelection() {
  selectedTime = null;
  selectedPeriod = null;
  selectedSlotInfo.style.display = 'none';
  btnStep1Next.disabled = true;
  $$('.slot-btn.selected').forEach(b => b.classList.remove('selected'));
}

// ===========================
// DAY TABS
// ===========================
function setupDayTabs() {
  $$('.day-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.day-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      selectedDate = tab.dataset.date;
      clearSelection();
      renderSlots();
    });
  });
}

// ===========================
// STEP NAVIGATION
// ===========================
function setupNavigation() {
  btnStep1Next.addEventListener('click', () => {
    if (!selectedTime) return;
    goToStep(2);
  });

  btnStep2Back.addEventListener('click', () => {
    goToStep(1);
  });
}

function goToStep(step) {
  // Hide all sections
  [step1, step2, step3].forEach(s => s.style.display = 'none');

  // Update step indicators
  $$('.step').forEach((s, i) => {
    s.classList.remove('active', 'completed');
    if (i + 1 < step) s.classList.add('completed');
    if (i + 1 === step) s.classList.add('active');
  });

  // Show target section
  if (step === 1) {
    step1.style.display = 'block';
    stepIndicator.style.display = 'flex';
  }
  if (step === 2) {
    step2.style.display = 'block';
    stepIndicator.style.display = 'flex';
    // Focus first field
    setTimeout(() => $('#nome').focus(), 300);
  }
  if (step === 3) {
    step3.style.display = 'block';
    stepIndicator.style.display = 'flex';
  }

  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ===========================
// FORM
// ===========================
function setupForm() {
  bookingForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = {
      nome: $('#nome').value.trim(),
      cognome: $('#cognome').value.trim(),
      dataNascita: $('#dataNascita').value,
      email: $('#email').value.trim(),
      telefono: $('#telefono').value.trim(),
      consenso: $('#consenso').checked
    };

    // Validate
    if (!formData.nome || !formData.cognome || !formData.dataNascita || !formData.email || !formData.telefono) {
      showToast('Compila tutti i campi obbligatori.', 'error');
      return;
    }

    if (!formData.consenso) {
      showToast('Devi acconsentire al trattamento dei dati per procedere.', 'error');
      return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      showToast('Inserisci un indirizzo email valido.', 'error');
      return;
    }

    await submitBooking(formData);
  });
}

// ===========================
// CONFIRMATION
// ===========================
function showConfirmation(formData) {
  const dayLabel = slotsData[selectedDate].label;
  const periodLabel = selectedPeriod === 'morning' ? 'Mattina' : 'Pomeriggio';

  const details = $('#confirmation-details');
  details.innerHTML = `
    <div class="detail-row">
      <span class="detail-label">Nome</span>
      <span class="detail-value">${escapeHTML(formData.nome)} ${escapeHTML(formData.cognome)}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Data</span>
      <span class="detail-value">${dayLabel}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Orario</span>
      <span class="detail-value">${selectedTime} (${periodLabel})</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Email</span>
      <span class="detail-value">${escapeHTML(formData.email)}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Telefono</span>
      <span class="detail-value">${escapeHTML(formData.telefono)}</span>
    </div>
  `;
}

// ===========================
// CLOSED STATE
// ===========================
function showClosedState() {
  stepIndicator.style.display = 'none';
  step1.style.display = 'none';
  step2.style.display = 'none';
  step3.style.display = 'none';
  closedMessage.style.display = 'block';
}

// ===========================
// UTILITIES
// ===========================
function showLoading(show) {
  loadingOverlay.style.display = show ? 'flex' : 'none';
}

function showToast(message, type = 'error') {
  toast.textContent = message;
  toast.className = `toast ${type} show`;
  setTimeout(() => {
    toast.classList.remove('show');
  }, 4000);
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
