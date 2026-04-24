const express = require('express');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'bookings.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- Configurazione Email (Nodemailer) ---
// Per far funzionare l'invio, imposta le variabili d'ambiente (es. in un file .env o nel sistema):
// SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: process.env.SMTP_PORT == 465, // true per 465, false per altre porte
  auth: {
    user: process.env.SMTP_USER || 'lorenzo.detrizio@puglia.cri.it',
    pass: process.env.SMTP_PASS || '!1971Idraulici1971!'
  }
});
async function sendConfirmationEmail(booking) {
  try {
    const info = await transporter.sendMail({
      from: `"Itinerari della Salute - CRI Molfetta" <${process.env.SMTP_USER || 'no-reply@example.com'}>`,
      to: booking.email,
      subject: 'Conferma Prenotazione - Itinerari della Salute',
      html: `
        <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">
          <div style="background-color: #d32f2f; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0; font-size: 24px;">Itinerari della Salute</h1>
          </div>
          <div style="padding: 20px;">
            <p>Gentile <strong>${booking.nome} ${booking.cognome}</strong>,</p>
            <p>La tua prenotazione per gli <strong>Itinerari della Salute</strong> organizzati dalla Croce Rossa Italiana (Comitato di Molfetta) è stata confermata con successo.</p>
            
            <div style="background-color: #f9f9f9; padding: 15px; border-left: 4px solid #d32f2f; margin: 20px 0;">
              <p style="margin: 5px 0;"><strong>Data:</strong> ${booking.date === '2026-05-09' ? 'Sabato 9 Maggio 2026' : 'Domenica 10 Maggio 2026'}</p>
              <p style="margin: 5px 0;"><strong>Orario:</strong> ${booking.time}</p>
            </div>
            
            <p>Ti ricordiamo di presentarti con qualche minuto di anticipo.</p>
            <p>A presto!</p>
          </div>
          <div style="background-color: #f1f1f1; color: #666; text-align: center; padding: 10px; font-size: 12px;">
            <p style="margin: 0;">Croce Rossa Italiana — Comitato di Molfetta</p>
          </div>
        </div>
      `
    });
    console.log('Email di conferma inviata: %s', info.messageId);
  } catch (error) {
    console.error('Errore durante l\\'invio dell\\'email:', error);
  }
}


// --- Generazione slot ---
function generateSlots() {
  const days = [
    { date: '2026-05-09', label: 'Sabato 9 Maggio 2026' },
    { date: '2026-05-10', label: 'Domenica 10 Maggio 2026' }
  ];

  const morningSlots = [];
  const afternoonSlots = [];

  // Mattina: 8:45 - 12:45 ogni 15 min
  for (let h = 8; h <= 12; h++) {
    for (let m = 0; m < 60; m += 15) {
      const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      if ((h === 8 && m < 45)) continue;
      if (h === 12 && m > 45) continue;
      morningSlots.push(time);
    }
  }

  // Pomeriggio: 15:15 - 18:45 ogni 15 min
  for (let h = 15; h <= 18; h++) {
    for (let m = 0; m < 60; m += 15) {
      const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      if (h === 15 && m < 15) continue;
      if (h === 18 && m > 45) continue;
      afternoonSlots.push(time);
    }
  }

  const slots = {};
  for (const day of days) {
    slots[day.date] = {
      label: day.label,
      morning: {},
      afternoon: {}
    };
    for (const t of morningSlots) {
      slots[day.date].morning[t] = null; // null = disponibile
    }
    for (const t of afternoonSlots) {
      slots[day.date].afternoon[t] = null;
    }
  }
  return slots;
}

// --- Carica o inizializza dati ---
function loadData() {
  if (fs.existsSync(DATA_FILE)) {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(raw);
  }
  const initial = { slots: generateSlots(), bookings: [] };
  saveData(initial);
  return initial;
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// --- API: ottenere disponibilità ---
app.get('/api/slots', (req, res) => {
  const data = loadData();
  // Restituisci solo lo stato disponibile/occupato, senza dati personali
  const result = {};
  for (const [date, dayData] of Object.entries(data.slots)) {
    result[date] = {
      label: dayData.label,
      morning: {},
      afternoon: {}
    };
    for (const [time, booking] of Object.entries(dayData.morning)) {
      result[date].morning[time] = booking !== null; // true = occupato
    }
    for (const [time, booking] of Object.entries(dayData.afternoon)) {
      result[date].afternoon[time] = booking !== null;
    }
  }

  // Controlla se tutti gli slot sono occupati
  let allBooked = true;
  for (const dayData of Object.values(result)) {
    for (const booked of Object.values(dayData.morning)) {
      if (!booked) { allBooked = false; break; }
    }
    if (!allBooked) break;
    for (const booked of Object.values(dayData.afternoon)) {
      if (!booked) { allBooked = false; break; }
    }
    if (!allBooked) break;
  }

  res.json({ slots: result, closed: allBooked });
});

// --- API: prenotazione ---
app.post('/api/book', (req, res) => {
  const { date, time, period, nome, cognome, dataNascita, email, telefono, consenso } = req.body;

  // Validazione
  if (!date || !time || !period || !nome || !cognome || !dataNascita || !email || !telefono) {
    return res.status(400).json({ error: 'Tutti i campi sono obbligatori.' });
  }
  if (!consenso) {
    return res.status(400).json({ error: 'È necessario acconsentire al trattamento dei dati personali.' });
  }

  const data = loadData();

  if (!data.slots[date]) {
    return res.status(400).json({ error: 'Data non valida.' });
  }
  if (!data.slots[date][period] || data.slots[date][period][time] === undefined) {
    return res.status(400).json({ error: 'Orario non valido.' });
  }
  if (data.slots[date][period][time] !== null) {
    return res.status(409).json({ error: 'Questo orario è già stato prenotato. Scegline un altro.' });
  }

  // Registra prenotazione
  const booking = {
    id: Date.now(),
    date,
    time,
    period,
    nome: nome.trim(),
    cognome: cognome.trim(),
    dataNascita,
    email: email.trim(),
    telefono: telefono.trim(),
    consenso: true,
    createdAt: new Date().toISOString()
  };

  data.slots[date][period][time] = booking.id;
  data.bookings.push(booking);
  saveData(data);

  // Invia l'email in background (non blocca la risposta)
  sendConfirmationEmail(booking);

  res.json({ success: true, message: 'Prenotazione confermata!', booking: { date, time, nome: booking.nome, cognome: booking.cognome } });
});

// --- API: admin - lista prenotazioni (protetto da query param) ---
app.get('/api/admin/bookings', (req, res) => {
  if (req.query.key !== 'crocerossa2026') {
    return res.status(403).json({ error: 'Accesso negato.' });
  }
  const data = loadData();
  res.json({ bookings: data.bookings });
});

// --- Avvio server ---
app.listen(PORT, () => {
  console.log(`\n  🏥 Itinerari della Salute - Croce Rossa Molfetta`);
  console.log(`  ✅ Server attivo su http://localhost:${PORT}`);
  console.log(`  📋 Admin: http://localhost:${PORT}/admin.html?key=crocerossa2025\n`);
});
