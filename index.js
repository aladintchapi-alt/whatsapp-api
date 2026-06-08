const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const express = require('express');
const pino = require('pino');
const path = require('path');

const app = express();
app.use(express.json());

let sock = null;

async function connectToWhatsApp() {
    // Dossier local temporaire sur Render pour stocker la session
    const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, 'auth_info'));
    
    sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true // Permet d'afficher le QR Code dans les logs Render
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) connectToWhatsApp();
        } else if (connection === 'open') {
            console.log('✅ Passerelle WhatsApp connectée avec succès !');
        }
    });
}

// Route API que app.multibusiness.cm va appeler
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
