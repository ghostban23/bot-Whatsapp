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

const messageTracker = {};
const consecutiveMessageTracker = {}; // Lleva la cuenta y guarda las llaves de los últimos 3 mensajes consecutivos

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
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Conexión cerrada. Reconectando...', shouldReconnect);
            if (shouldReconnect) {
                startBot();
            }
        } else if (connection === 'open') {
            console.log('¡Bot conectado exitosamente al WhatsApp!');
        }
    });

    // 1. Bienvenida profesional y personalizada
    sock.ev.on('group-participants.update', async (anu) => {
        if (anu.action === 'add') {
            try {
                const groupMetadata = await sock.groupMetadata(anu.id);
                const totalMembers = groupMetadata.participants.length;

                for (let user of anu.participants) {
                    const welcomeText = 
                        `╭━━━ 🧸 *Joseo24/7🧸* 🧸━━━╮\n` +
                        `┃ *[ SYSTEM NOTIFICATION ]*\n` +
                        `╰────────────────────────╯\n\n` +
                        `👋 ¡Bienvenid@ al búnker, @${user.split('@')[0]}!\n\n` +
                        `📌 TOMA ASIENTO Y RESPETA LA REGLAS 🥳\n\n` +
                        `📊 *Total miembros:* ${totalMembers}`;
                    
                    if (fs.existsSync('./logo.jpg')) {
                        await sock.sendMessage(anu.id, { 
                            image: fs.readFileSync('./logo.jpg'),
                            caption: welcomeText,
                            mentions: [user] 
                        });
                    } else {
                        await sock.sendMessage(anu.id, { 
                            text: welcomeText, 
                            mentions: [user] 
                        });
                    }
                }
            } catch (error) {
                console.log("No se pudo enviar la bienvenida:", error);
            }
        }
    });

    // 2. Control de Enlaces, Fotos/Videos normales, Spam y Anti-3 Mensajes Repetidos
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const remoteJid = msg.key.remoteJid; 
        const sender = msg.key.participant || msg.key.remoteJid; 
        const isGroup = remoteJid.endsWith('@g.us');

        if (!isGroup) return; 

        const messageText = msg.message.conversation || msg.message.extendedTextMessage?.text || '';

        // Anti-enlaces
        const inviteLinkRegex = /chat\.whatsapp\.com\/([0-9A-Za-z]{20,24})/i;
        if (inviteLinkRegex.test(messageText)) {
            try {
                await sock.sendMessage(remoteJid, { delete: msg.key });
                
                const warningText = 
                    `╭━━━ ⚠️ *Joseo24/7🧸* ⚠️ ━━━╮\n` +
                    `┃ *[ ALERTA DE SISTEMA ]*\n` +
                    `╰────────────────────────╯\n\n` +
                    `🚫 *NO ESTÁN PERMITIDOS LOS ENLACES EN ESTE GRUPO*\n` +
                    `👤 Usuario: @${sender.split('@')[0]}`;
                
                if (fs.existsSync('./logo.jpg')) {
                    await sock.sendMessage(remoteJid, { 
                        image: fs.readFileSync('./logo.jpg'),
                        caption: warningText,
                        mentions: [sender] 
                    });
                } else {
                    await sock.sendMessage(remoteJid, { 
                        text: warningText, 
                        mentions: [sender] 
                    });
                }
                return;
            } catch (error) {
                console.log("No se pudo procesar la eliminación del enlace:", error);
            }
        }

        // Anti-Fotos y Videos normales (Si no son de ver una sola vez, se eliminan automáticamente)
        const isImage = msg.message.imageMessage;
        const isVideo = msg.message.videoMessage;
        const isViewOnceImage = isImage && isImage.viewOnce;
        const isViewOnceVideo = isVideo && isVideo.viewOnce;

        if ((isImage && !isViewOnceImage) || (isVideo && !isViewOnceVideo)) {
            try {
                await sock.sendMessage(remoteJid, { delete: msg.key });

                const mediaWarning = 
                    `╭━━━ ⚠️ *Joseo24/7🧸* ⚠️ ━━━╮\n` +
                    `┃ *[ ALERTA DE SISTEMA ]*\n` +
                    `╰────────────────────────╯\n\n` +
                    `🚫 *LAS FOTOS Y VIDEOS SOLO ESTAN PERMITIDAS SI LA ENVIAS PARA VERLA 1 SOLA VEZ*\n` +
                    `👤 Usuario: @${sender.split('@')[0]}`;

                if (fs.existsSync('./logo.jpg')) {
                    await sock.sendMessage(remoteJid, { 
                        image: fs.readFileSync('./logo.jpg'),
                        caption: mediaWarning,
                        mentions: [sender] 
                    });
                } else {
                    await sock.sendMessage(remoteJid, { 
                        text: mediaWarning, 
                        mentions: [sender] 
                    });
                }
                return;
            } catch (error) {
                console.log("No se pudo eliminar la foto o video normal:", error);
            }
        }

        // Anti-3 Mensajes Seguidos Iguales (Elimina los 3 mensajes e Y expulsa inmediatamente)
        if (messageText.trim().length > 0) {
            if (!consecutiveMessageTracker[sender]) {
                consecutiveMessageTracker[sender] = { text: "", keys: [] };
            }

            const userRecord = consecutiveMessageTracker[sender];

            if (userRecord.text === messageText) {
                userRecord.keys.push(msg.key);

                // Si ya acumuló 3 mensajes iguales seguidos
                if (userRecord.keys.length >= 3) {
                    try {
                        // 1. Elimina los 3 mensajes uno por uno
                        for (let keyToDelete of userRecord.keys) {
                            await sock.sendMessage(remoteJid, { delete: keyToDelete });
                        }

                        // 2. Expulsa al usuario del grupo inmediatamente
                        await sock.groupParticipantsUpdate(remoteJid, [sender], "remove");

                        // 3. Envía la alerta de baneo con el logo indicando el nombre del grupo primero
                        const banWarning = 
                            `╭━━━ 🚨 *Joseo24/7🧸* 🚨 ━━━╮\n` +
                            `┃ *[ EXPULSIÓN DE SEGURIDAD ]*\n` +
                            `╰────────────────────────╯\n\n` +
                            `🚫 El usuario @${sender.split('@')[0]} fue expulsado por enviar el mismo mensaje 3 veces seguidas.`;

                        if (fs.existsSync('./logo.jpg')) {
                            await sock.sendMessage(remoteJid, { 
                                image: fs.readFileSync('./logo.jpg'),
                                caption: banWarning,
                                mentions: [sender] 
                            });
                        } else {
                            await sock.sendMessage(remoteJid, { 
                                text: banWarning, 
                                mentions: [sender] 
                            });
                        }

                        // Limpia el registro del usuario
                        delete consecutiveMessageTracker[sender];
                        return;
                    } catch (error) {
                        console.log("Error al aplicar la expulsión por 3 mensajes repetidos:", error);
                    }
                }
            } else {
                // Si cambia de texto, reinicia el contador con este nuevo mensaje
                consecutiveMessageTracker[sender] = { text: messageText, keys: [msg.key] };
            }
        }

        // Anti-Spam (Frecuencia rápida: más de 2 mensajes seguidos en menos de 3 segundos)
        const currentTime = Date.now();
        if (!messageTracker[sender]) {
            messageTracker[sender] = [];
        }

        messageTracker[sender] = messageTracker[sender].filter(timestamp => currentTime - timestamp < 3000);
        messageTracker[sender].push(currentTime);

        if (messageTracker[sender].length > 2) {
            try {
                await sock.sendMessage(remoteJid, { delete: msg.key });
            } catch (error) {
                console.log("No se pudo eliminar el mensaje por spam:", error);
            }
        }
    });
}

startBot();
