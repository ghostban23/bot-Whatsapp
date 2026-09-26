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
                        <p>Usa WhatsApp en tu teléfono para escanear este código (se actualiza solo):</p>
                        <img src="${qrImage}" alt="QR Code" style="margin-top: 20px; width: 300px; height: 300px;" />
                    </body>
                </html>
            `);
        } catch (err) {
            res.send("<h1>Error al generar la imagen del QR</h1>");
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
        printQRInTerminal: true,
        logger: pino({ level: 'silent' })
    });

    sock.udarstven?.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            latestQR = qr;
            console.log('Nuevo QR generado');
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Conexión cerrada. Reconectando:', shouldReconnect);
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('¡Conectado exitosamente a WhatsApp!');
            latestQR = ''; 
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        console.log(JSON.stringify(m, undefined, 2));
        const msg = m.messages[0];
        if (!msg.key.fromMe && msg.message) {
            const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
            console.log(`Mensaje recibido: ${text}`);
            
            // Ejemplo de respuesta automática
            if (text && text.toLowerCase() === 'hola') {
                await sock.sendMessage(msg.key.remoteJid, { text: '¡Hola! Soy tu bot de WhatsApp corriendo en Render.' });
            }
        }
    });
}

connectToWhatsApp();
