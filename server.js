const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static('public'));

const players = new Map();

function broadcast(data) {
  const msg = JSON.stringify(data);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

wss.on('connection', (ws) => {
  const id = uuidv4();

  players.set(id, {
    id,
    x: 0,
    y: 1.8,
    z: 0,
    rotY: 0,
    health: 100
  });

  ws.send(JSON.stringify({
    type: 'init',
    id,
    players: Array.from(players.values())
  }));

  broadcast({
    type: 'player_join',
    player: players.get(id)
  });

  ws.on('message', (message) => {
    let data;
    try {
      data = JSON.parse(message);
    } catch {
      return;
    }

    if (data.type === 'update_state') {
      const p = players.get(id);
      if (!p) return;
      p.x = data.x;
      p.y = data.y;
      p.z = data.z;
      p.rotY = data.rotY;

      broadcast({
        type: 'player_state',
        player: p
      });
    }

    if (data.type === 'shoot') {
      broadcast({
        type: 'shot_fired',
        id,
        dir: data.dir,
        origin: data.origin
      });
    }

    if (data.type === 'hit') {
      const target = players.get(data.targetId);
      if (!target) return;
      target.health -= data.damage;
      if (target.health < 0) target.health = 0;

      broadcast({
        type: 'player_hit',
        player: target
      });
    }
  });

  ws.on('close', () => {
    players.delete(id);
    broadcast({
      type: 'player_leave',
      id
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('Server läuft auf Port ' + PORT);
});

