const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const fs = require('fs');
const path = require('path');

app.use(express.static(__dirname));

let widgetPositions = {};
const positionsPath = path.join(__dirname, 'positions.json');

// Загрузка сохраненных позиций виджетов
if (fs.existsSync(positionsPath)) {
    try { widgetPositions = JSON.parse(fs.readFileSync(positionsPath, 'utf8')); } catch (e) { widgetPositions = {}; }
}

// Полный пул из 195 стран мира для случайного выбора на тест-сервере
const ALL_COUNTRIES = require('./countries');

// Фиксированные неоновые цвета для ТОП-10 позиций (рангов)
const RANK_COLORS = [
    '#ffcc00', // 1 место - Желтый
    '#00ff55', // 2 место - Зеленый
    '#ff6600', // 3 место - Оранжевый
    '#00ccff', // 4 место - Голубой
    '#ff0033', // 5 место - Красный
    '#ffffff', // 6 место - Белый
    '#ff00aa', // 7 место - Розовый
    '#0055ff', // 8 место - Синий
    '#8b5a2b', // 9 место - Коричневый
    '#00f5d4'  // 10 место - Бирюзовый
];

let scores = {
    'BY': { country: 'BY', name: 'Беларусь', points: 2, color: '#ffcc00' },
    'RU': { country: 'RU', name: 'Россия', points: 1, color: '#00ff55' },
    'FR': { country: 'FR', name: 'Франция', points: 1, color: '#ff6600' },
    'PL': { country: 'PL', name: 'Польша', points: 1, color: '#00ccff' },
    'UA': { country: 'UA', name: 'Украина', points: 1, color: '#ff0033' }
}; // Изначально пустая база очков — страны появляются только при points > 0

// Сортировка, фильтрация нулей и динамическое распределение цветов по местам
function getSortedScores() {
    let activeScores = Object.values(scores).filter(s => s.points > 0);
    activeScores.sort((a, b) => b.points - a.points);
    return activeScores.map((s, index) => {
        s.color = index < RANK_COLORS.length ? RANK_COLORS[index] : '#bc00ff'; // 11+ места уходят в фиолетовый неон
        return s;
    });
}

// Сканирование музыкальной папки mp3/
function getMusicTracks() {
    const mp3Dir = path.join(__dirname, 'mp3');
    if (!fs.existsSync(mp3Dir)) return [];
    return fs.readdirSync(mp3Dir).filter(f => f.endsWith('.wav') || f.endsWith('.mp3')).sort();
}

io.on('connection', (socket) => {
    // Отправляем стартовые пакеты при подключении
    socket.emit('init_positions', widgetPositions);
    socket.emit('init_playlist', getMusicTracks());
    socket.emit('update_scores', getSortedScores());
    socket.emit('update_top_likers', tiktokModule.getTop3Likers());

    // Перемещение и масштабирование панелей
    socket.on('panel_move', (data) => {
        if (!data.panelId) return;
        widgetPositions[data.panelId] = { left: data.left, top: data.top, scale: data.scale || 1 };
        fs.writeFileSync(positionsPath, JSON.stringify(widgetPositions, null, 4));
        socket.broadcast.emit('panel_moved', data);
    });

    // Прием частот с ПК и трансляция (реле) на мобильные клиенты
    socket.on('audio_frequencies', (data) => {
        socket.broadcast.emit('stream_frequencies', data);
    });

    // Обработчик тестовых донатов админки
    socket.on('test_gift', (data) => {
        const giftType = data.giftType || 'Rose';
        let pointsToAdd = 1;
        if (giftType === 'Snail') pointsToAdd = 10;
        if (giftType === 'Donut') pointsToAdd = 30;
        if (giftType === 'Heart') pointsToAdd = 100;
        if (giftType === 'Galaxy') pointsToAdd = 1000;

        // Выбираем случайную страну из полного пула
        const randomCountry = ALL_COUNTRIES[Math.floor(Math.random() * ALL_COUNTRIES.length)];
        const code = randomCountry.code;

        if (!scores[code]) {
            scores[code] = { country: code, name: randomCountry.name, points: 0, color: '#ffffff' };
        }
        scores[code].points += pointsToAdd;

        io.emit('update_scores', getSortedScores());
    });
});

// Подключение модуля мини-игры «ПАТРИОТ!» (собственный секундный таймер стартует при загрузке модуля)
const initMiniGame = require('./minigame.js');
const miniGame = initMiniGame(io, scores, ALL_COUNTRIES, RANK_COLORS, getSortedScores);

// Подключение модуля связи с TikTok Live (чат, подарки, подсчёт зрителей)
const tiktokModule = require('./tiktok')(io, scores, ALL_COUNTRIES, getSortedScores, miniGame);

http.listen(3000, () => {
    console.log('📡 Спутниковый сервер запущен локально на порту 3000');
});
