const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

let latestQR = '';

app.get('/', (req, res) => {
    if (latestQR) {
        res.send(`
            <html>
                <head><title>Bot WhatsApp QR</title></head>
                <body style="text-align:center; font-family:sans-serif; margin-top:50px;">
                    <h1>Escanea el Código QR para el Bot</h1>
                    <p>Usa WhatsApp en tu teléfono para escanear este código:</p>
                    <pre style="font-size: 14px; background: #f4f4f4; padding: 20px; display: inline-block; text-align: left;">${latestQR}</pre>
                </body>
            </html>
        `);
    } else {
        res.send("<h1>El bot ya está conectado o procesando la sesión.</h1>");
    }
});

app.listen(PORT, () => {
    console.log(`Servidor web interno corriendo en el puerto ${PORT}`);
});

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const fs = require('fs');

const messagetracker = {};
const consecutiveMessageTracker = {};

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    
    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' })
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            latestQR = qr;
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const shouldReconnect = (new Boom(lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut);
            console.log('Conexión cerrada. Reconectando...', shouldReconnect);
            if (shouldReconnect) {
                startBot();
            }
        } else if (connection === 'open') {
            console.log('¡Bot conectado exitosamente al WhatsApp!');
            latestQR = ''; 
        }
    });
}

startBot();
