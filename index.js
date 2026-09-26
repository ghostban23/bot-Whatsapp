const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const qrcode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 3000;

let latestQR = '';

app.get('/', async (req, res) => {
    if (latestQR) {
        if (latestQR.startsWith('CÓDIGO')) {
            res.send(`
                <html>
                    <head><title>Bot WhatsApp Pairing</title></head>
                    <body style="text-align:center; font-family:sans-serif; margin-top:50px;">
                        <h1>Código de Vinculación del Bot</h1>
                        <p>Usa este código en tu WhatsApp (Vincular con el número de teléfono):</p>
                        <h2 style="background: #f4f4f4; padding: 20px; display: inline-block; color: #25D366; font-size: 36px; letter-spacing: 5px;">${latestQR.replace('CÓDIGO DE VINCULACIÓN: ', '')}</h2>
                    </body>
                </html>
            `);
        } else {
            try {
                const qrImage = await qrcode.toDataURL(latestQR);
                res.send(`
                    <html>
                        <head>
                            <title>Bot WhatsApp QR</title>
                            <meta http-equiv="refresh" content="15">
                        </head>
                        <body style="text-align:center; font-family:sans-serif; margin-top:50px;">
                            <h1>Escanea el Código QR para el Bot</h1>
                            <p>Usa WhatsApp en tu teléfono para escanear este código:</p>
                            <img src="${qrImage}" alt="QR Code" style="margin-top: 20px; width: 300px; height: 300px;" />
                        </body>
                    </html>
                `);
            } catch (err) {
                res.send("<h1>Error al generar la imagen del QR</h1>");
            }
        }
    } else {
        res.send("<h1>¡El bot ya está conectado o procesando la sesión!</h1>");
    }
});

app.listen(PORT, () => {
    console.log(`Servidor web corriendo en el puerto ${PORT}`);
});

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ["Chrome", "Desktop", "120.0.0.0"]
    });

    sock.ev.on('creds.update', saveCreds);

    if (!sock.authState.creds.registered) {
        const phoneNumber = "18099891081"; // Reemplaza con tu número real con código de país (ej: 1809...)
        setTimeout(async () => {
            try {
                let code = await sock.requestPairingCode(phoneNumber);
                console.log(`CÓDIGO DE VINCULACIÓN: ${code}`);
                latestQR = `CÓDIGO DE VINCULACIÓN: ${code}`;
            } catch (error) {
                console.error("Error al solicitar el código de emparejamiento:", error);
            }
        }, 5000);
    }

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('¡Conectado exitosamente a WhatsApp!');
            latestQR = ''; 
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.key.fromMe && msg.message) {
            const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
            if (text && text.toLowerCase() === 'hola') {
                await sock.sendMessage(msg.key.remoteJid, { text: '¡Hola! Soy tu bot de WhatsApp corriendo en Render.' });
            }
        }
    });
}

connectToWhatsApp();
