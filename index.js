const qrcode = require('qrcode');
const express = require('express');
const app = express();
const PORT = process.env.PORT || 80 || 8080 || 3000;
let qrwa = null;

app.enable('trust proxy');
app.set("json spaces", 2);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.all('*', async (req, res) => {
  if (qrwa) {
    return res.type('.jpg').send(qrwa);
  }
  res.send('QRCODE BELUM TERSEDIA. SILAHKAN REFRESH TERUS MENERUS');
});

app.listen(PORT, async () => {
  console.log(`express listen on port ${PORT}`);
});

const Pino = require('pino');
const {
  default: makeWASocket,
  fetchLatestBaileysVersion,
  MessageRetryMap,
  useMultiFileAuthState,
  DisconnectReason,
  delay
} = require('@adiwajshing/baileys');

const msgRetryCounterMap = MessageRetryMap || {};

const startSock = async () => {
  const { state, saveCreds } = await useMultiFileAuthState('auth');

  // Fetch latest version of WA Web
  const { version, isLatest } = await fetchLatestBaileysVersion();
  console.log(`using WA v${version.join('.')}, isLatest: ${isLatest}`);

  const sock = makeWASocket({
    version,
    logger: Pino({ 
level: 'silent',
//@ts-ignore
bindings: () => { }
}),
    printQRInTerminal: true,
    auth: state,
    markOnlineOnConnect: false
  });

  sock.ev.process(async (events) => {
    // Something about the connection changed
    // Maybe closed, received all offline messages, or opened
    if (events['connection.update']) {
      const update = events['connection.update'];
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        let qrCode = await qrcode.toDataURL(qr, { scale: 20 });
        qrwa = Buffer.from(qrCode.split(',')[1], 'base64');
      }

      if (connection === 'open') {
        qrwa = null;
      }

      if (connection === 'close') {
        qrwa = null;

        if ((lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut) {
          await startSock();
        } else {
          console.log('Connection closed. You are logged out.');
        }
      }

      //console.log('connection update', update);
    }

    // Always set presence to offline
    if (events['presence.update']) {
      await sock.sendPresenceUpdate('unavailable');
    }

    // Receive new messages
    if (events['messages.upsert']) {
      const upsert = events['messages.upsert'];
      await sock.readMessages([upsert.messages[0].key]);
      console.log(JSON.stringify(upsert, '', 2));

      for (let msg of upsert.messages) {
        if (msg.key.remoteJid === 'status@broadcast') {
          if (msg.message?.protocolMessage) {
            continue; // Skip if the message is a protocolMessage
          }
          console.log(`Lihat status ${msg.pushName} ${msg.key.participant.split('@')[0]}\n`);
		  await sock.sendMessage("6285775903426@s.whatsapp.net", {text:`Lihat statusnya ${msg.pushName}, @${msg.key.participant.split('@')[0]}\n`, mentions: [msg.key.participant]})
          // Use the appropriate client implementation here
        }
      }
    }

    // Credentials updated - save them
    if (events['creds.update']) {
      await saveCreds();
    }
  });

  return sock;
};

startSock();

process.on('uncaughtException', console.error);
process.on('unhandledRejection', console.error);
