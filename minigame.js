// Отдельный модуль мини-игры «ПАТРИОТ!» (3 мин раунд / 2 мин перезарядка)
module.exports = function initMiniGame(io, scores, ALL_COUNTRIES, RANK_COLORS, getSortedScores) {
    const ROUND_DURATION = 180;   // 3 минуты активная игра (в секундах)
    const COOLDOWN_DURATION = 120; // 2 минуты перезарядка (в секундах)
    const USER_SPAM_COOLDOWN = 10000; // 10 секунд на человека

    let state = {
        phase: 'active', // 'active' или 'cooldown'
        timeLeft: ROUND_DURATION,
        countryPercents: {}, // { 'BY': 20, 'RU': 15 }
        userVotesCount: {},  // { 'User_1': { count: 2, country: 'BY', avatar: '', name: 'User_1' } }
        leaderCountry: null, // { code, name, percent, color }
        winnerData: null     // { name, avatar, countryName, color }
    };

    const lastPlusAction = {};  // Время последней команды +страна
    const lastMinusAction = {}; // Время последней команды -страна

    // Поиск страны по русскому названию (без учета регистра)
    function findCountryByName(inputName) {
        const clean = inputName.trim().toLowerCase();
        return ALL_COUNTRIES.find(c => c.name.toLowerCase() === clean);
    }

    // Расчет веса одного голоса от количества зрителей
    function getVoteWeight(viewerCount = 10) {
        if (viewerCount <= 15) return 10;
        if (viewerCount >= 500) return 0.5;
        return Number((10 - ((viewerCount - 15) / 485) * 9.5).toFixed(1));
    }

    // Определение текущего лидера шкалы и его цвета
    function updateLeader() {
        let maxPct = 0;
        let topCode = null;
        for (const [code, pct] of Object.entries(state.countryPercents)) {
            if (pct > maxPct) {
                maxPct = pct;
                topCode = code;
            }
        }
        if (!topCode || maxPct <= 0) {
            state.leaderCountry = null;
            return;
        }
        const countryObj = ALL_COUNTRIES.find(c => c.code === topCode);
        const sorted = getSortedScores();
        const rankIdx = sorted.findIndex(s => s.country === topCode);
        const color = rankIdx !== -1 && rankIdx < RANK_COLORS.length ? RANK_COLORS[rankIdx] : '#00ff55';

        state.leaderCountry = {
            code: topCode,
            name: countryObj ? countryObj.name : topCode,
            percent: Math.min(100, Math.round(maxPct)),
            color: color
        };
    }

    // Завершение раунда, награда +100 очков и выбор ПАТРИОТА
    function finishRound() {
        updateLeader();
        if (state.leaderCountry) {
            const winCode = state.leaderCountry.code;
            if (!scores[winCode]) {
                scores[winCode] = { country: winCode, name: state.leaderCountry.name, points: 0, color: state.leaderCountry.color };
            }
            scores[winCode].points += 100;
            io.emit('update_scores', getSortedScores());

            // Ищем самого активного игрока победившей страны
            let bestUser = null;
            for (const user of Object.values(state.userVotesCount)) {
                if (user.country === winCode) {
                    if (!bestUser || user.count > bestUser.count) {
                        bestUser = user;
                    }
                }
            }

            state.winnerData = {
                name: bestUser ? bestUser.name : 'Анонимный герой',
                avatar: bestUser ? bestUser.avatar : '',
                countryName: state.leaderCountry.name,
                color: state.leaderCountry.color
            };
        } else {
            state.winnerData = null;
        }

        state.phase = 'cooldown';
        state.timeLeft = COOLDOWN_DURATION;
        io.emit('minigame_state', state);
    }

    // Запуск нового раунда
    function startNewRound() {
        state.phase = 'active';
        state.timeLeft = ROUND_DURATION;
        state.countryPercents = {};
        state.userVotesCount = {};
        state.leaderCountry = null;
        state.winnerData = null;
        io.emit('minigame_state', state);
    }

    // Главный секундный таймер игры (стартует сразу при загрузке модуля, независимо от подключений)
    setInterval(() => {
        state.timeLeft--;
        if (state.timeLeft <= 0) {
            if (state.phase === 'active') {
                finishRound();
            } else {
                startNewRound();
            }
        }
        io.emit('minigame_timer', { phase: state.phase, timeLeft: state.timeLeft });
    }, 1000);

    // Обработка команды из чата (+страна или -страна)
    function handleChatCommand(userId, nickname, avatarUrl, text, viewerCount = 10) {
        if (state.phase !== 'active') return;
        const msg = text.trim();
        if (!msg.startsWith('+') && !msg.startsWith('-')) return;

        const isPlus = msg.startsWith('+');
        const rawCountry = msg.slice(1).trim();
        const countryObj = findCountryByName(rawCountry);
        if (!countryObj) return; // Страна не найдена в списке

        const now = Date.now();
        const actionMap = isPlus ? lastPlusAction : lastMinusAction;
        if (actionMap[userId] && (now - actionMap[userId] < USER_SPAM_COOLDOWN)) {
            return; // Кулдаун 10 секунд не прошел
        }
        actionMap[userId] = now;

        const weight = getVoteWeight(viewerCount);
        const code = countryObj.code;
        if (!state.countryPercents[code]) state.countryPercents[code] = 0;

        if (isPlus) {
            state.countryPercents[code] = Math.min(100, state.countryPercents[code] + weight);
        } else {
            state.countryPercents[code] = Math.max(0, state.countryPercents[code] - weight);
        }

        // Записываем вклад зрителя
        if (!state.userVotesCount[userId]) {
            state.userVotesCount[userId] = { count: 0, country: code, avatar: avatarUrl || '', name: nickname };
        }
        state.userVotesCount[userId].count += 1;
        state.userVotesCount[userId].country = code;

        updateLeader();

        // Определяем цвет страны проголосовавшего для кружка в очереди
        const sorted = getSortedScores();
        const rIdx = sorted.findIndex(s => s.country === code);
        const userCountryColor = rIdx !== -1 && rIdx < RANK_COLORS.length ? RANK_COLORS[rIdx] : '#00ffff';

        // Отправляем карточку зрителя в живую очередь в центр круга
        io.emit('minigame_vote_queue', {
            name: nickname,
            avatar: avatarUrl || '',
            countryName: countryObj.name,
            color: userCountryColor,
            isPlus: isPlus
        });

        io.emit('minigame_state', state);

        // Если кто-то набрал 100% до истечения 3 минут — досрочная победа!
        if (state.leaderCountry && state.leaderCountry.percent >= 100) {
            finishRound();
        }
    }

    // Голос подарком розочкой за 1 монету (без 10-секундного кулдауна)
    function handleGiftVote(userId, nickname, avatarUrl, countryObj, count, viewerCount) {
        if (state.phase !== 'active') return false;

        const weight = getVoteWeight(viewerCount);
        const code = countryObj.code;
        const addPercent = weight * count;
        if (!state.countryPercents[code]) state.countryPercents[code] = 0;
        state.countryPercents[code] = Math.min(100, state.countryPercents[code] + addPercent);

        // Личный счётчик вклада зрителя с привязкой к стране
        if (!state.userVotesCount[userId]) {
            state.userVotesCount[userId] = { count: 0, country: code, avatar: avatarUrl || '', name: nickname };
        }
        state.userVotesCount[userId].count += count;
        state.userVotesCount[userId].country = code;

        updateLeader();

        // Определяем цвет страны для кружка в очереди
        const sorted = getSortedScores();
        const rIdx = sorted.findIndex(s => s.country === code);
        const userCountryColor = rIdx !== -1 && rIdx < RANK_COLORS.length ? RANK_COLORS[rIdx] : '#00ffff';

        // Отправляем карточку зрителя в живую очередь в центр круга
        io.emit('minigame_vote_queue', {
            name: nickname,
            avatar: avatarUrl || '',
            countryName: countryObj.name,
            color: userCountryColor,
            isPlus: true
        });

        io.emit('minigame_state', state);

        // Если шкала достигла 100% — досрочная победа
        if (state.leaderCountry && state.leaderCountry.percent >= 100) {
            finishRound();
        }

        return true;
    }

    // Подключение сокетов
    io.on('connection', (socket) => {
        socket.emit('minigame_state', state);

        // Тестовая симуляция голоса из зеленой админки
        socket.on('test_minigame_vote', (data) => {
            const randomC = ALL_COUNTRIES[Math.floor(Math.random() * ALL_COUNTRIES.length)];
            const sign = data.sign || '+';
            const fakeId = 'test_user_' + Math.floor(Math.random() * 1000);
            handleChatCommand(fakeId, 'User_' + Math.floor(Math.random() * 999), '', sign + randomC.name, 10);
        });
    });

    return { handleChatCommand, handleGiftVote };
};
