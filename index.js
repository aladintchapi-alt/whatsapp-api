const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const express = require('express');
const pino = require('pino');
const path = require('path');
const QRCode = require('qrcode'); // Ajout pour générer une image propre

const app = express();
app.use(express.json());

let sock = null;
let latestQr = null; // Stockera le dernier QR code reçu
let connectionStatus = "Déconnecté";

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, 'auth_info'));
    
    sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false // On désactive le terminal Render qui bugge
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            // Convertit le QR code en image (Base64) pour l'afficher sur le web
            latestQr = await QRCode.toDataURL(qr);
        }

        if (connection === 'close') {
            connectionStatus = "Déconnecté (Reconnexion...)";
            latestQr = null;
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) connectToWhatsApp();
        } else if (connection === 'open') {
            connectionStatus = "Connecté avec succès ✅";
            latestQr = null; // Plus besoin de QR code une fois connecté
            console.log('✅ Passerelle WhatsApp connectée avec succès !');
        }
    });
}

// Page d'accueil pour scanner le QR Code facilement depuis ton navigateur
app.get('/', (req, res) => {
    res.send(`
        <div style="text-align: center; font-family: Arial, sans-serif; margin-top: 50px;">
            <h2>Passerelle WhatsApp Multibusiness</h2>
            <p>Statut actuel : <strong>${connectionStatus}</strong></p>
            ${latestQr ? `
                <p>Scannez ce QR Code avec votre téléphone (WhatsApp > Appareils connectés) :</p>
                <img src="${latestQr}" style="border: 1px solid #ccc; padding: 10px; width: 300px;"/>
                <p style="color: red;">Le QR Code change toutes les 20 secondes.</p>
            ` : '<p>Si vous êtes connecté, aucun QR code ne s\'affiche.</p>'}
            <script>setTimeout(() => { location.reload(); }, 5000);</script>
        </div>
    `);
});

// Route HTTP pour ton site PHP
app.post('/send-message', async (req, res) => {
    const { numero, message } = req.body;
    if (!sock) return res.status(503).json({ error: "Passerelle non connectée." });

    try {
        const chatId = `${numero}@s.whatsapp.net`;
        await sock.sendMessage(chatId, { text: message });
        return res.json({ success: true, message: "Message envoyé !" });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Serveur actif sur le port ${PORT}`);
    connectToWhatsApp();
});
